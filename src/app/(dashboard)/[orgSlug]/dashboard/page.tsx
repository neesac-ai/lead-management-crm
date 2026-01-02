import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { formatInTimeZone } from 'date-fns-tz'
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
  Bell,
  Video,
  Phone,
  FileText,
} from 'lucide-react'

// Force dynamic rendering to always fetch fresh data
export const dynamic = 'force-dynamic'

// Default timezone for server-side rendering (IST)
const DEFAULT_TIMEZONE = 'Asia/Kolkata'

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
  const isAccountant = profile?.role === 'accountant'

  // Calculate current time in IST for filtering
  const nowForStats = new Date()
  const nowISO = nowForStats.toISOString()

  // Build leads query based on role (skip for accountant)
  // RLS policies will automatically include reportees' leads for managers
  let leadsQuery = supabase
    .from('leads')
    .select('id, status, subscription_type', { count: 'exact' })
    .eq('org_id', org.id)

  if (!isAdmin && !isAccountant && profile?.id) {
    // For sales users (including managers), RLS will handle reportees' leads automatically
    // But we still need to filter by assigned_to or created_by for the base query
    leadsQuery = supabase
      .from('leads')
      .select('id, status, subscription_type', { count: 'exact' })
      .eq('org_id', org.id)
      .or(`assigned_to.eq.${profile.id},created_by.eq.${profile.id}`)
  }

  // Build demos query - only future scheduled demos
  let demosQuery = supabase
    .from('demos')
    .select('id, status, scheduled_at, leads!inner(org_id, assigned_to, created_by)')
    .eq('leads.org_id', org.id)
    .eq('status', 'scheduled')
    .gte('scheduled_at', nowISO)

  // Build follow-ups query - only future follow-ups
  // First get activities with next_followup
  const { data: activitiesData } = await supabase
    .from('lead_activities')
    .select('id, lead_id, next_followup')
    .not('next_followup', 'is', null)
    .gte('next_followup', nowISO)

  // Then get leads separately
  let followupsResult: any = { data: [], count: 0 }
  if (activitiesData && activitiesData.length > 0) {
    const leadIds = activitiesData.map(a => a.lead_id)
    const { data: leadsData } = await supabase
      .from('leads')
      .select('id, org_id, assigned_to, created_by')
      .in('id', leadIds)
      .eq('org_id', org.id)

    // Filter by role if needed
    if (!isAdmin && profile?.id) {
      const filteredLeads = leadsData?.filter(lead =>
        lead.assigned_to === profile.id || lead.created_by === profile.id
      ) || []
      followupsResult = { data: filteredLeads, count: filteredLeads.length }
    } else {
      followupsResult = { data: leadsData || [], count: leadsData?.length || 0 }
    }
  }

  // Fetch subscriptions separately (without foreign key relationship)
  const { data: subscriptionsDataRaw } = await supabase
    .from('customer_subscriptions')
    .select('id, status, deal_value, amount_credited, amount_pending, validity_days, lead_id')
    .eq('org_id', org.id)

  // Fetch leads for subscriptions separately
  let subscriptionsResult: any = { data: [] }
  if (subscriptionsDataRaw && subscriptionsDataRaw.length > 0) {
    const subscriptionLeadIds = subscriptionsDataRaw.map(s => s.lead_id).filter(Boolean) as string[]
    if (subscriptionLeadIds.length > 0) {
      const { data: subscriptionLeads } = await supabase
        .from('leads')
        .select('id, assigned_to, created_by')
        .in('id', subscriptionLeadIds)

      // Map subscriptions with their leads
      const subscriptionsWithLeads = subscriptionsDataRaw.map(sub => {
        const lead = subscriptionLeads?.find(l => l.id === sub.lead_id)
        return {
          ...sub,
          leads: lead || null
        }
      })

      // Filter by role if needed
      if (!isAdmin && profile?.id) {
        const filtered = subscriptionsWithLeads.filter(sub =>
          sub.leads?.assigned_to === profile.id || sub.leads?.created_by === profile.id
        )
        subscriptionsResult = { data: filtered }
      } else {
        subscriptionsResult = { data: subscriptionsWithLeads }
      }
    } else {
      subscriptionsResult = { data: subscriptionsDataRaw }
    }
  } else {
    subscriptionsResult = { data: [] }
  }

  // Fetch pending approvals for accountant
  const pendingApprovalsQuery = supabase
    .from('subscription_approvals')
    .select('id', { count: 'exact' })
    .eq('org_id', org.id)
    .eq('status', 'pending')

  const queries: Promise<any>[] = []

  // Only fetch leads/demos if not accountant (followups and subscriptions already fetched above)
  if (!isAccountant) {
    queries.push(leadsQuery, demosQuery)
  } else {
    queries.push(
      Promise.resolve({ data: [], count: 0 }),
      Promise.resolve({ data: [] })
    )
  }

  queries.push(pendingApprovalsQuery)

  const [leadsResult, demosResult, approvalsResult] = await Promise.all(queries)

  type LeadData = { id: string; status: string; subscription_type?: string | null }
  type DemoData = { id: string; status: string; scheduled_at: string; leads: { org_id: string; assigned_to: string | null; created_by: string | null } }
  type FollowupCountData = { id: string; leads: { org_id: string; assigned_to: string | null; created_by: string | null } }
  type SubscriptionData = { id: string; status: string; deal_value: number; amount_credited: number; amount_pending: number; validity_days: number; leads: { assigned_to: string | null; created_by: string | null } | null }

  const leadsData = (leadsResult.data || []) as LeadData[]
  const demosData = (demosResult.data || []) as DemoData[]
  const followupsData = (followupsResult.data || []) as Array<{ id: string; org_id: string; assigned_to: string | null; created_by: string | null }>
  const subscriptionsData = (subscriptionsResult.data || []) as SubscriptionData[]

  const totalLeads = leadsResult.count || 0
  const newLeads = leadsData.filter(l => l.status === 'new').length
  const trialLeads = leadsData.filter(l => l.subscription_type === 'trial').length
  const paidLeads = leadsData.filter(l => l.subscription_type === 'paid').length

  // Filter demos for sales users (only their assigned/created leads)
  let filteredDemos = demosData
  if (!isAdmin && profile?.id) {
    filteredDemos = demosData.filter(d =>
      d.leads?.assigned_to === profile.id || d.leads?.created_by === profile.id
    )
  }
  const upcomingDemos = filteredDemos.length

  // Filter follow-ups for sales users (only their assigned/created leads)
  let filteredFollowups = followupsData
  if (!isAdmin && profile?.id) {
    filteredFollowups = followupsData.filter(f =>
      f.leads?.assigned_to === profile.id || f.leads?.created_by === profile.id
    )
  }
  const upcomingFollowups = filteredFollowups.length

  // Filter subscriptions for sales users (only their assigned/created leads)
  let filteredSubscriptions = subscriptionsData
  if (!isAdmin && profile?.id) {
    filteredSubscriptions = subscriptionsData.filter(s =>
      s.leads?.assigned_to === profile.id || s.leads?.created_by === profile.id
    )
  }

  const activeSubscriptions = filteredSubscriptions.filter(s => s.status === 'active').length
  const totalRevenue = filteredSubscriptions.reduce((sum, s) => sum + (s.deal_value || 0), 0)

  // Calculate additional subscription stats for admin
  const totalSubscriptions = filteredSubscriptions.length
  const pausedSubscriptions = filteredSubscriptions.filter(s => s.status === 'paused').length
  const nonRecurringSubscriptions = filteredSubscriptions.filter(s => s.validity_days >= 36500).length
  const inactiveSubscriptions = filteredSubscriptions.filter(s => {
    if (s.status === 'paused') return false
    if (s.validity_days >= 36500) return false // non-recurring
    if (s.status === 'active') return false
    return true
  }).length
  const totalCredited = filteredSubscriptions.reduce((sum, s) => sum + (s.amount_credited || 0), 0)
  const totalPending = filteredSubscriptions.reduce((sum, s) => sum + (s.amount_pending || 0), 0)

  // Get pending approvals count for accountant
  const pendingApprovalsCount = (approvalsResult?.count || 0) as number

  // Build stats based on role
  const stats = isAccountant ? [
    {
      title: 'Pending Approvals',
      value: pendingApprovalsCount.toString(),
      icon: FileText,
      description: 'Awaiting review',
      href: `/${orgSlug}/approvals`,
    },
    {
      title: 'Active Subscriptions',
      value: activeSubscriptions.toString(),
      icon: Users,
      description: 'Currently active',
      href: `/${orgSlug}/subscriptions`,
    },
  ] : [
    {
      title: 'Total Leads',
      value: totalLeads.toString(),
      icon: Target,
      description: `${newLeads} new ${trialLeads > 0 || paidLeads > 0 ? `| ${trialLeads} trial | ${paidLeads} paid` : ''}`,
      href: `/${orgSlug}/leads`,
    },
    {
      title: 'Upcoming Meetings',
      value: upcomingDemos.toString(),
      icon: CalendarDays,
      description: 'Future scheduled',
      href: `/${orgSlug}/meetings`,
    },
    {
      title: 'Pending Follow-ups',
      value: upcomingFollowups.toString(),
      icon: Phone,
      description: 'Need attention',
      href: `/${orgSlug}/follow-ups`,
    },
    {
      title: 'Active Subscriptions',
      value: activeSubscriptions.toString(),
      icon: Users,
      description: 'Currently active',
      href: `/${orgSlug}/subscriptions`,
    },
  ]

  // Fetch organization subscription/quota info (for admin)
  type OrgSubscription = {
    subscription_type: string
    validity_days: number
    sales_quota: number | null
    accountant_quota: number | null
    start_date: string
    end_date: string
    status: string
  }

  let orgSubscription: OrgSubscription | null = null
  let salesCount = 0
  let accountantCount = 0

  if (isAdmin) {
    const { data: subData } = await supabase
      .from('org_subscriptions')
      .select('subscription_type, validity_days, sales_quota, accountant_quota, start_date, end_date, status')
      .eq('org_id', org.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (subData) {
      orgSubscription = subData as OrgSubscription
    }

    // Count current team members
    const { count: salesCountResult } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', org.id)
      .eq('role', 'sales')
      .eq('is_active', true)

    const { count: accountantCountResult } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', org.id)
      .eq('role', 'accountant')
      .eq('is_active', true)

    salesCount = salesCountResult || 0
    accountantCount = accountantCountResult || 0
  }

  // Get recent leads (filtered for sales users, skip for accountants)
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

  // Skip recent leads query for accountants
  const recentLeadsResult = isAccountant
    ? Promise.resolve({ data: [] })
    : recentLeadsQuery

  const { data: recentLeadsData } = await recentLeadsResult

  type RecentLead = { id: string; name: string; status: string; created_at: string }
  const recentLeads = (recentLeadsData || []) as RecentLead[]

  // Get upcoming follow-ups (filtered for sales users, skip for accountants)
  // Only show follow-ups that haven't passed yet
  const now = new Date()
  const currentTimeISO = now.toISOString()

  // Get today's end date in IST for limiting the scope
  const istOffset = 5.5 * 60 * 60 * 1000 // 5.5 hours in milliseconds
  const istNow = new Date(now.getTime() + istOffset)
  const istDateStr = istNow.toISOString().split('T')[0]
  const todayEndIST = new Date(`${istDateStr}T23:59:59+05:30`)
  const todayEndISO = todayEndIST.toISOString()

  type FollowupDataRaw = { id: string; next_followup: string | null; leads: { id: string; name: string; phone: string | null; assigned_to: string | null; created_by: string | null } }

  // Fetch upcoming follow-ups (from current time to end of today) - skip for accountants
  const followupsQueryForToday = isAccountant
    ? Promise.resolve({ data: [] })
    : supabase
        .from('lead_activities')
        .select(`
          id,
          next_followup,
          leads!inner(id, name, phone, org_id, assigned_to, created_by)
        `)
        .eq('leads.org_id', org.id)
        .gte('next_followup', currentTimeISO)
        .lte('next_followup', todayEndISO)
        .order('next_followup', { ascending: true })
        .limit(20)

  const { data: allTodayFollowups } = await followupsQueryForToday
  let todayFollowupsData = (allTodayFollowups || []) as FollowupDataRaw[]

  // Filter for sales users - only their assigned/created leads
  if (!isAccountant && profile?.role === 'sales' && profile?.id) {
    todayFollowupsData = todayFollowupsData.filter(f =>
      f.leads?.assigned_to === profile.id || f.leads?.created_by === profile.id
    )
  }

  type FollowupData = { id: string; next_followup: string | null; leads: { id: string; name: string; phone: string | null } }
  const todayFollowups = todayFollowupsData.slice(0, 10) as FollowupData[]

  // Get upcoming demos/meetings (filtered for sales users, skip for accountants)
  type TodayDemoData = {
    id: string;
    scheduled_at: string;
    google_meet_link: string | null;
    leads: { id: string; name: string; phone: string | null; assigned_to: string | null; created_by: string | null }
  }

  // Fetch upcoming demos (from current time to end of today) - only ones that haven't passed - skip for accountants
  const demosQueryForToday = isAccountant
    ? Promise.resolve({ data: [] })
    : supabase
        .from('demos')
        .select(`
          id,
          scheduled_at,
          google_meet_link,
          leads!inner(id, name, phone, org_id, assigned_to, created_by)
        `)
        .eq('leads.org_id', org.id)
        .eq('status', 'scheduled')
        .gte('scheduled_at', currentTimeISO)
        .lte('scheduled_at', todayEndISO)
        .order('scheduled_at', { ascending: true })
        .limit(20)

  const { data: allTodayDemos } = await demosQueryForToday
  let todayDemosData = (allTodayDemos || []) as TodayDemoData[]

  // Filter for sales users - only their assigned/created leads
  if (!isAccountant && profile?.role === 'sales' && profile?.id) {
    todayDemosData = todayDemosData.filter(d =>
      d.leads?.assigned_to === profile.id || d.leads?.created_by === profile.id
    )
  }

  const todayDemos = todayDemosData.slice(0, 10)
  const hasReminders = todayDemos.length > 0 || todayFollowups.length > 0

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-500'
      case 'call_not_picked': return 'bg-yellow-500'
      case 'not_interested': return 'bg-gray-500'
      case 'follow_up_again': return 'bg-orange-500'
      case 'demo_booked': return 'bg-purple-500'
      case 'demo_completed': return 'bg-indigo-500'
      case 'deal_won': return 'bg-emerald-500'
      case 'deal_lost': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      new: 'New',
      call_not_picked: 'Call Not Picked',
      not_interested: 'Not Interested',
      follow_up_again: 'Follow Up Again',
      demo_booked: 'Meeting Booked',
      demo_completed: 'Meeting Completed',
      deal_won: 'Deal Won',
      deal_lost: 'Deal Lost',
    }
    return labels[status] || status.replace(/_/g, ' ')
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title={`Welcome back, ${profile?.name?.split(' ')[0] || 'User'}!`}
        description={`Here's what's happening at ${org.name}`}
      />

      <div className="flex-1 p-4 lg:p-6 space-y-4 lg:space-y-6">
        {/* Upcoming Reminders */}
        {hasReminders && (
          <Card className="border-orange-300 bg-orange-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-orange-700">
                <Bell className="h-5 w-5" />
                Upcoming Reminders
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Today's Meetings */}
              {todayDemos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-orange-700 flex items-center gap-1">
                    <Video className="h-4 w-4" />
                    Meetings Scheduled ({todayDemos.length})
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {todayDemos.map((demo) => {
                      // Format with timezone (same as meetings page)
                      const dateStr = formatInTimeZone(new Date(demo.scheduled_at), DEFAULT_TIMEZONE, 'MMM d, yyyy')
                      const timeStr = formatInTimeZone(new Date(demo.scheduled_at), DEFAULT_TIMEZONE, 'h:mm a')

                      return (
                        <div
                          key={demo.id}
                          className="flex items-center gap-3 p-2 bg-white rounded-lg border border-orange-200"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{demo.leads?.phone || demo.leads?.name}</p>
                            {demo.leads?.name && demo.leads.name !== demo.leads.phone && (
                              <p className="text-xs text-muted-foreground truncate">{demo.leads.name}</p>
                            )}
                            <p className="text-xs text-orange-600">
                              {dateStr} at {timeStr}
                            </p>
                          </div>
                          {demo.google_meet_link && (
                            <a
                              href={demo.google_meet_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs bg-orange-500 text-white px-2 py-1 rounded hover:bg-orange-600 transition-colors"
                            >
                              Join
                            </a>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Today's Follow-ups */}
              {todayFollowups.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-orange-700 flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    Follow-ups Due ({todayFollowups.length})
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {todayFollowups.slice(0, 4).map((followup) => {
                      const timeStr = followup.next_followup
                        ? formatInTimeZone(new Date(followup.next_followup), DEFAULT_TIMEZONE, 'h:mm a')
                        : 'Today'
                      return (
                        <div
                          key={followup.id}
                          className="flex items-center gap-3 p-2 bg-white rounded-lg border border-orange-200"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{followup.leads?.phone || followup.leads?.name}</p>
                            {followup.leads?.name && followup.leads.name !== followup.leads.phone && (
                              <p className="text-xs text-muted-foreground truncate">{followup.leads.name}</p>
                            )}
                            <p className="text-xs text-orange-600">{timeStr}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {todayFollowups.length > 4 && (
                    <Link href={`/${orgSlug}/follow-ups`} className="text-xs text-orange-600 hover:underline">
                      +{todayFollowups.length - 4} more follow-ups
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

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

        {/* Subscription Stats (Admin Only) */}
        {isAdmin && totalSubscriptions > 0 && (
          <Card className="animate-fade-in animate-delay-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Subscription Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold">{totalSubscriptions}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-green-500/10">
                  <p className="text-2xl font-bold text-green-600">{activeSubscriptions}</p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-yellow-500/10">
                  <p className="text-2xl font-bold text-yellow-600">{pausedSubscriptions}</p>
                  <p className="text-xs text-muted-foreground">Paused</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-500/10">
                  <p className="text-2xl font-bold text-gray-600">{nonRecurringSubscriptions}</p>
                  <p className="text-xs text-muted-foreground">Non Recurring</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-primary/10">
                  <p className="text-2xl font-bold text-primary">₹{totalCredited.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Credited</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-red-500/10">
                  <p className="text-2xl font-bold text-red-600">₹{totalPending.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Organization Quota Info (Admin Only) */}
        {isAdmin && orgSubscription && (
          <Card className="animate-fade-in animate-delay-300 border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Team Quota
                </CardTitle>
                <Badge variant={orgSubscription.subscription_type === 'paid' ? 'default' : 'secondary'}>
                  {orgSubscription.subscription_type === 'paid' ? 'Paid Plan' : 'Trial'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-lg bg-background">
                  <p className="text-2xl font-bold text-blue-600">
                    {salesCount}/{orgSubscription.sales_quota === null ? '∞' : orgSubscription.sales_quota}
                  </p>
                  <p className="text-xs text-muted-foreground">Sales Reps</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-background">
                  <p className="text-2xl font-bold text-green-600">
                    {accountantCount}/{orgSubscription.accountant_quota === null ? '∞' : orgSubscription.accountant_quota}
                  </p>
                  <p className="text-xs text-muted-foreground">Accountants</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-background">
                  <p className="text-2xl font-bold">
                    {orgSubscription.validity_days >= 36500 ? 'Lifetime' : `${orgSubscription.validity_days} days`}
                  </p>
                  <p className="text-xs text-muted-foreground">Plan Validity</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-background">
                  <p className={`text-2xl font-bold ${orgSubscription.status === 'active' ? 'text-green-600' : 'text-yellow-600'}`}>
                    {orgSubscription.status === 'active' ? 'Active' : orgSubscription.status}
                  </p>
                  <p className="text-xs text-muted-foreground">Subscription Status</p>
                </div>
              </div>
              {orgSubscription.end_date && orgSubscription.validity_days < 36500 && (
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  Plan expires on {new Date(orgSubscription.end_date).toLocaleDateString('en-IN', { dateStyle: 'long' })}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Main Content Grid */}
        {isAccountant ? (
          /* Accountant Dashboard - Pending Approvals Quick Action */
          <Card className="animate-fade-in animate-delay-400">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Pending Approvals</CardTitle>
                <CardDescription>Subscription requests awaiting your review</CardDescription>
              </div>
              <Link href={`/${orgSlug}/approvals`}>
                <Button variant="ghost" size="sm">
                  View all
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {pendingApprovalsCount > 0 ? (
                <div className="space-y-4">
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-yellow-900">
                          {pendingApprovalsCount} subscription{pendingApprovalsCount > 1 ? 's' : ''} pending approval
                        </p>
                        <p className="text-sm text-yellow-700 mt-1">
                          Review and approve subscription requests from sales team
                        </p>
                      </div>
                      <Link href={`/${orgSlug}/approvals`}>
                        <Button>
                          Review Now
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50 text-green-500" />
                  <p>No pending approvals</p>
                  <p className="text-xs mt-1">All subscription requests have been reviewed</p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
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
                        <p className="text-sm text-muted-foreground">
                          {getStatusLabel(lead.status)}
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

          {/* Lead Status Overview */}
          <Card className="animate-fade-in animate-delay-500">
            <CardHeader>
              <CardTitle>Lead Status Overview</CardTitle>
              <CardDescription>Quick breakdown of your pipeline</CardDescription>
            </CardHeader>
            <CardContent>
              {leadsData.length > 0 ? (
                <div className="space-y-3">
                  {(() => {
                    const statusCounts = leadsData.reduce((acc, lead) => {
                      acc[lead.status] = (acc[lead.status] || 0) + 1
                      return acc
                    }, {} as Record<string, number>)

                    const statusOrder = ['new', 'call_not_picked', 'follow_up_again', 'demo_booked', 'demo_completed', 'deal_won', 'deal_lost', 'not_interested']

                    return statusOrder
                      .filter(status => statusCounts[status])
                      .map(status => {
                        const count = statusCounts[status]
                        const percentage = Math.round((count / leadsData.length) * 100)
                        return (
                          <div key={status} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span>{getStatusLabel(status)}</span>
                              <span className="text-muted-foreground">{count} ({percentage}%)</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full ${getStatusColor(status)} transition-all`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        )
                      })
                  })()}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No leads to analyze</p>
                </div>
              )}
            </CardContent>
          </Card>
          </div>
        )}

      </div>
    </div>
  )
}

