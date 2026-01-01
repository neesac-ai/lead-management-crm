/**
 * Campaign Assignment Management API
 * CRUD operations for campaign assignments
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

    // Verify integration exists and user has access
    let query = supabase
      .from('platform_integrations')
      .select('id, org_id')
      .eq('id', id);

    if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }

    const { data: integration, error: fetchError } = await query.single();

    if (fetchError || !integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    // Fetch campaign assignments
    const { data: assignments, error } = await supabase
      .from('campaign_assignments')
      .select(`
        *,
        assigned_user:users!campaign_assignments_assigned_to_fkey(id, name, email)
      `)
      .eq('integration_id', id)
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch campaign assignments', details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ assignments: assignments || [] });
  } catch (error) {
    console.error('Error fetching campaign assignments:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

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

    // Verify integration exists and user has access
    let query = supabase
      .from('platform_integrations')
      .select('id, org_id')
      .eq('id', id);

    if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }

    const { data: integration, error: fetchError } = await query.single();

    if (fetchError || !integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    const body = await request.json();
    const { campaign_id, campaign_name, assigned_to, is_active } = body;

    // Validate required fields
    if (!campaign_id || !campaign_name || !assigned_to) {
      return NextResponse.json(
        { error: 'Missing required fields: campaign_id, campaign_name, assigned_to' },
        { status: 400 }
      );
    }

    // Verify assigned user exists and is in same org
    const { data: assignedUser, error: userError } = await supabase
      .from('users')
      .select('id, org_id, role')
      .eq('id', assigned_to)
      .eq('org_id', profile.org_id)
      .single();

    if (userError || !assignedUser) {
      return NextResponse.json(
        { error: 'Assigned user not found or not in same organization' },
        { status: 400 }
      );
    }

    // Create or update campaign assignment (upsert)
    const { data: assignment, error } = await supabase
      .from('campaign_assignments')
      .upsert({
        org_id: profile.org_id,
        integration_id: id,
        campaign_id,
        campaign_name,
        assigned_to,
        is_active: is_active !== undefined ? is_active : true,
      }, {
        onConflict: 'org_id,integration_id,campaign_id',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to create campaign assignment', details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    console.error('Error creating campaign assignment:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

