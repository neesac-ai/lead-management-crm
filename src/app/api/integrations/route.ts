/**
 * Integration Management API
 * List and create platform integrations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

/**
 * Generate a secure random secret for webhook verification
 * Uses crypto.randomBytes for cryptographically secure randomness
 */
function generateSecureSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function GET(request: NextRequest) {
  try {
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

    // Get org_id and platform from query params or use user's org
    const orgId = request.nextUrl.searchParams.get('org_id') || profile.org_id;
    const platform = request.nextUrl.searchParams.get('platform');

    // Check permissions (admin or super_admin)
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Super admin can view all, admin can only view their org
    let query = supabase
      .from('platform_integrations')
      .select('*')
      .order('created_at', { ascending: false });

    if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    } else if (orgId) {
      query = query.eq('org_id', orgId);
    }

    // Filter by platform if provided
    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data: integrations, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch integrations', details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ integrations: integrations || [] });
  } catch (error) {
    console.error('Error fetching integrations:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json();
    const { platform, name, credentials, config, webhook_secret } = body;

    // Validate required fields
    if (!platform || !name || !profile.org_id) {
      return NextResponse.json(
        { error: 'Missing required fields: platform, name' },
        { status: 400 }
      );
    }

    // Validate platform
    const validPlatforms = ['facebook', 'whatsapp', 'linkedin', 'instagram'];
    if (!validPlatforms.includes(platform)) {
      return NextResponse.json(
        { error: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}` },
        { status: 400 }
      );
    }

    // Auto-generate webhook secret if not provided
    // This ensures webhooks work immediately without requiring user input
    const finalWebhookSecret = webhook_secret || generateSecureSecret();

    // Generate webhook URL
    const baseUrl = process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL || 
                   process.env.NEXT_PUBLIC_SITE_URL || 
                   'https://yourdomain.com';
    const webhookUrl = `${baseUrl}/api/integrations/webhooks/${platform}?secret=${finalWebhookSecret}`;

    // Create integration
    const { data: integration, error } = await supabase
      .from('platform_integrations')
      .insert({
        org_id: profile.org_id,
        platform,
        name,
        credentials: credentials || {},
        config: config || {},
        webhook_url: webhookUrl,
        webhook_secret: finalWebhookSecret,
        is_active: true,
        sync_status: 'idle',
      })
      .select()
      .single();

    if (error) {
      console.error('Database error creating integration:', error);
      return NextResponse.json(
        { 
          error: 'Failed to create integration', 
          details: error.message || error,
          code: error.code,
          hint: error.hint
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ integration }, { status: 201 });
  } catch (error) {
    console.error('Error creating integration:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
        hint: 'Make sure migration 028_platform_integrations.sql has been run'
      },
      { status: 500 }
    );
  }
}

