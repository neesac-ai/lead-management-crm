import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getFacebookAuthUrl } from '@/lib/integrations/facebook-oauth';

type Integration = {
  id: string;
  org_id: string;
  platform: string;
  config: Record<string, unknown> | null;
};

type UserProfile = {
  role: string;
  org_id: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Verify user and integration
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role, org_id')
      .eq('auth_id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const userProfile = profile as UserProfile;

    if (userProfile.role !== 'admin' && userProfile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get integration
    const { data: integration } = await supabase
      .from('platform_integrations')
      .select('*')
      .eq('id', id)
      .eq('org_id', userProfile.org_id)
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    const integrationData = integration as Integration;

    if (integrationData.platform !== 'facebook' && integrationData.platform !== 'instagram') {
      return NextResponse.json({ error: 'OAuth only available for Facebook/Instagram' }, { status: 400 });
    }

    // Get Facebook App ID and App Secret from integration config
    const config = (integrationData.config || {}) as Record<string, unknown>;
    const appId = config.facebook_app_id as string;
    const appSecret = config.facebook_app_secret as string;

    if (!appId || !appSecret) {
      return NextResponse.json(
        { error: 'Facebook App ID and App Secret must be configured in Settings before connecting' },
        { status: 400 }
      );
    }

    // Generate OAuth URL
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ||
                   process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL ||
                   request.nextUrl.origin;
    const redirectUri = `${baseUrl}/api/integrations/${id}/oauth/callback`;

    const authUrl = getFacebookAuthUrl(id, redirectUri, appId);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('Error initiating OAuth:', error);
    return NextResponse.json(
      { error: 'Failed to initiate OAuth', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
