/**
 * Lead Form Assignment Management API - Single Assignment
 * Update / delete a specific lead form assignment
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Ensure assignment belongs to this integration/org
    const { data: existing, error: existingError } = await supabase
      .from('lead_form_assignments')
      .select('id, org_id, integration_id')
      .eq('id', assignmentId)
      .eq('integration_id', id)
      .eq('org_id', profile.org_id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};
    if (body.assigned_to !== undefined) updateData.assigned_to = body.assigned_to;
    if (body.form_name !== undefined) updateData.form_name = body.form_name;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;

    const { data: updated, error } = await supabase
      .from('lead_form_assignments')
      .update(updateData)
      .eq('id', assignmentId)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update assignment', details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ assignment: updated });
  } catch (error) {
    console.error('Error updating lead form assignment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const { id, assignmentId } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('lead_form_assignments')
      .delete()
      .eq('id', assignmentId)
      .eq('integration_id', id)
      .eq('org_id', profile.org_id);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to delete assignment', details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Assignment deleted' });
  } catch (error) {
    console.error('Error deleting lead form assignment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


