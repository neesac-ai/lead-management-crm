import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { 
  Target, 
  Users, 
  CalendarDays, 
  CreditCard,
  ArrowUpRight,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

interface DashboardPageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { orgSlug } = await params
  const supabase = await createClient()

  // Get current user's profile
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileData } = await supabase
    .from('users')
    .select('id, name, role, org_id')
    .eq('auth_id', user?.id || '')
    .single()

  const profile = profileData as { id: string; name: string; role: string; org_id: string | null } | null

  // Fetch organization
  const { data: orgData } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('slug', orgSlug)
    .single()

  const org = orgData as { id: string; name: string } | null

  if (!org) {
    return null
  }

  // Fetch stats based on user role
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'
  
  const leadsQuery = supabase
    .from('leads')
    .select('id, status', { count: 'exact' })
    .eq('org_id', org.id)

  if (!isAdmin && profile?.id) {
    leadsQuery.eq('assigned_to', profile.id)
  }

  const [leadsResult, demosResult, subscriptionsResult] = await Promise.all([
    leadsQuery,
    supabase
      .from('demos')
      .select('id, status, leads!inner(org_id)')
      .eq('leads.org_id', org.id)
      .eq('status', 'scheduled'),
    supabase
      .from('customer_subscriptions')
      .select('id, status, deal_value')
      .eq('org_id', org.id),
  ])

  type LeadData = { id: string; status: string }
  type DemoData = { id: string; status: string }
  type SubscriptionData = { id: string; status: string; deal_value: number }

  const leadsData = (leadsResult.data || []) as LeadData[]
  const demosData = (demosResult.data || []) as DemoData[]
  const subscriptionsData = (subscriptionsResult.data || []) as SubscriptionData[]

  const totalLeads = leadsResult.count || 0
  const newLeads = leadsData.filter(l => l.status === 'new').length
  const upcomingDemos = demosData.length
  const activeSubscriptions = subscriptionsData.filter(s => s.status === 'active').length
  const totalRevenue = subscriptionsData.reduce((sum, s) => sum + (s.deal_value || 0), 0)

  const stats = [
    {
      title: 'Total Leads',
      value: totalLeads.toString(),
      icon: Target,
      description: `${newLeads} new leads`,
      href: `/${orgSlug}/leads`,
    },
    {
      title: 'Upcoming Demos',
      value: upcomingDemos.toString(),
      icon: CalendarDays,
      description: 'Scheduled this week',
      href: `/${orgSlug}/demos`,
    },
    {
      title: 'Active Subscriptions',
      value: activeSubscriptions.toString(),
      icon: Users,
      description: 'Currently active',
      href: `/${orgSlug}/subscriptions`,
    },
    {
      title: 'Total Revenue',
      value: `₹${totalRevenue.toLocaleString()}`,
      icon: CreditCard,
      description: 'All time',
      href: `/${orgSlug}/payments`,
    },
  ]

  // Get recent leads (filtered for sales users)
  let recentLeadsQuery = supabase
    .from('leads')
    .select('id, name, status, created_at')
    .eq('org_id', org.id)
    .order('created_at', { ascending: false })
    .limit(5)

  // Sales can only see their assigned or created leads
  if (profile?.role === 'sales' && profile?.id) {
    recentLeadsQuery = supabase
      .from('leads')
      .select('id, name, status, created_at')
      .eq('org_id', org.id)
      .or(`assigned_to.eq.${profile.id},created_by.eq.${profile.id}`)
      .order('created_at', { ascending: false })
      .limit(5)
  }

  const { data: recentLeadsData } = await recentLeadsQuery

  type RecentLead = { id: string; name: string; status: string; created_at: string }
  const recentLeads = (recentLeadsData || []) as RecentLead[]

  // Get today's follow-ups (filtered for sales users)
  const today = new Date().toISOString().split('T')[0]
  
  let todayFollowupsData: { id: string; next_followup: string | null; leads: { id: string; name: string; assigned_to: string | null; created_by: string | null } }[] | null = null

  if (profile?.role === 'sales' && profile?.id) {
    // For sales, only show follow-ups for their assigned/created leads
    const { data } = await supabase
      .from('lead_activities')
      .select(`
        id,
        next_followup,
        leads!inner(id, name, org_id, assigned_to, created_by)
      `)
      .eq('leads.org_id', org.id)
      .gte('next_followup', `${today}T00:00:00`)
      .lte('next_followup', `${today}T23:59:59`)
      .or(`leads.assigned_to.eq.${profile.id},leads.created_by.eq.${profile.id}`)
      .limit(5)
    
    todayFollowupsData = data as typeof todayFollowupsData
  } else {
    const { data } = await supabase
      .from('lead_activities')
      .select(`
        id,
        next_followup,
        leads!inner(id, name, org_id, assigned_to, created_by)
      `)
      .eq('leads.org_id', org.id)
      .gte('next_followup', `${today}T00:00:00`)
      .lte('next_followup', `${today}T23:59:59`)
      .limit(5)
    
    todayFollowupsData = data as typeof todayFollowupsData
  }

  type FollowupData = { id: string; next_followup: string | null; leads: { id: string; name: string } }
  const todayFollowups = (todayFollowupsData || []) as FollowupData[]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-500'
      case 'contacted': return 'bg-yellow-500'
      case 'qualified': return 'bg-green-500'
      case 'demo_booked': return 'bg-purple-500'
      case 'deal_won': return 'bg-emerald-500'
      case 'deal_lost': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title={`Welcome back, ${profile?.name?.split(' ')[0] || 'User'}!`}
        description={`Here's what's happening at ${org.name}`}
      />
      
      <div className="flex-1 p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <Link key={index} href={stat.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer animate-fade-in" style={{ animationDelay: `${index * 100}ms` }}>
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
            </Link>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Leads */}
          <Card className="animate-fade-in animate-delay-400">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Leads</CardTitle>
                <CardDescription>Latest leads added to the system</CardDescription>
              </div>
              <Link href={`/${orgSlug}/leads`}>
                <Button variant="ghost" size="sm">
                  View all
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {recentLeads && recentLeads.length > 0 ? (
                <div className="space-y-3">
                  {recentLeads.map((lead) => (
                    <Link 
                      key={lead.id} 
                      href={`/${orgSlug}/leads/${lead.id}`}
                      className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(lead.status)}`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{lead.name}</p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {lead.status.replace('_', ' ')}
                        </p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No leads yet</p>
                  <Link href={`/${orgSlug}/leads/new`}>
                    <Button variant="link" className="mt-2">
                      Add your first lead
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Today's Follow-ups */}
          <Card className="animate-fade-in animate-delay-500">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Today&apos;s Follow-ups</CardTitle>
                <CardDescription>Leads requiring attention today</CardDescription>
              </div>
              <Link href={`/${orgSlug}/follow-ups`}>
                <Button variant="ghost" size="sm">
                  View all
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {todayFollowups && todayFollowups.length > 0 ? (
                <div className="space-y-3">
                  {todayFollowups.map((followup) => (
                    <div 
                      key={followup.id}
                      className="flex items-center gap-4 p-3 rounded-lg bg-muted/50"
                    >
                      <Clock className="h-5 w-5 text-amber-500" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {followup.leads?.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {followup.next_followup ? new Date(followup.next_followup).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Scheduled'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600">
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600">
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No follow-ups scheduled for today</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="animate-fade-in animate-delay-300">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks you can perform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Link href={`/${orgSlug}/leads/new`}>
                <Button>
                  <Target className="mr-2 h-4 w-4" />
                  Add New Lead
                </Button>
              </Link>
              <Link href={`/${orgSlug}/import`}>
                <Button variant="outline">
                  Import Leads
                </Button>
              </Link>
              <Link href={`/${orgSlug}/demos/new`}>
                <Button variant="outline">
                  Schedule Demo
                </Button>
              </Link>
              <Link href={`/${orgSlug}/subscriptions/new`}>
                <Button variant="outline">
                  Create Subscription
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

