/**
 * Integration Management API - Single Integration
 * Get, update, delete a specific integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
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

    // Fetch integration
    let query = supabase
      .from('platform_integrations')
      .select('*')
      .eq('id', id);

    if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }

    const { data: integration, error } = await query.single();

    if (error || !integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    return NextResponse.json({ integration });
  } catch (error) {
    console.error('Error fetching integration:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

    // Verify integration exists and user has access
    let query = supabase
      .from('platform_integrations')
      .select('id, org_id')
      .eq('id', id);

    if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }

    const { data: existingIntegration, error: fetchError } = await query.single();

    if (fetchError || !existingIntegration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    // Allow updating these fields
    if (body.name !== undefined) updateData.name = body.name;
    if (body.credentials !== undefined) updateData.credentials = body.credentials;
    if (body.config !== undefined) updateData.config = body.config;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.webhook_secret !== undefined) {
      updateData.webhook_secret = body.webhook_secret;
      // Update webhook URL if secret changed
      const baseUrl = process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL || 
                     process.env.NEXT_PUBLIC_SITE_URL || 
                     'https://yourdomain.com';
      const { data: integration } = await supabase
        .from('platform_integrations')
        .select('platform')
        .eq('id', id)
        .single();
      
      if (integration) {
        updateData.webhook_url = `${baseUrl}/api/integrations/webhooks/${integration.platform}?secret=${body.webhook_secret || ''}`;
      }
    }

    // Update integration
    const { data: integration, error } = await supabase
      .from('platform_integrations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update integration', details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ integration });
  } catch (error) {
    console.error('Error updating integration:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    // Verify integration exists and user has access
    let query = supabase
      .from('platform_integrations')
      .select('id, org_id')
      .eq('id', id);

    if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }

    const { data: existingIntegration, error: fetchError } = await query.single();

    if (fetchError || !existingIntegration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    // Delete integration (cascade will handle related records)
    const { error } = await supabase
      .from('platform_integrations')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to delete integration', details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Integration deleted successfully' });
  } catch (error) {
    console.error('Error deleting integration:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

