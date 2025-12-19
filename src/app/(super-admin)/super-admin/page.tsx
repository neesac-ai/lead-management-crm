import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Building2, 
  Users, 
  Target, 
  TrendingUp,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default async function SuperAdminDashboard() {
  const supabase = await createClient()

  // Fetch real stats (exclude super_admin from user count)
  const [orgsResult, usersResult, leadsResult, recentOrgsResult] = await Promise.all([
    supabase.from('organizations').select('id, status', { count: 'exact' }),
    supabase.from('users').select('id', { count: 'exact' }).neq('role', 'super_admin'),
    supabase.from('leads').select('id', { count: 'exact' }),
    supabase.from('organizations').select('id, name, status, created_at').order('created_at', { ascending: false }).limit(5),
  ])

  type OrgData = { id: string; status: string }
  const orgsData = (orgsResult.data || []) as OrgData[]

  const totalOrgs = orgsResult.count || 0
  const activeOrgs = orgsData.filter(o => o.status === 'active').length
  const pendingOrgs = orgsData.filter(o => o.status === 'pending').length
  const totalUsers = usersResult.count || 0
  const totalLeads = leadsResult.count || 0

  type RecentOrg = { id: string; name: string; status: string; created_at: string }
  const recentOrgs = (recentOrgsResult.data || []) as RecentOrg[]

  const stats = [
    {
      title: 'Total Organizations',
      value: totalOrgs.toString(),
      icon: Building2,
      description: `${activeOrgs} active, ${pendingOrgs} pending`,
    },
    {
      title: 'Total Users',
      value: totalUsers.toString(),
      icon: Users,
      description: 'Across all organizations',
    },
    {
      title: 'Total Leads',
      value: totalLeads.toLocaleString(),
      icon: Target,
      description: 'Platform-wide',
    },
    {
      title: 'Monthly Revenue',
      value: '$0',
      icon: TrendingUp,
      description: 'MRR (coming soon)',
    },
  ]

  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title="Platform Overview" 
        description="Monitor and manage your entire platform"
      />
      
      <div className="flex-1 p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <Card key={index} className="animate-fade-in" style={{ animationDelay: `${index * 100}ms` }}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent Activity */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="animate-fade-in animate-delay-400">
            <CardHeader>
              <CardTitle>Recent Organizations</CardTitle>
              <CardDescription>Latest organizations on the platform</CardDescription>
            </CardHeader>
            <CardContent>
              {recentOrgs.length > 0 ? (
                <div className="space-y-4">
                  {recentOrgs.map((org) => (
                    <div key={org.id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{org.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Joined {formatDistanceToNow(new Date(org.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      <Badge variant={org.status === 'active' ? 'default' : 'secondary'}>
                        {org.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No organizations yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="animate-fade-in animate-delay-500">
            <CardHeader>
              <CardTitle>Quick Stats</CardTitle>
              <CardDescription>Platform overview</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="text-sm font-medium">Active Organizations</span>
                  </div>
                  <span className="text-sm font-bold">{activeOrgs}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-yellow-500" />
                    <span className="text-sm font-medium">Pending Approval</span>
                  </div>
                  <span className="text-sm font-bold">{pendingOrgs}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-blue-500" />
                    <span className="text-sm font-medium">Total Users</span>
                  </div>
                  <span className="text-sm font-bold">{totalUsers}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Target className="h-5 w-5 text-purple-500" />
                    <span className="text-sm font-medium">Total Leads</span>
                  </div>
                  <span className="text-sm font-bold">{totalLeads}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
