import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

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

