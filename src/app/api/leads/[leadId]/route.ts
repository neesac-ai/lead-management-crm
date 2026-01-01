import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const { leadId } = await params

    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get caller's profile
    const { data: callerProfile } = await supabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', authUser.id)
      .single()

    if (!callerProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Admin and sales rep can edit leads
    if (callerProfile.role !== 'admin' && callerProfile.role !== 'super_admin' && callerProfile.role !== 'sales') {
      return NextResponse.json({ error: 'Only admins and sales reps can edit leads' }, { status: 403 })
    }

    // Get the lead to verify org ownership and assignment
    const adminClient = await createAdminClient()
    const { data: lead } = await adminClient
      .from('leads')
      .select('id, org_id, assigned_to, created_by, custom_fields, phone')
      .eq('id', leadId)
      .single()

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Verify lead is in caller's org
    if (lead.org_id !== callerProfile.org_id) {
      return NextResponse.json({ error: 'Lead not in your organization' }, { status: 403 })
    }

    // Sales rep can only edit leads assigned to them or created by them
    if (callerProfile.role === 'sales') {
      if (lead.assigned_to !== callerProfile.id && lead.created_by !== callerProfile.id) {
        return NextResponse.json({ error: 'You can only edit leads assigned to you or created by you' }, { status: 403 })
      }
    }

    // Parse request body
    const body = await request.json()
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    }

    // Validate required fields
    // Phone is required - validate if being updated
    if (body.phone !== undefined) {
      if (!body.phone || !body.phone.trim()) {
        return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
      }
      updateData.phone = body.phone.trim()
    }
    
    // Allow updating name (optional)
    if (body.name !== undefined) {
      updateData.name = body.name.trim() || null
    }

    // Allow updating these fields
    if (body.email !== undefined) updateData.email = body.email?.trim() || null
    if (body.source !== undefined) updateData.source = body.source
    if (body.custom_fields !== undefined) {
      // Merge with existing custom_fields
      const existingCustomFields = lead.custom_fields || {}
      updateData.custom_fields = { ...existingCustomFields, ...body.custom_fields }
    }

    // Update the lead
    const { error: updateError, data: updatedLead } = await adminClient
      .from('leads')
      .update(updateData)
      .eq('id', leadId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating lead:', updateError)
      return NextResponse.json({ error: 'Failed to update lead', details: updateError.message }, { status: 500 })
    }

    // Log activity if any significant fields were changed
    const significantFields = ['name', 'email', 'phone', 'source']
    const hasSignificantChanges = significantFields.some(field => body[field] !== undefined)
    
    if (hasSignificantChanges) {
      const changedFields = significantFields.filter(field => body[field] !== undefined)
      const activityComment = `Updated: ${changedFields.join(', ')}`
      
      await adminClient
        .from('lead_activities')
        .insert({
          lead_id: leadId,
          user_id: callerProfile.id,
          action_type: 'Lead Updated',
          comments: activityComment,
        })
    }

    return NextResponse.json({ lead: updatedLead, message: 'Lead updated successfully' })
  } catch (error) {
    console.error('Update lead error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const { leadId } = await params

    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get caller's profile
    const { data: callerProfile } = await supabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', authUser.id)
      .single()

    if (!callerProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Only admin can delete leads
    if (callerProfile.role !== 'admin' && callerProfile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only admins can delete leads' }, { status: 403 })
    }

    // Get the lead to verify org ownership
    const adminClient = await createAdminClient()
    const { data: lead } = await adminClient
      .from('leads')
      .select('id, org_id')
      .eq('id', leadId)
      .single()

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Verify lead is in caller's org
    if (lead.org_id !== callerProfile.org_id) {
      return NextResponse.json({ error: 'Lead not in your organization' }, { status: 403 })
    }

    // Delete related records first
    // Delete demos
    await adminClient
      .from('demos')
      .delete()
      .eq('lead_id', leadId)

    // Delete lead activities
    await adminClient
      .from('lead_activities')
      .delete()
      .eq('lead_id', leadId)

    // Delete call recordings
    await adminClient
      .from('call_recordings')
      .delete()
      .eq('lead_id', leadId)

    // Delete subscriptions
    await adminClient
      .from('customer_subscriptions')
      .delete()
      .eq('lead_id', leadId)

    // Finally delete the lead
    const { error: deleteError } = await adminClient
      .from('leads')
      .delete()
      .eq('id', leadId)

    if (deleteError) {
      console.error('Error deleting lead:', deleteError)
      return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Lead deleted successfully' })
  } catch (error) {
    console.error('Delete lead error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

