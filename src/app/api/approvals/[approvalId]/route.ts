import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ approvalId: string }> }
) {
  try {
    const { approvalId } = await params
    const { action, rejection_reason } = await request.json()

    if (!action || (action !== 'approve' && action !== 'reject')) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "approve" or "reject"' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const adminSupabase = await createAdminClient()

    // Get current user
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await adminSupabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', authUser.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Only accountant can approve/reject
    if (profile.role !== 'accountant' && profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only accountants and admins can approve subscriptions' },
        { status: 403 }
      )
    }

    // Get the approval record
    const { data: approval, error: approvalError } = await adminSupabase
      .from('subscription_approvals')
      .select('*, leads(org_id)')
      .eq('id', approvalId)
      .single()

    if (approvalError || !approval) {
      return NextResponse.json(
        { error: 'Approval not found' },
        { status: 404 }
      )
    }

    // Verify org access
    const leadOrgId = (approval.leads as { org_id: string })?.org_id
    if (leadOrgId !== profile.org_id && profile.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Verify approval is pending
    if (approval.status !== 'pending') {
      return NextResponse.json(
        { error: `Approval is already ${approval.status}` },
        { status: 400 }
      )
    }

    if (action === 'approve') {
      // Update approval status
      const { error: updateError } = await adminSupabase
        .from('subscription_approvals')
        .update({
          status: 'approved',
          approved_by: profile.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', approvalId)

      if (updateError) {
        console.error('Error updating approval:', updateError)
        return NextResponse.json(
          { error: 'Failed to approve subscription' },
          { status: 500 }
        )
      }

      // Create subscription from approval using the database function
      const { data: subscriptionId, error: createError } = await adminSupabase
        .rpc('create_subscription_from_approval', { approval_id: approvalId })

      if (createError) {
        console.error('Error creating subscription:', createError)
        // Rollback approval status
        await adminSupabase
          .from('subscription_approvals')
          .update({
            status: 'pending',
            approved_by: null,
            approved_at: null,
          })
          .eq('id', approvalId)

        return NextResponse.json(
          { error: 'Failed to create subscription. Please try again.' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Subscription approved and created successfully',
        subscription_id: subscriptionId,
      })
    } else {
      // Reject approval
      const { error: updateError } = await adminSupabase
        .from('subscription_approvals')
        .update({
          status: 'rejected',
          approved_by: profile.id,
          approved_at: new Date().toISOString(),
          rejection_reason: rejection_reason || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', approvalId)

      if (updateError) {
        console.error('Error rejecting approval:', updateError)
        return NextResponse.json(
          { error: 'Failed to reject subscription' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Subscription rejected successfully',
      })
    }
  } catch (error) {
    console.error('Approval error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

