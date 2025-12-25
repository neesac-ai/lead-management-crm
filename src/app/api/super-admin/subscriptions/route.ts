import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { org_id, ...subscriptionData } = body

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

    // Check if subscription already exists for this org
    const { data: existingSub } = await adminSupabase
      .from('org_subscriptions')
      .select('id')
      .eq('org_id', org_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    let error
    if (existingSub) {
      // Update existing
      const result = await adminSupabase
        .from('org_subscriptions')
        .update({
          ...subscriptionData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingSub.id)
      error = result.error
    } else {
      // Create new
      const result = await adminSupabase
        .from('org_subscriptions')
        .insert({
          org_id,
          ...subscriptionData,
          created_by: profile.id,
        })
      error = result.error
    }

    if (error) {
      console.error('Error saving subscription:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: existingSub ? 'Subscription updated' : 'Subscription created',
    })
  } catch (error) {
    console.error('Subscription error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}


