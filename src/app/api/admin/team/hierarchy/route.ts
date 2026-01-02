import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = await createAdminClient()

    // Verify the requesting user is an admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile } = await adminSupabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', user.id)
      .single() as { data: { id: string; role: string; org_id: string } | null }

    if (!userProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get org_id from query params or use user's org_id
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId') || userProfile.org_id

    if (!orgId) {
      return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 })
    }

    // Verify org access (unless super admin)
    if (userProfile.role !== 'super_admin' && orgId !== userProfile.org_id) {
      return NextResponse.json({ error: 'Cannot view hierarchy of other organizations' }, { status: 403 })
    }

    // Get all users in the organization
    const { data: users, error: usersError } = await adminSupabase
      .from('users')
      .select('id, name, email, role, manager_id, is_active, avatar_url')
      .eq('org_id', orgId)
      .order('name')

    if (usersError) {
      console.error('Error fetching users:', usersError)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    // Build hierarchy tree
    const hierarchy: Record<string, {
      user: any
      reportees: any[]
      level: number
    }> = {}

    // First pass: create entries for all users
    users?.forEach((user: any) => {
      hierarchy[user.id] = {
        user,
        reportees: [],
        level: 0
      }
    })

    // Second pass: build parent-child relationships
    users?.forEach((user: any) => {
      if (user.manager_id && hierarchy[user.manager_id]) {
        hierarchy[user.manager_id].reportees.push(hierarchy[user.id])
      }
    })

    // Calculate levels (distance from root)
    const calculateLevel = (userId: string, visited: Set<string> = new Set()): number => {
      if (visited.has(userId)) {
        return 0 // Prevent infinite loops
      }
      visited.add(userId)

      const user = hierarchy[userId]?.user
      if (!user || !user.manager_id || !hierarchy[user.manager_id]) {
        return 0
      }

      return 1 + calculateLevel(user.manager_id, visited)
    }

    // Update levels
    Object.keys(hierarchy).forEach(userId => {
      hierarchy[userId].level = calculateLevel(userId)
    })

    // Get root nodes (users without managers)
    const rootNodes = Object.values(hierarchy).filter(
      node => !node.user.manager_id
    )

    // Get lead counts for each user
    const userIds = users?.map((u: any) => u.id) || []
    if (userIds.length > 0) {
      const { data: leadCounts } = await adminSupabase
        .from('leads')
        .select('assigned_to')
        .in('assigned_to', userIds)
        .eq('org_id', orgId)

      const counts: Record<string, number> = {}
      leadCounts?.forEach((lead: any) => {
        counts[lead.assigned_to] = (counts[lead.assigned_to] || 0) + 1
      })

      // Add lead counts to hierarchy
      Object.values(hierarchy).forEach(node => {
        node.user.leadCount = counts[node.user.id] || 0
      })
    }

    return NextResponse.json({
      hierarchy: rootNodes,
      flat: Object.values(hierarchy).map(node => ({
        ...node.user,
        reporteeCount: node.reportees.length,
        level: node.level
      }))
    })
  } catch (error: any) {
    console.error('Error in hierarchy:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

