'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { SuperAdminUserActions } from '@/components/super-admin/user-actions'
import { Button } from '@/components/ui/button'
import { 
  Users,
  CheckCircle,
  XCircle,
  Building2,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type User = {
  id: string
  name: string
  email: string
  avatar_url: string | null
  role: string
  is_approved: boolean
  is_active: boolean
  created_at: string
  org_id: string | null
  organizations: { name: string; org_code: string } | null
}

type OrgSubscription = {
  org_id: string
  subscription_type: string
  sales_quota: number | null
  accountant_quota: number | null
  validity_days: number
  status: string
}

type OrgGroup = {
  admin: User | null
  team: User[]
  subscription: OrgSubscription | null
  salesCount: number
  accountantCount: number
}

export default function UsersPage() {
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [subscriptions, setSubscriptions] = useState<OrgSubscription[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const supabase = createClient()
    
    // Fetch users
    const { data: users } = await supabase
      .from('users')
      .select('id, name, email, avatar_url, role, is_approved, is_active, created_at, org_id, organizations(name, org_code)')
      .neq('role', 'super_admin')
      .order('role', { ascending: true })
      .order('org_id', { ascending: true })
      .order('created_at', { ascending: false })

    // Fetch subscriptions
    const { data: subs } = await supabase
      .from('org_subscriptions')
      .select('org_id, subscription_type, sales_quota, accountant_quota, validity_days, status')
      .order('created_at', { ascending: false })

    setAllUsers((users || []) as User[])
    setSubscriptions((subs || []) as OrgSubscription[])
    setIsLoading(false)
  }

  // Group users by organization for hierarchical display
  const adminsByOrg = new Map<string, OrgGroup>()
  
  allUsers.forEach(user => {
    const orgId = user.org_id || 'no_org'
    if (!adminsByOrg.has(orgId)) {
      // Find subscription for this org
      const sub = subscriptions.find(s => s.org_id === orgId) || null
      adminsByOrg.set(orgId, { admin: null, team: [], subscription: sub, salesCount: 0, accountantCount: 0 })
    }
    const org = adminsByOrg.get(orgId)!
    if (user.role === 'admin') {
      org.admin = user
    } else {
      org.team.push(user)
      // Count approved and active team members
      if (user.is_approved && user.is_active) {
        if (user.role === 'sales') {
          org.salesCount++
        } else if (user.role === 'accountant') {
          org.accountantCount++
        }
      }
    }
  })

  const toggleOrg = (orgId: string) => {
    setExpandedOrgs(prev => {
      const next = new Set(prev)
      if (next.has(orgId)) {
        next.delete(orgId)
      } else {
        next.add(orgId)
      }
      return next
    })
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin': return <Badge className="bg-purple-500">Admin</Badge>
      case 'sales': return <Badge className="bg-blue-500">Sales</Badge>
      case 'accountant': return <Badge className="bg-green-500">Accountant</Badge>
      default: return <Badge variant="secondary">{role}</Badge>
    }
  }

  const getQuotaDisplay = (current: number, quota: number | null) => {
    if (quota === null) return `${current}/∞`
    const isOver = current > quota
    return (
      <span className={isOver ? 'text-red-600 font-semibold' : ''}>
        {current}/{quota}
      </span>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title="All Users" 
        description="Manage users across all organizations"
      />
      
      <div className="flex-1 p-4 lg:p-6 space-y-4 lg:space-y-6">
        {/* Stats */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{allUsers.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Admins</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-500">
                {allUsers.filter(u => u.role === 'admin').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-500">
                {allUsers.filter(u => u.role === 'sales').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approval</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-500">
                {allUsers.filter(u => !u.is_approved).length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users List - Hierarchical by Organization */}
        <Card>
          <CardHeader className="px-4 lg:px-6">
            <CardTitle>All Users</CardTitle>
            <CardDescription>Click on admin to view their team members</CardDescription>
          </CardHeader>
          <CardContent className="px-4 lg:px-6">
            {allUsers.length > 0 ? (
              <div className="space-y-4">
                {Array.from(adminsByOrg.entries()).map(([orgId, { admin, team, subscription, salesCount, accountantCount }]) => {
                  const isExpanded = expandedOrgs.has(orgId)
                  const hasTeam = team.length > 0
                  
                  return (
                    <div key={orgId} className="border rounded-lg overflow-hidden">
                      {/* Organization Header */}
                      <div className="bg-muted/50 px-4 py-3 flex items-center gap-2 flex-wrap">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {admin?.organizations?.name || 'No Organization'}
                        </span>
                        {admin?.organizations?.org_code && (
                          <Badge variant="outline" className="font-mono text-xs">
                            {admin.organizations.org_code}
                          </Badge>
                        )}
                        {subscription && (
                          <Badge variant={subscription.subscription_type === 'paid' ? 'default' : 'secondary'} className="text-xs">
                            {subscription.subscription_type}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {team.length + (admin ? 1 : 0)} user{team.length + (admin ? 1 : 0) !== 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="divide-y">
                        {/* Admin User - Clickable to expand team */}
                        {admin && (
                          <div 
                            className={`p-4 bg-purple-500/5 ${hasTeam ? 'cursor-pointer hover:bg-purple-500/10 transition-colors' : ''}`}
                            onClick={() => hasTeam && toggleOrg(orgId)}
                          >
                            <div className="flex items-start gap-3">
                              {/* Expand/Collapse Icon */}
                              {hasTeam && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6 shrink-0 mt-2"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleOrg(orgId)
                                  }}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                              {!hasTeam && <div className="w-6" />}
                              
                              <Avatar className="h-10 w-10 shrink-0 ring-2 ring-purple-500">
                                <AvatarImage src={admin.avatar_url || undefined} />
                                <AvatarFallback className="bg-purple-500/20 text-purple-600">
                                  {admin.name?.charAt(0).toUpperCase() || 'A'}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-semibold truncate">{admin.name}</p>
                                  {admin.is_approved ? (
                                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                                  ) : (
                                    <XCircle className="h-4 w-4 text-yellow-500 shrink-0" />
                                  )}
                                  {getRoleBadge(admin.role)}
                                  {hasTeam && (
                                    <Badge variant="secondary" className="text-xs">
                                      {team.length} team member{team.length !== 1 ? 's' : ''}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground truncate">{admin.email}</p>
                                
                                {/* Quota Info */}
                                {subscription && (
                                  <div className="flex gap-4 text-xs mt-1">
                                    <span className="text-muted-foreground">
                                      Sales: {getQuotaDisplay(salesCount, subscription.sales_quota)}
                                    </span>
                                    <span className="text-muted-foreground">
                                      Accountant: {getQuotaDisplay(accountantCount, subscription.accountant_quota)}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {subscription.validity_days >= 36500 ? 'Lifetime' : `${subscription.validity_days}d`}
                                    </span>
                                  </div>
                                )}
                                {!subscription && (
                                  <p className="text-xs text-yellow-600 mt-1">No subscription configured</p>
                                )}
                                
                                <p className="text-xs text-muted-foreground mt-1">
                                  Joined {formatDistanceToNow(new Date(admin.created_at), { addSuffix: true })}
                                </p>
                              </div>
                              <div onClick={(e) => e.stopPropagation()}>
                                <SuperAdminUserActions 
                                  userId={admin.id} 
                                  userName={admin.name} 
                                  userRole={admin.role}
                                  orgId={admin.org_id}
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Team Members - Collapsible */}
                        {isExpanded && team.map((user) => (
                          <div key={user.id} className="p-4 pl-16 bg-muted/30 animate-in slide-in-from-top-2 duration-200">
                            <div className="flex items-start gap-3">
                              <Avatar className="h-9 w-9 shrink-0">
                                <AvatarImage src={user.avatar_url || undefined} />
                                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                  {user.name?.charAt(0).toUpperCase() || 'U'}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-medium truncate">{user.name}</p>
                                  {user.is_approved ? (
                                    <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                                  ) : (
                                    <XCircle className="h-3 w-3 text-yellow-500 shrink-0" />
                                  )}
                                  {!user.is_active && (
                                    <Badge variant="outline" className="text-xs text-red-500 border-red-300">Inactive</Badge>
                                  )}
                                  {getRoleBadge(user.role)}
                                </div>
                                <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Joined {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                                </p>
                              </div>
                              <SuperAdminUserActions 
                                userId={user.id} 
                                userName={user.name} 
                                userRole={user.role}
                                orgId={user.org_id}
                              />
                            </div>
                          </div>
                        ))}

                        {/* Show team members without admin */}
                        {!admin && team.map((user) => (
                          <div key={user.id} className="p-4">
                            <div className="flex items-start gap-3">
                              <Avatar className="h-9 w-9 shrink-0">
                                <AvatarImage src={user.avatar_url || undefined} />
                                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                  {user.name?.charAt(0).toUpperCase() || 'U'}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-medium truncate">{user.name}</p>
                                  {user.is_approved ? (
                                    <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                                  ) : (
                                    <XCircle className="h-3 w-3 text-yellow-500 shrink-0" />
                                  )}
                                  {getRoleBadge(user.role)}
                                </div>
                                <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Joined {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                                </p>
                              </div>
                              <SuperAdminUserActions 
                                userId={user.id} 
                                userName={user.name} 
                                userRole={user.role}
                                orgId={user.org_id}
                              />
                            </div>
                          </div>
                        ))}

                        {!admin && team.length === 0 && (
                          <div className="p-4 text-center text-muted-foreground text-sm">
                            No users in this organization
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No users yet</p>
                <p className="text-sm">Users will appear here when they register</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
