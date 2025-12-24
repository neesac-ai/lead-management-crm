import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type SubscriptionData = {
  subscription_type: 'trial' | 'paid'
  validity_days: number
  sales_quota: number | null
  accountant_quota: number | null
  subscription_value: number
  amount_credited: number
  start_date: string
  end_date: string
}

// Approve or reject organization
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action, subscription } = body as { action: string; subscription?: SubscriptionData }

    if (!['approve', 'reject', 'suspend'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const adminSupabase = await createAdminClient()

    // Check if requester is super admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await adminSupabase
      .from('users')
      .select('id, role')
      .eq('auth_id', user.id)
      .single()

    if (profile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get the organization
    const { data: org } = await adminSupabase
      .from('organizations')
      .select('id, name, status')
      .eq('id', id)
      .single()

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    let newStatus: string
    switch (action) {
      case 'approve':
        newStatus = 'active'
        break
      case 'reject':
        newStatus = 'deleted'
        break
      case 'suspend':
        newStatus = 'suspended'
        break
      default:
        newStatus = 'pending'
    }

    // Update organization status
    const { error: updateError } = await adminSupabase
      .from('organizations')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (updateError) {
      console.error('Error updating organization:', updateError)
      return NextResponse.json(
        { error: 'Failed to update organization' },
        { status: 500 }
      )
    }

    // If approved, also approve the admin user and create subscription
    if (action === 'approve' && org.status === 'pending') {
      // Approve admin user
      await adminSupabase
        .from('users')
        .update({ 
          is_approved: true, 
          approved_by: profile?.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString() 
        })
        .eq('org_id', id)
        .eq('role', 'admin')

      // Create subscription if provided
      if (subscription) {
        const { error: subError } = await adminSupabase
          .from('org_subscriptions')
          .insert({
            org_id: id,
            subscription_type: subscription.subscription_type,
            validity_days: subscription.validity_days,
            sales_quota: subscription.sales_quota,
            accountant_quota: subscription.accountant_quota,
            subscription_value: subscription.subscription_value,
            amount_credited: subscription.amount_credited,
            start_date: subscription.start_date,
            end_date: subscription.end_date,
            status: 'active',
            created_by: profile?.id,
          })

        if (subError) {
          console.error('Error creating subscription:', subError)
          // Don't fail the approval, but log the error
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Organization ${action}ed successfully`,
    })
  } catch (error) {
    console.error('Organization action error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

// Delete organization
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const adminSupabase = await createAdminClient()

    // Check if requester is super admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await adminSupabase
      .from('users')
      .select('role')
      .eq('auth_id', user.id)
      .single()

    if (profile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete the organization (cascade will delete users and subscriptions)
    const { error } = await adminSupabase
      .from('organizations')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting organization:', error)
      return NextResponse.json(
        { error: 'Failed to delete organization' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Organization deleted successfully',
    })
  } catch (error) {
    console.error('Delete organization error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
