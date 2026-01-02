import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exchangeCodeForToken, getLongLivedToken, getUserAdAccounts } from '@/lib/integrations/facebook-oauth';
import { FacebookIntegration } from '@/lib/integrations/facebook';

type Integration = {
  id: string;
  org_id: string;
  platform: string;
  config: Record<string, unknown> | null;
  credentials: Record<string, unknown> | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const code = request.nextUrl.searchParams.get('code');
    const error = request.nextUrl.searchParams.get('error');
    const errorDescription = request.nextUrl.searchParams.get('error_description');
    const state = request.nextUrl.searchParams.get('state');

    // Get org slug from referer or construct from base URL
    const referer = request.headers.get('referer') || '';
    const orgSlugMatch = referer.match(/\/([^\/]+)\/integrations/);
    const orgSlug = orgSlugMatch ? orgSlugMatch[1] : 'neesac-ai';

    // Verify state matches integration ID
    if (state !== id) {
      return NextResponse.redirect(
        new URL(`/${orgSlug}/integrations/${id}?oauth=error&message=invalid_state`, request.url)
      );
    }

    if (error) {
      const message = errorDescription || error;
      return NextResponse.redirect(
        new URL(`/${orgSlug}/integrations/${id}?oauth=error&message=${encodeURIComponent(message)}`, request.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL(`/${orgSlug}/integrations/${id}?oauth=error&message=no_code`, request.url)
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(
        new URL(`/${orgSlug}/integrations/${id}?oauth=error&message=unauthorized`, request.url)
      );
    }

    // Get integration
    const { data: integration } = await supabase
      .from('platform_integrations')
      .select('*')
      .eq('id', id)
      .single();

    if (!integration) {
      return NextResponse.redirect(
        new URL(`/${orgSlug}/integrations/${id}?oauth=error&message=not_found`, request.url)
      );
    }

    const integrationData = integration as Integration;

    // Get Facebook App ID and App Secret from integration config
    const config = (integrationData.config || {}) as Record<string, unknown>;
    const appId = config.facebook_app_id as string;
    const appSecret = config.facebook_app_secret as string;

    if (!appId || !appSecret) {
      return NextResponse.redirect(
        new URL(`/${orgSlug}/integrations/${id}?oauth=error&message=app_credentials_missing`, request.url)
      );
    }

    // Exchange code for token
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
    const redirectUri = `${baseUrl}/api/integrations/${id}/oauth/callback`;
    
    const tokenData = await exchangeCodeForToken(code, redirectUri, appId, appSecret);
    
    // Exchange for long-lived token (60 days)
    const longLivedToken = await getLongLivedToken(tokenData.access_token, appId, appSecret);

    // Fetch user's ad accounts
    const adAccounts = await getUserAdAccounts(longLivedToken.access_token);
    
    if (adAccounts.length === 0) {
      return NextResponse.redirect(
        new URL(`/${orgSlug}/integrations/${id}?oauth=error&message=no_ad_accounts`, request.url)
      );
    }

    // Auto-select first ad account (user can change later)
    const selectedAdAccount = adAccounts[0];

    // Fetch campaigns for the selected ad account
    let campaigns: Array<{ id: string; name: string }> = [];
    try {
      const facebookIntegration = new FacebookIntegration();
      campaigns = await facebookIntegration.fetchCampaigns(
        { access_token: longLivedToken.access_token },
        { ad_account_id: selectedAdAccount.id }
      );
    } catch (campaignError) {
      console.error('Error fetching campaigns:', campaignError);
      // Don't fail the OAuth flow if campaigns fail
    }

    // Update integration with credentials
    // Preserve existing config (including facebook_app_id and facebook_app_secret)
    const existingConfig = (integrationData.config || {}) as Record<string, unknown>;
    
    const updateData: Record<string, unknown> = {
      credentials: {
        access_token: longLivedToken.access_token,
        token_expires_at: longLivedToken.expires_in 
          ? new Date(Date.now() + longLivedToken.expires_in * 1000).toISOString()
          : null,
      },
      config: {
        ...existingConfig, // Preserve facebook_app_id and facebook_app_secret
        ad_account_id: selectedAdAccount.id,
        ad_accounts: adAccounts,
        available_campaigns: campaigns,
        selected_campaigns: [], // User will select these
      },
      sync_status: 'idle',
      error_message: null,
    };
    
    const { error: updateError } = await supabase
      .from('platform_integrations')
      .update(updateData as never)
      .eq('id', id);

    if (updateError) {
      console.error('Error updating integration:', updateError);
      return NextResponse.redirect(
        new URL(`/${orgSlug}/integrations/${id}?oauth=error&message=update_failed`, request.url)
      );
    }

    return NextResponse.redirect(
      new URL(`/${orgSlug}/integrations/${id}?oauth=success`, request.url)
    );
  } catch (error) {
    console.error('OAuth callback error:', error);
    const { id } = await params;
    const referer = request.headers.get('referer') || '';
    const orgSlugMatch = referer.match(/\/([^\/]+)\/integrations/);
    const orgSlug = orgSlugMatch ? orgSlugMatch[1] : 'neesac-ai';
    
    return NextResponse.redirect(
      new URL(
        `/${orgSlug}/integrations/${id}?oauth=error&message=${encodeURIComponent(error instanceof Error ? error.message : 'unknown_error')}`,
        request.url
      )
    );
  }
}

