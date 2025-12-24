import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'

// Force dynamic rendering to prevent caching
export const dynamic = 'force-dynamic'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { TeamMemberActions } from '@/components/admin/team-member-actions'
import { OrgCodeCard } from '@/components/admin/org-code-card'
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

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get user profile
  const { data: profile } = await supabase
    .from('users')
    .select('role, org_id')
    .eq('auth_id', user.id)
    .single()

  // Only admins can access this page
  if (profile?.role !== 'admin') {
    redirect(`/${orgSlug}/dashboard`)
  }

  // Get organization details
  const { data: org } = await supabase
    .from('organizations')
    .select('id, org_code')
    .eq('slug', orgSlug)
    .single() as { data: Org | null }

  if (!org) redirect('/not-found')

  // Get team members (excluding the current admin)
  const { data: teamMembers } = await supabase
    .from('users')
    .select('id, name, email, avatar_url, role, is_approved, is_active, created_at')
    .eq('org_id', org.id)
    .neq('role', 'admin')
    .order('created_at', { ascending: false })

  const team = (teamMembers || []) as TeamMember[]
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
    <div className="flex flex-col min-h-screen">
      <Header 
        title="Team Management" 
        description="Manage your team members and approval requests"
      />
      
      <div className="flex-1 p-4 lg:p-6 space-y-4 lg:space-y-6">
        {/* Org Code Card */}
        <OrgCodeCard orgCode={org.org_code} />

        {/* Stats */}
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Team</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{team.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{activeMembers.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Inactive</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-400">{inactiveMembers.length}</div>
            </CardContent>
          </Card>
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-yellow-600">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{pendingMembers.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Pending Approvals */}
        {pendingMembers.length > 0 && (
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-600">
                <Clock className="h-5 w-5" />
                Pending Approvals
              </CardTitle>
              <CardDescription>Review and approve team member requests</CardDescription>
            </CardHeader>
            <CardContent className="px-4 lg:px-6">
              <div className="space-y-3">
                {pendingMembers.map((member) => (
                  <div 
                    key={member.id} 
                    className="p-4 rounded-lg border border-yellow-500/30 bg-background"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage src={member.avatar_url || undefined} />
                        <AvatarFallback className="bg-yellow-500/20 text-yellow-600">
                          {member.name?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{member.name}</p>
                        <p className="text-sm text-muted-foreground truncate">{member.email}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Applied {formatDistanceToNow(new Date(member.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {getRoleBadge(member.role)}
                        <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-600">
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
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Active Team Members
            </CardTitle>
            <CardDescription>Team members who can access the system</CardDescription>
          </CardHeader>
          <CardContent className="px-4 lg:px-6">
            {activeMembers.length > 0 ? (
              <div className="space-y-3">
                {activeMembers.map((member) => (
                  <div 
                    key={member.id} 
                    className="p-4 rounded-lg border bg-card"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage src={member.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {member.name?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold truncate">{member.name}</p>
                          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{member.email}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Joined {formatDistanceToNow(new Date(member.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {getRoleBadge(member.role)}
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
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No active team members</p>
                <p className="text-sm">Share your organization code to invite team members</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Inactive Team Members */}
        {inactiveMembers.length > 0 && (
          <Card className="border-gray-300 bg-gray-50 dark:bg-gray-900/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-500">
                <UserX className="h-5 w-5" />
                Inactive Team Members
              </CardTitle>
              <CardDescription>Deactivated members - cannot access the system</CardDescription>
            </CardHeader>
            <CardContent className="px-4 lg:px-6">
              <div className="space-y-3">
                {inactiveMembers.map((member) => (
                  <div 
                    key={member.id} 
                    className="p-4 rounded-lg border border-gray-200 bg-white/50 dark:bg-gray-800/30 opacity-75"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <Avatar className="h-10 w-10 shrink-0 grayscale">
                        <AvatarImage src={member.avatar_url || undefined} />
                        <AvatarFallback className="bg-gray-200 text-gray-500">
                          {member.name?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold truncate text-gray-500">{member.name}</p>
                          <Badge variant="secondary" className="bg-gray-200 text-gray-600">
                            Inactive
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {getRoleBadge(member.role)}
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
      </div>
    </div>
  )
}

