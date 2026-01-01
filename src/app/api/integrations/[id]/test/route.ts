/**
 * Test Integration Connection API
 * Tests the connection to the platform using provided credentials
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getIntegrationInstance } from '@/lib/integrations/factory';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Check permissions (admin only)
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch integration
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

    // Get integration instance based on platform
    let integrationInstance;
    try {
      integrationInstance = getIntegrationInstance(integration.platform);
    } catch (error) {
      return NextResponse.json(
        { error: `Unsupported platform: ${integration.platform}` },
        { status: 501 }
      );
    }

    // Test connection
    const result = await integrationInstance.testConnection(
      integration.credentials as Record<string, unknown>,
      integration.config as Record<string, unknown>
    );

    // Update integration sync status
    if (result.success) {
      await supabase
        .from('platform_integrations')
        .update({
          sync_status: 'idle',
          error_message: null,
        })
        .eq('id', id);
    } else {
      await supabase
        .from('platform_integrations')
        .update({
          sync_status: 'error',
          error_message: result.message || 'Connection test failed',
        })
        .eq('id', id);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error testing integration connection:', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

