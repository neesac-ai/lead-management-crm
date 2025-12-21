import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { TeamMemberActions } from '@/components/admin/team-member-actions'
import { OrgCodeCard } from '@/components/admin/org-code-card'
import { 
  Users,
  CheckCircle,
  Clock,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type TeamMember = {
  id: string
  name: string
  email: string
  avatar_url: string | null
  role: string
  is_approved: boolean
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
    .select('id, name, email, avatar_url, role, is_approved, created_at')
    .eq('org_id', org.id)
    .neq('role', 'admin')
    .order('created_at', { ascending: false })

  const team = (teamMembers || []) as TeamMember[]
  const pendingMembers = team.filter(m => !m.is_approved)
  const approvedMembers = team.filter(m => m.is_approved)

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
        <div className="grid gap-3 grid-cols-3">
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
              <div className="text-2xl font-bold text-green-500">{approvedMembers.length}</div>
            </CardContent>
          </Card>
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-yellow-600">Pending Approval</CardTitle>
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
                        isApproved={member.is_approved} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Approved Team Members */}
        <Card>
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>Your active team members</CardDescription>
          </CardHeader>
          <CardContent className="px-4 lg:px-6">
            {approvedMembers.length > 0 ? (
              <div className="space-y-3">
                {approvedMembers.map((member) => (
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
                        isApproved={member.is_approved} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No team members yet</p>
                <p className="text-sm">Share your organization code to invite team members</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

