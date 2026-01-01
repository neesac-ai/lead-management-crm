/**
 * Campaign Assignment Management API - Single Assignment
 * Update or delete a specific campaign assignment
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const { id, assignmentId } = await params;
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

    // Verify assignment exists and user has access
    const { data: assignment, error: fetchError } = await supabase
      .from('campaign_assignments')
      .select('*')
      .eq('id', assignmentId)
      .eq('integration_id', id)
      .eq('org_id', profile.org_id)
      .single();

    if (fetchError || !assignment) {
      return NextResponse.json({ error: 'Campaign assignment not found' }, { status: 404 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.campaign_name !== undefined) updateData.campaign_name = body.campaign_name;
    if (body.assigned_to !== undefined) {
      // Verify assigned user exists and is in same org
      const { data: assignedUser, error: userError } = await supabase
        .from('users')
        .select('id, org_id')
        .eq('id', body.assigned_to)
        .eq('org_id', profile.org_id)
        .single();

      if (userError || !assignedUser) {
        return NextResponse.json(
          { error: 'Assigned user not found or not in same organization' },
          { status: 400 }
        );
      }

      updateData.assigned_to = body.assigned_to;
    }
    if (body.is_active !== undefined) updateData.is_active = body.is_active;

    // Update assignment
    const { data: updatedAssignment, error } = await supabase
      .from('campaign_assignments')
      .update(updateData)
      .eq('id', assignmentId)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update campaign assignment', details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ assignment: updatedAssignment });
  } catch (error) {
    console.error('Error updating campaign assignment:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const { id, assignmentId } = await params;
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

    // Verify assignment exists and user has access
    const { data: assignment, error: fetchError } = await supabase
      .from('campaign_assignments')
      .select('*')
      .eq('id', assignmentId)
      .eq('integration_id', id)
      .eq('org_id', profile.org_id)
      .single();

    if (fetchError || !assignment) {
      return NextResponse.json({ error: 'Campaign assignment not found' }, { status: 404 });
    }

    // Delete assignment
    const { error } = await supabase
      .from('campaign_assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to delete campaign assignment', details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Campaign assignment deleted successfully' });
  } catch (error) {
    console.error('Error deleting campaign assignment:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

