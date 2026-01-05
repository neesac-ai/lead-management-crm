import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
    try {
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

        const body = await request.json()
        const { leadIds, assignedTo } = body

        if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
            return NextResponse.json({ error: 'leadIds array is required' }, { status: 400 })
        }

        if (!assignedTo) {
            return NextResponse.json({ error: 'assignedTo is required' }, { status: 400 })
        }

        const isAdmin = callerProfile.role === 'admin' || callerProfile.role === 'super_admin'
        const isManager = callerProfile.role === 'sales'

        // For admins: use regular client (RLS allows it)
        // For managers: use admin client to bypass RLS, but validate they can only assign to themselves or reportees
        if (isAdmin) {
            const { error } = await supabase
                .from('leads')
                .update({ assigned_to: assignedTo, updated_at: new Date().toISOString() })
                .in('id', leadIds)

            if (error) {
                console.error('Error assigning leads (admin):', error)
                return NextResponse.json({ error: 'Failed to assign leads' }, { status: 500 })
            }

            return NextResponse.json({ success: true, message: `${leadIds.length} lead(s) assigned successfully` })
        } else if (isManager) {
            // For managers: validate they can only assign to themselves or their reportees
            const { data: reportees } = await supabase
                .rpc('get_all_reportees', { manager_user_id: callerProfile.id } as any)

            const reporteeIds = (reportees as Array<{ reportee_id: string }> | null)?.map((r: { reportee_id: string }) => r.reportee_id) || []
            const accessibleUserIds = [callerProfile.id, ...reporteeIds]

            if (!accessibleUserIds.includes(assignedTo)) {
                return NextResponse.json({ error: 'You can only assign leads to yourself or your team members' }, { status: 403 })
            }

            // Verify the leads belong to the manager's org and are either unassigned or assigned to manager/reportees
            const adminClient = await createAdminClient()

            // First, verify the leads exist and belong to the manager's org
            const { data: leadsToAssign, error: fetchError } = await adminClient
                .from('leads')
                .select('id, org_id, assigned_to, created_by')
                .in('id', leadIds)
                .eq('org_id', callerProfile.org_id)

            if (fetchError) {
                console.error('Error fetching leads to assign:', fetchError)
                return NextResponse.json({ error: 'Failed to verify leads' }, { status: 500 })
            }

            if (!leadsToAssign || leadsToAssign.length !== leadIds.length) {
                return NextResponse.json({ error: 'Some leads were not found or do not belong to your organization' }, { status: 404 })
            }

            // Verify that all leads are either unassigned or assigned to manager/reportees
            const invalidLeads = leadsToAssign.filter(lead =>
                lead.assigned_to !== null && !accessibleUserIds.includes(lead.assigned_to)
            )

            if (invalidLeads.length > 0) {
                return NextResponse.json({ error: 'You can only assign unassigned leads or leads assigned to you or your team' }, { status: 403 })
            }

            // Also verify that unassigned leads were created by manager or reportees
            const unassignedLeads = leadsToAssign.filter(lead => lead.assigned_to === null)
            if (unassignedLeads.length > 0) {
                const invalidUnassigned = unassignedLeads.filter(lead =>
                    lead.created_by && !accessibleUserIds.includes(lead.created_by)
                )
                if (invalidUnassigned.length > 0) {
                    return NextResponse.json({ error: 'You can only assign unassigned leads created by you or your team' }, { status: 403 })
                }
            }

            // Now update using admin client to bypass RLS
            const { error: updateError } = await adminClient
                .from('leads')
                .update({ assigned_to: assignedTo, updated_at: new Date().toISOString() })
                .in('id', leadIds)

            if (updateError) {
                console.error('Error assigning leads (manager):', updateError)
                return NextResponse.json({ error: 'Failed to assign leads' }, { status: 500 })
            }

            return NextResponse.json({ success: true, message: `${leadIds.length} lead(s) assigned successfully` })
        } else {
            // Regular sales rep: can only assign to themselves
            if (assignedTo !== callerProfile.id) {
                return NextResponse.json({ error: 'You can only assign leads to yourself' }, { status: 403 })
            }

            // Verify leads are unassigned and created by the sales rep
            const { data: leadsToAssign, error: fetchError } = await supabase
                .from('leads')
                .select('id, org_id, assigned_to, created_by')
                .in('id', leadIds)
                .eq('org_id', callerProfile.org_id)
                .is('assigned_to', null)
                .eq('created_by', callerProfile.id)

            if (fetchError) {
                console.error('Error fetching leads to assign:', fetchError)
                return NextResponse.json({ error: 'Failed to verify leads' }, { status: 500 })
            }

            if (!leadsToAssign || leadsToAssign.length !== leadIds.length) {
                return NextResponse.json({ error: 'Some leads were not found or are not available for assignment' }, { status: 404 })
            }

            const { error } = await supabase
                .from('leads')
                .update({ assigned_to: assignedTo, updated_at: new Date().toISOString() })
                .in('id', leadIds)

            if (error) {
                console.error('Error assigning leads:', error)
                return NextResponse.json({ error: 'Failed to assign leads' }, { status: 500 })
            }

            return NextResponse.json({ success: true, message: `${leadIds.length} lead(s) assigned successfully` })
        }
    } catch (error) {
        console.error('Error in assign endpoint:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

