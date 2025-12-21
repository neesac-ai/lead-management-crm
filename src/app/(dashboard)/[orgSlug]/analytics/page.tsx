'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Target, 
  TrendingUp, 
  CheckCircle2, 
  XCircle, 
  Calendar,
  Users,
  BarChart3,
  Phone
} from 'lucide-react'
import { User, Lead, LeadStatus } from '@/types/database.types'
import { format, subDays, startOfDay, endOfDay, isWithinInterval } from 'date-fns'

type DateFilter = 'today' | 'last_7_days' | 'last_30_days' | 'all_time'

interface SalesPerformance {
  user: User
  totalLeads: number
  actionedLeads: number
  statusBreakdown: Record<LeadStatus, number>
  actionRate: number
  conversionRate: number
}

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  call_not_picked: 'Call Not Picked',
  not_interested: 'Not Interested',
  follow_up_again: 'Follow Up Again',
  demo_booked: 'Demo Booked',
  demo_completed: 'Demo Completed',
  deal_won: 'Deal Won',
  deal_lost: 'Deal Lost'
}

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: 'bg-blue-500',
  call_not_picked: 'bg-yellow-500',
  not_interested: 'bg-gray-500',
  follow_up_again: 'bg-orange-500',
  demo_booked: 'bg-purple-500',
  demo_completed: 'bg-indigo-500',
  deal_won: 'bg-green-500',
  deal_lost: 'bg-red-500'
}

