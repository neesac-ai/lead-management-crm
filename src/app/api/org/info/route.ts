import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's profile to find their org_id
    const { data: profile } = await supabase
      .from('users')
      .select('org_id')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 })
    }

    // Use admin client to bypass RLS and fetch org
    const adminClient = await createAdminClient()
    const { data: org, error } = await adminClient
      .from('organizations')
      .select('name, org_code')
      .eq('id', profile.org_id)
      .single()

    if (error || !org) {
      console.error('Error fetching org:', error)
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    return NextResponse.json(org)
  } catch (error) {
    console.error('Org info error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

