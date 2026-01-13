/**
 * Fetch ad accounts accessible to the current integration token (Meta).
 * This updates integration.config.ad_accounts so the UI stays in sync without requiring reconnect.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserAdAccounts } from '@/lib/integrations/facebook-oauth';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Profile
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Admin-only (matches other integration management routes)
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Integration
    let query = supabase
      .from('platform_integrations')
      .select('*')
      .eq('id', id);

    if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }

    const { data: integration, error: fetchError } = await query.single();
    if (fetchError || !integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    const accessToken = (integration.credentials as any)?.access_token as string | undefined;
    if (!accessToken) {
      return NextResponse.json({ error: 'Integration not connected' }, { status: 400 });
    }

    // Fetch (paginated) ad accounts for this user token
    const adAccounts = await getUserAdAccounts(accessToken);

    const existingConfig = (integration.config || {}) as Record<string, unknown>;
    const currentSelected = existingConfig.ad_account_id as string | undefined;
    const stillExists = currentSelected ? adAccounts.some(a => a.id === currentSelected) : false;

    const nextConfig = {
      ...existingConfig,
      ad_accounts: adAccounts,
      ...(stillExists ? {} : { ad_account_id: adAccounts[0]?.id || null }),
    };

    const { error: updateError } = await supabase
      .from('platform_integrations')
      .update({ config: nextConfig } as never)
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update integration config' }, { status: 500 });
    }

    return NextResponse.json({
      ad_accounts: adAccounts,
      selected_ad_account_id: (nextConfig as any).ad_account_id ?? null,
    });
  } catch (error) {
    console.error('Error fetching ad accounts:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

