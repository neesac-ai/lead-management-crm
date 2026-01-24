import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { getMenuNamesServer, getMenuLabelServer } from '@/lib/menu-names-server'

// Force dynamic rendering to prevent caching
export const dynamic = 'force-dynamic'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { TeamMemberActions } from '@/components/admin/team-member-actions'
import { OrgCodeCard } from '@/components/admin/org-code-card'
import { TeamManagerWrapper } from '@/components/admin/team-manager-wrapper'
import { TeamHierarchyGraph } from '@/components/admin/team-hierarchy-graph'
import {
  Users,
  CheckCircle,
  Clock,
  UserX,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type TeamMember = {
  id: string
  name: string
  email: string
  avatar_url: string | null
  role: string
  is_approved: boolean
  is_active: boolean
  created_at: string
  manager_id: string | null
  manager?: {
    id: string
    name: string
    email: string
  } | null
}

type Org = {
  id: string
  org_code: string
}

export default async function TeamPage({
  params
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const supabase = await createClient()
  const menuNames = await getMenuNamesServer()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get user profile
  const { data: profile } = await supabase
    .from('users')
    .select('role, org_id, id')
    .eq('auth_id', user.id)
    .single()

  if (!profile) {
    redirect('/login')
  }

  // Team page is accessible to everyone in the org

  // Get organization details
  const { data: org } = await supabase
    .from('organizations')
    .select('id, org_code')
    .eq('slug', orgSlug)
    .single() as { data: Org | null }

  if (!org) redirect('/not-found')

  // Get team members (excluding the current admin from list, but included in hierarchy)
  // Use admin client to bypass RLS if needed
  const adminSupabase = await createAdminClient()
  const { data: teamMembers, error: teamError } = await adminSupabase
    .from('users')
    .select('id, name, email, avatar_url, role, is_approved, is_active, created_at, manager_id')
    .eq('org_id', org.id)
    .neq('role', 'admin')
    .order('created_at', { ascending: false })

  if (teamError) {
    console.error('Error fetching team members:', teamError)
  }

  // Get manager details separately to avoid foreign key relationship issues
  const managerIds = (teamMembers || [])
    .map((m: any) => m.manager_id)
    .filter((id: string | null): id is string => id !== null)

  let managerMap: Record<string, { id: string; name: string; email: string }> = {}

  if (managerIds.length > 0) {
    const { data: managers, error: managerError } = await adminSupabase
      .from('users')
      .select('id, name, email')
      .in('id', managerIds)

    if (managerError) {
      console.error('Error fetching managers:', managerError)
    }

    if (managers) {
      managers.forEach((m: any) => {
        managerMap[m.id] = { id: m.id, name: m.name, email: m.email }
      })
    }
  }

  // Transform the data to match our type
  const team = (teamMembers || []).map((member: any) => ({
    ...member,
    manager: member.manager_id ? managerMap[member.manager_id] || null : null,
  })) as TeamMember[]
  const pendingMembers = team.filter(m => !m.is_approved)
  const activeMembers = team.filter(m => m.is_approved && m.is_active)
  const inactiveMembers = team.filter(m => m.is_approved && !m.is_active)

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'sales': return <Badge className="bg-blue-500">Sales</Badge>
      case 'accountant': return <Badge className="bg-green-500">Accountant</Badge>
      default: return <Badge variant="secondary">{role}</Badge>
    }
  }

  return (
    <TeamManagerWrapper orgId={org.id}>
      <div className="flex flex-col min-h-screen">
        <Header
          title={getMenuLabelServer(menuNames, 'team', 'Team Management')}
          description="Manage your team members and approval requests"
        />

        <div className="flex-1 p-3 sm:p-4 lg:p-6 pb-20 lg:pb-6 space-y-3 sm:space-y-4 lg:space-y-6">
          {/* Org Code Card */}
          <OrgCodeCard orgCode={org.org_code} />

          {/* Stats */}
          <div className="flex flex-col sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            <Card>
              <CardHeader className="pb-2 p-3 sm:p-6">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Total Team</CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <div className="text-xl sm:text-2xl font-bold">{team.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 p-3 sm:p-6">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Active</CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <div className="text-xl sm:text-2xl font-bold text-green-500">{activeMembers.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 p-3 sm:p-6">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Inactive</CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <div className="text-xl sm:text-2xl font-bold text-gray-400">{inactiveMembers.length}</div>
              </CardContent>
            </Card>
            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardHeader className="pb-2 p-3 sm:p-6">
                <CardTitle className="text-xs sm:text-sm font-medium text-yellow-600">Pending</CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <div className="text-xl sm:text-2xl font-bold text-yellow-600">{pendingMembers.length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Team Hierarchy Graph View */}
          <TeamHierarchyGraph orgId={org.id} />

          {/* Pending Approvals */}
          {pendingMembers.length > 0 && (
            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardHeader className="p-3 sm:p-6">
                <CardTitle className="text-sm sm:text-base flex items-center gap-1.5 sm:gap-2 text-yellow-600">
                  <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
                  Pending Approvals
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">Review and approve team member requests</CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 lg:p-6 pt-0">
                <div className="space-y-2 sm:space-y-3">
                  {pendingMembers.map((member) => (
                    <div
                      key={member.id}
                      className="p-3 sm:p-4 rounded-lg border border-yellow-500/30 bg-background"
                    >
                      <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-3">
                        <Avatar className="h-8 w-8 sm:h-10 sm:w-10 shrink-0">
                          <AvatarImage src={member.avatar_url || undefined} />
                          <AvatarFallback className="bg-yellow-500/20 text-yellow-600 text-xs sm:text-sm">
                            {member.name?.charAt(0).toUpperCase() || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm sm:text-base truncate">{member.name}</p>
                          <p className="text-xs sm:text-sm text-muted-foreground truncate">{member.email}</p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
                            Applied {formatDistanceToNow(new Date(member.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          {getRoleBadge(member.role)}
                          <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-600 text-xs">
                            Pending
                          </Badge>
                        </div>
                        <TeamMemberActions
                          userId={member.id}
                          userName={member.name}
                          userEmail={member.email}
                          isApproved={member.is_approved}
                          isActive={member.is_active}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Active Team Members */}
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-sm sm:text-base flex items-center gap-1.5 sm:gap-2">
                <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
                Active Team Members
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Team members who can access the system</CardDescription>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 lg:p-6 pt-0">
              {activeMembers.length > 0 ? (
                <div className="space-y-2 sm:space-y-3">
                  {activeMembers.map((member) => (
                    <div
                      key={member.id}
                      className="p-3 sm:p-4 rounded-lg border bg-card"
                    >
                      <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-3">
                        <Avatar className="h-8 w-8 sm:h-10 sm:w-10 shrink-0">
                          <AvatarImage src={member.avatar_url || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs sm:text-sm">
                            {member.name?.charAt(0).toUpperCase() || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <p className="font-semibold text-sm sm:text-base truncate">{member.name}</p>
                            <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500 shrink-0" />
                          </div>
                          <p className="text-xs sm:text-sm text-muted-foreground truncate">{member.email}</p>
                          {member.manager && (
                            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
                              Manager: {member.manager.name}
                            </p>
                          )}
                          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
                            Joined {formatDistanceToNow(new Date(member.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        {getRoleBadge(member.role)}
                        <TeamMemberActions
                          userId={member.id}
                          userName={member.name}
                          userEmail={member.email}
                          isApproved={member.is_approved}
                          isActive={member.is_active}
                          managerId={member.manager_id}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 sm:py-12 text-muted-foreground">
                  <Users className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-4 opacity-50" />
                  <p className="text-sm sm:text-lg font-medium">No active team members</p>
                  <p className="text-xs sm:text-sm">Share your organization code to invite team members</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Inactive Team Members */}
          {inactiveMembers.length > 0 && (
            <Card className="border-gray-300 bg-gray-50 dark:bg-gray-900/20">
              <CardHeader className="p-3 sm:p-6">
                <CardTitle className="text-sm sm:text-base flex items-center gap-1.5 sm:gap-2 text-gray-500">
                  <UserX className="h-4 w-4 sm:h-5 sm:w-5" />
                  Inactive Team Members
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">Deactivated members - cannot access the system</CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 lg:p-6 pt-0">
                <div className="space-y-2 sm:space-y-3">
                  {inactiveMembers.map((member) => (
                    <div
                      key={member.id}
                      className="p-3 sm:p-4 rounded-lg border border-gray-200 bg-white/50 dark:bg-gray-800/30 opacity-75"
                    >
                      <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-3">
                        <Avatar className="h-8 w-8 sm:h-10 sm:w-10 shrink-0 grayscale">
                          <AvatarImage src={member.avatar_url || undefined} />
                          <AvatarFallback className="bg-gray-200 text-gray-500 text-xs sm:text-sm">
                            {member.name?.charAt(0).toUpperCase() || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <p className="font-semibold text-sm sm:text-base truncate text-gray-500">{member.name}</p>
                            <Badge variant="secondary" className="bg-gray-200 text-gray-600 text-xs">
                              Inactive
                            </Badge>
                          </div>
                          <p className="text-xs sm:text-sm text-muted-foreground truncate">{member.email}</p>
                          {member.manager && (
                            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
                              Manager: {member.manager.name}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        {getRoleBadge(member.role)}
                        <TeamMemberActions
                          userId={member.id}
                          userName={member.name}
                          userEmail={member.email}
                          isApproved={member.is_approved}
                          isActive={member.is_active}
                          managerId={member.manager_id}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </TeamManagerWrapper>
  )
}