export default function AnalyticsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  const supabase = createClient()

  const [user, setUser] = useState<User | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [salesTeam, setSalesTeam] = useState<User[]>([])
  const [dateFilter, setDateFilter] = useState<DateFilter>('all_time')
  const [loading, setLoading] = useState(true)

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

  useEffect(() => {
    fetchData()
  }, [orgSlug])

  async function fetchData() {
    try {
      // Get current user
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return

      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', authUser.id)
        .single()

      if (!userData) return
      
      // Cast to access properties safely
      const userWithRole = userData as unknown as { id: string; role: string; org_id: string }
      setUser(userData)

      // Get organization
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single()

      if (!orgData) return

      const org = orgData as unknown as { id: string }

      // Fetch leads based on role
      let leadsQuery = supabase
        .from('leads')
        .select('*')
        .eq('org_id', org.id)

      if (userWithRole.role === 'sales') {
        // Sales can only see their assigned leads
        leadsQuery = leadsQuery.eq('assigned_to', userWithRole.id)
      }

      const { data: leadsData } = await leadsQuery
      setLeads(leadsData || [])

      // Admin can see sales team performance
      if (userWithRole.role === 'admin' || userWithRole.role === 'super_admin') {
        const { data: teamData } = await supabase
          .from('users')
          .select('*')
          .eq('org_id', org.id)
          .eq('role', 'sales')
          .eq('is_approved', true)

        setSalesTeam(teamData || [])
      }
    } catch (error) {
      console.error('Error fetching analytics data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter leads by date
  function getFilteredLeads(): Lead[] {
    if (dateFilter === 'all_time') return leads

    const now = new Date()
    let startDate: Date

    switch (dateFilter) {
      case 'today':
        startDate = startOfDay(now)
        break
      case 'last_7_days':
        startDate = subDays(now, 7)
        break
      case 'last_30_days':
        startDate = subDays(now, 30)
        break
      default:
        return leads
    }

    return leads.filter(lead => {
      const leadDate = new Date(lead.created_at)
      return isWithinInterval(leadDate, { start: startDate, end: endOfDay(now) })
    })
  }

  // Calculate status breakdown
  function getStatusBreakdown(filteredLeads: Lead[]): Record<LeadStatus, number> {
    const breakdown: Record<LeadStatus, number> = {
      new: 0,
      call_not_picked: 0,
      not_interested: 0,
      follow_up_again: 0,
      demo_booked: 0,
      demo_completed: 0,
      deal_won: 0,
      deal_lost: 0
    }

    filteredLeads.forEach(lead => {
      if (lead.status in breakdown) {
        breakdown[lead.status]++
      }
    })

    return breakdown
  }

  // Calculate sales team performance
  function getSalesPerformance(): SalesPerformance[] {
    const filteredLeads = getFilteredLeads()
    
    return salesTeam.map(member => {
      const memberLeads = filteredLeads.filter(lead => lead.assigned_to === member.id)
      const statusBreakdown = getStatusBreakdown(memberLeads)
      const wonDeals = statusBreakdown.deal_won
      const actionedLeads = memberLeads.length - statusBreakdown.new // All leads except new
      
      return {
        user: member,
        totalLeads: memberLeads.length,
        actionedLeads,
        statusBreakdown,
        actionRate: memberLeads.length > 0 
          ? Math.round((actionedLeads / memberLeads.length) * 100) 
          : 0,
        conversionRate: actionedLeads > 0 
          ? Math.round((wonDeals / actionedLeads) * 100) 
          : 0
      }
    }).sort((a, b) => b.totalLeads - a.totalLeads)
  }

  const filteredLeads = getFilteredLeads()
  const statusBreakdown = getStatusBreakdown(filteredLeads)
  const salesPerformance = isAdmin ? getSalesPerformance() : []

  // Calculate key metrics
  const totalLeads = filteredLeads.length
  const activeLeads = filteredLeads.filter(l => 
    !['deal_won', 'deal_lost', 'not_interested'].includes(l.status)
  ).length
  const wonDeals = statusBreakdown.deal_won
  const lostDeals = statusBreakdown.deal_lost
  const actionedLeadsCount = totalLeads - statusBreakdown.new // All leads except new
  const actionRate = totalLeads > 0 
    ? Math.round((actionedLeadsCount / totalLeads) * 100) 
    : 0
  const conversionRate = actionedLeadsCount > 0 
    ? Math.round((wonDeals / actionedLeadsCount) * 100) 
    : 0

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <>
      <Header 
        title="Analytics" 
        description={isAdmin ? "Team performance and lead insights" : "Your performance metrics"}
      />
      
      <div className="flex-1 p-4 lg:p-6 space-y-6">
        {/* Date Filter */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Time Period
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'today', label: 'Today' },
                { value: 'last_7_days', label: 'Last 7 Days' },
                { value: 'last_30_days', label: 'Last 30 Days' },
                { value: 'all_time', label: 'All Time' },
              ].map((filter) => (
                <Button
                  key={filter.value}
                  variant={dateFilter === filter.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDateFilter(filter.value as DateFilter)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Target className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalLeads}</p>
                  <p className="text-xs text-muted-foreground">Total Leads</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Phone className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{actionedLeadsCount}</p>
                  <p className="text-xs text-muted-foreground">Actioned</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-100 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-cyan-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{actionRate}%</p>
                  <p className="text-xs text-muted-foreground">Action Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{wonDeals}</p>
                  <p className="text-xs text-muted-foreground">Deals Won</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{conversionRate}%</p>
                  <p className="text-xs text-muted-foreground">Win Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Lead Status Breakdown
            </CardTitle>
            <CardDescription>
              Distribution of leads across different stages
            </CardDescription>
          </CardHeader>
          <CardContent>
            {totalLeads === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No leads found for this time period
              </p>
            ) : (
              <div className="space-y-3">
                {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((status) => {
                  const count = statusBreakdown[status]
                  const percentage = totalLeads > 0 ? (count / totalLeads) * 100 : 0
                  
                  if (count === 0) return null
                  
                  return (
                    <div key={status} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{STATUS_LABELS[status]}</span>
                        <span className="text-muted-foreground">
                          {count} ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${STATUS_COLORS[status]} transition-all duration-500`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sales Team Performance (Admin Only) */}
        {isAdmin && salesTeam.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Sales Team Performance
              </CardTitle>
              <CardDescription>
                Individual performance metrics for each sales rep
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2 font-medium">Sales Rep</th>
                      <th className="text-center py-3 px-2 font-medium">Total</th>
                      <th className="text-center py-3 px-2 font-medium">Actioned</th>
                      <th className="text-center py-3 px-2 font-medium">Action %</th>
                      <th className="text-center py-3 px-2 font-medium">Demo</th>
                      <th className="text-center py-3 px-2 font-medium">Won</th>
                      <th className="text-center py-3 px-2 font-medium">Win Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesPerformance.map((perf) => (
                      <tr key={perf.user.id} className="border-b last:border-0">
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                              {perf.user.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium">{perf.user.name}</span>
                          </div>
                        </td>
                        <td className="text-center py-3 px-2">
                          <Badge variant="secondary">{perf.totalLeads}</Badge>
                        </td>
                        <td className="text-center py-3 px-2">{perf.actionedLeads}</td>
                        <td className="text-center py-3 px-2">
                          <Badge 
                            variant={perf.actionRate >= 70 ? 'default' : 'secondary'}
                            className={perf.actionRate >= 70 ? 'bg-cyan-600' : ''}
                          >
                            {perf.actionRate}%
                          </Badge>
                        </td>
                        <td className="text-center py-3 px-2">
                          {perf.statusBreakdown.demo_booked + perf.statusBreakdown.demo_completed}
                        </td>
                        <td className="text-center py-3 px-2">
                          <span className="text-green-600 font-medium">
                            {perf.statusBreakdown.deal_won}
                          </span>
                        </td>
                        <td className="text-center py-3 px-2">
                          <Badge 
                            variant={perf.conversionRate >= 50 ? 'default' : 'secondary'}
                            className={perf.conversionRate >= 50 ? 'bg-green-600' : ''}
                          >
                            {perf.conversionRate}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4">
                {salesPerformance.map((perf) => (
                  <div key={perf.user.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                          {perf.user.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">{perf.user.name}</span>
                      </div>
                      <Badge variant="secondary">{perf.totalLeads} leads</Badge>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2 text-center text-sm">
                      <div className="bg-slate-50 rounded p-2">
                        <p className="text-muted-foreground text-xs">Total</p>
                        <p className="font-medium">{perf.totalLeads}</p>
                      </div>
                      <div className="bg-blue-50 rounded p-2">
                        <p className="text-muted-foreground text-xs">Actioned</p>
                        <p className="font-medium">{perf.actionedLeads}</p>
                      </div>
                      <div className="bg-cyan-50 rounded p-2">
                        <p className="text-muted-foreground text-xs">Action%</p>
                        <p className="font-medium">{perf.actionRate}%</p>
                      </div>
                      <div className="bg-purple-50 rounded p-2">
                        <p className="text-muted-foreground text-xs">Demos</p>
                        <p className="font-medium">
                          {perf.statusBreakdown.demo_booked + perf.statusBreakdown.demo_completed}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-green-600 text-sm">
                        <CheckCircle2 className="h-4 w-4 inline mr-1" />
                        {perf.statusBreakdown.deal_won} won
                      </span>
                      <Badge 
                        variant={perf.conversionRate >= 50 ? 'default' : 'secondary'}
                        className={perf.conversionRate >= 50 ? 'bg-green-600' : ''}
                      >
                        {perf.conversionRate}% win
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>

              {salesPerformance.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No sales team members found
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Quick Stats for Sales Rep */}
        {!isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>Your Activity Summary</CardTitle>
              <CardDescription>
                Your lead handling performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <p className="text-3xl font-bold text-slate-700">
                    {statusBreakdown.new + statusBreakdown.call_not_picked + statusBreakdown.follow_up_again}
                  </p>
                  <p className="text-sm text-muted-foreground">Leads to Follow Up</p>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <p className="text-3xl font-bold text-purple-700">
                    {statusBreakdown.demo_booked}
                  </p>
                  <p className="text-sm text-muted-foreground">Demos Scheduled</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <p className="text-3xl font-bold text-green-700">
                    {statusBreakdown.deal_won}
                  </p>
                  <p className="text-sm text-muted-foreground">Deals Closed</p>
                </div>
                <div className="text-center p-4 bg-indigo-50 rounded-lg">
                  <p className="text-3xl font-bold text-indigo-700">
                    {statusBreakdown.demo_completed}
                  </p>
                  <p className="text-sm text-muted-foreground">Demos Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}

