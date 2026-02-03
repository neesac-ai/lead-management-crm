'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import {
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  Calendar,
  Users,
  BarChart3,
  Phone,
  Clock,
  Loader2,
  User as UserIcon,
  ChevronDown,
} from 'lucide-react'
import { User, Lead, LeadStatus } from '@/types/database.types'
import { format, subDays, startOfDay, endOfDay, isWithinInterval } from 'date-fns'
import Link from 'next/link'
import { getLeadStatuses } from '@/lib/lead-statuses'
import { getMenuNames, getMenuLabel } from '@/lib/menu-names'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

type DateFilter = 'today' | 'last_7_days' | 'last_30_days' | 'all_time' | 'custom'

interface SalesPerformance {
  user: User
  totalLeads: number
  actionedLeads: number
  statusBreakdown: Record<LeadStatus, number>
  actionRate: number
  conversionRate: number
}

// Helper function to get status label
const getStatusLabel = (status: string, leadStatuses: Array<{ status_value: string; label: string }>): string => {
  const statusObj = leadStatuses.find(s => s.status_value === status)
  return statusObj?.label || status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

// Helper function to get status color
const getStatusColor = (status: string, leadStatuses: Array<{ status_value: string; color: string }>): string => {
  const statusObj = leadStatuses.find(s => s.status_value === status)
  return statusObj?.color || 'bg-gray-500'
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

const CHART_STATUS_COLORS: Record<LeadStatus, string> = {
  new: '#3b82f6',
  call_not_picked: '#eab308',
  not_interested: '#6b7280',
  follow_up_again: '#f97316',
  demo_booked: '#a855f7',
  demo_completed: '#6366f1',
  deal_won: '#22c55e',
  deal_lost: '#ef4444',
}

const SMALL_LEGEND_PROPS = {
  wrapperStyle: { fontSize: 10 },
  iconSize: 8,
  iconType: 'square' as const,
  layout: 'horizontal' as const,
  align: 'center' as const,
}

const LEAD_STATUS_OPTIONS: LeadStatus[] = ['new', 'call_not_picked', 'not_interested', 'follow_up_again', 'demo_booked', 'demo_completed', 'deal_won', 'deal_lost']

const ACTION_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  call: { label: 'Call Made', color: 'bg-blue-100 text-blue-700' },
  email: { label: 'Email Sent', color: 'bg-cyan-100 text-cyan-700' },
  meeting: { label: 'Meeting', color: 'bg-purple-100 text-purple-700' },
  note: { label: 'Note Added', color: 'bg-gray-100 text-gray-700' },
  follow_up: { label: 'Follow-up', color: 'bg-orange-100 text-orange-700' },
  status_change: { label: 'Status Changed', color: 'bg-indigo-100 text-indigo-700' },
  demo_booked: { label: 'Meeting Booked', color: 'bg-purple-100 text-purple-700' },
  demo_completed: { label: 'Meeting Done', color: 'bg-indigo-100 text-indigo-700' },
  deal_won: { label: 'Deal Won', color: 'bg-green-100 text-green-700' },
  deal_lost: { label: 'Deal Lost', color: 'bg-red-100 text-red-700' },
  whatsapp: { label: 'WhatsApp', color: 'bg-emerald-100 text-emerald-700' },
}

export default function AnalyticsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  const supabase = createClient()

  // User & org state
  const [user, setUser] = useState<User | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isManager, setIsManager] = useState(false)
  const [canViewTeam, setCanViewTeam] = useState(false)

  // Lead analytics state
  const [leads, setLeads] = useState<Lead[]>([])
  const [salesTeam, setSalesTeam] = useState<User[]>([])
  const [dateFilter, setDateFilter] = useState<DateFilter>('all_time')
  const [customDateFrom, setCustomDateFrom] = useState<string>('')
  const [customDateTo, setCustomDateTo] = useState<string>('')
  const [leadStatuses, setLeadStatuses] = useState<Array<{ status_value: string; label: string; color: string }>>([])
  const [menuNames, setMenuNames] = useState<Record<string, string>>({})

  // Chart filters: multi-select for line chart and bar chart (empty = all statuses)
  const [lineChartStatusFilter, setLineChartStatusFilter] = useState<Set<LeadStatus>>(new Set())
  const [barChartStatusFilter, setBarChartStatusFilter] = useState<Set<LeadStatus>>(new Set())
  const [pieRepByStatusFilter, setPieRepByStatusFilter] = useState<string>('')
  const [pieRepBySubFilter, setPieRepBySubFilter] = useState<string>('trial')
  const [pieStatusByRepFilter, setPieStatusByRepFilter] = useState<string>('')
  const [pieSubByRepFilter, setPieSubByRepFilter] = useState<string>('')

  // Sales rep detail view
  const [selectedRepForDetail, setSelectedRepForDetail] = useState<SalesPerformance | null>(null)
  const [repActivities, setRepActivities] = useState<Array<{
    id: string
    lead_id: string
    action_type: string
    comments: string | null
    action_date: string
    lead_name?: string
    lead_status?: string
  }>>([])
  const [loadingActivities, setLoadingActivities] = useState(false)

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

  useEffect(() => {
    fetchData()
    fetchLeadStatuses()
    fetchMenuNames()
  }, [orgSlug])

  // Fetch menu names
  const fetchMenuNames = async () => {
    try {
      const names = await getMenuNames()
      setMenuNames(names)
    } catch (error) {
      console.error('Error fetching menu names:', error)
    }
  }

  // Listen for menu name updates
  useEffect(() => {
    const handleMenuNamesUpdate = () => {
      fetchMenuNames()
    }
    window.addEventListener('menu-names-updated', handleMenuNamesUpdate)
    return () => {
      window.removeEventListener('menu-names-updated', handleMenuNamesUpdate)
    }
  }, [])

  // Fetch custom lead statuses
  async function fetchLeadStatuses() {
    try {
      const statuses = await getLeadStatuses()
      setLeadStatuses(statuses)
    } catch (error) {
      console.error('Error fetching lead statuses:', error)
    }
  }

  // Listen for lead status updates
  useEffect(() => {
    const handleStatusUpdate = () => {
      fetchLeadStatuses()
    }
    window.addEventListener('lead-statuses-updated', handleStatusUpdate)
    return () => {
      window.removeEventListener('lead-statuses-updated', handleStatusUpdate)
    }
  }, [])

  async function fetchData() {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return

      const { data: userData } = await supabase
        .from('users')
        .select('id, name, role, org_id, google_refresh_token')
        .eq('auth_id', authUser.id)
        .single()

      if (!userData) return
      setUser(userData as User)
      // Note: Google Drive sync removed - using native call tracking only

      const { data: orgData } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single()

      if (!orgData) return
      const currentOrgId = (orgData as { id: string }).id
      setOrgId(currentOrgId)

      // Calculate isAdmin from userData (not from state which might be stale)
      const currentIsAdmin = userData.role === 'admin' || userData.role === 'super_admin'

      // Check if user is a manager (sales with reportees)
      let isManager = false
      let accessibleUserIds: string[] = [userData.id]

      if (userData.role === 'sales') {
        try {
          const { data: reportees } = await supabase
            .rpc('get_all_reportees', { manager_user_id: userData.id } as any)

          const reporteeIds = (reportees as Array<{ reportee_id: string }> | null)?.map((r: { reportee_id: string }) => r.reportee_id) || []
          if (reporteeIds.length > 0) {
            isManager = true
            accessibleUserIds = [userData.id, ...reporteeIds]
          }
        } catch (error) {
          console.error('Error fetching reportees:', error)
        }
      }

      const canViewTeamValue = currentIsAdmin || isManager
      setCanViewTeam(canViewTeamValue)
      setIsManager(isManager)

      // Fetch leads - only columns needed for analytics
      let leadsQuery = supabase
        .from('leads')
        .select('id, status, subscription_type, assigned_to, created_by, created_at')
        .eq('org_id', currentOrgId)

      // Sales reps (non-managers) only see their assigned leads
      // Managers and admins see their team's leads
      // For admins: fetch all org leads (no filter)
      // For managers: filter by accessible user IDs (assigned to them or created by them if unassigned)
      // For regular sales: filter by assigned_to
      if (!canViewTeamValue) {
        // Regular sales rep: only their assigned leads
        leadsQuery = leadsQuery.eq('assigned_to', userData.id)
        console.log('[ANALYTICS] Filtering leads for regular sales rep:', userData.id)
      } else if (isManager && !currentIsAdmin) {
        // Manager (sales with reportees): RLS will filter assigned leads, but we need to fetch all org leads
        // and filter in JavaScript to include unassigned leads created by manager/reportees
        // We don't add query filters here - let RLS handle assigned leads, then filter client-side
        console.log('[ANALYTICS] Manager - will filter leads in JavaScript for user IDs:', accessibleUserIds)
      } else if (currentIsAdmin) {
        // Admin: fetch all org leads (no additional filter)
        console.log('[ANALYTICS] Admin user - fetching all org leads (no filter)')
      }

      // Request enough rows so Total Leads matches dashboard (PostgREST default limit is 1000)
      const { data: leadsData, error: leadsError } = await leadsQuery.limit(50000)

      // For managers, also filter in JavaScript to ensure we only include their team's leads
      // This handles cases where the PostgREST filter might not work as expected
      let finalLeadsData = leadsData
      if (isManager && !currentIsAdmin && leadsData) {
        finalLeadsData = leadsData.filter((lead: any) => {
          // Include if assigned to manager or reportee
          if (lead.assigned_to && accessibleUserIds.includes(lead.assigned_to)) {
            return true
          }
          // Include if unassigned and created by manager or reportee
          if (!lead.assigned_to && lead.created_by && accessibleUserIds.includes(lead.created_by)) {
            return true
          }
          return false
        })
      }

      if (leadsError) {
        console.error('[ANALYTICS] ❌ Error fetching leads:', leadsError)
        setLeads([])
      } else {
        const leadsToSet = (finalLeadsData || leadsData || []) as Lead[]
        console.log('[ANALYTICS] ✅ Leads fetched:', leadsToSet.length, 'leads for org:', currentOrgId)
        setLeads(leadsToSet)
      }

      // Fetch team members (admin and managers) - includes sales, admins, and managers
      if (canViewTeamValue) {
        let teamQuery = supabase
          .from('users')
          .select('id, name, email, role, org_id')
          .eq('org_id', currentOrgId)
          .in('role', ['sales', 'admin', 'super_admin']) // Include admins and managers
          .eq('is_approved', true)
          .eq('is_active', true)

        // Managers see only their reportees + self (not all admins)
        if (isManager && !currentIsAdmin) {
          // For managers: include only their reportees and themselves
          teamQuery = teamQuery.in('id', accessibleUserIds)
        }

        const { data: teamData, error: teamError } = await teamQuery

        if (teamError) {
          console.error('[ANALYTICS] Error fetching team:', teamError)
          setSalesTeam([])
        } else {
          console.log('[ANALYTICS] ✅ Team fetched:', teamData?.length || 0)
          setSalesTeam((teamData || []) as User[])
        }
      } else {
        setSalesTeam([])
      }

      // Check AI config
      const { data: aiConfigs } = await supabase
        .from('ai_config')
        .select('id')
        .eq('org_id', currentOrgId)
        .eq('is_active', true)
        .limit(1)

    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch activities for selected sales rep
  async function fetchRepActivities(userId: string) {
    if (!orgId) return
    setLoadingActivities(true)

    try {
      // Fetch activities without foreign key relationship
      const { data: activities, error } = await supabase
        .from('lead_activities')
        .select('id, lead_id, action_type, comments, action_date')
        .eq('user_id', userId)
        .order('action_date', { ascending: false })
        .limit(100)

      if (error) {
        console.error('Error fetching activities:', error)
        setRepActivities([])
        return
      }

      // Fetch leads separately
      const leadIds = new Set<string>()
      activities?.forEach((a: { lead_id: string }) => {
        if (a.lead_id) leadIds.add(a.lead_id)
      })

      let leadsMap: Record<string, { name: string; status: string }> = {}
      if (leadIds.size > 0) {
        const { data: leadsData } = await supabase
          .from('leads')
          .select('id, name, status')
          .in('id', Array.from(leadIds))

        if (leadsData) {
          leadsData.forEach(lead => {
            leadsMap[lead.id] = { name: lead.name, status: lead.status }
          })
        }
      }

      // Map activities with lead data
      const formattedActivities = (activities || []).map((a: any) => ({
        id: a.id,
        lead_id: a.lead_id,
        action_type: a.action_type,
        comments: a.comments,
        action_date: a.action_date,
        lead_name: a.lead_id ? (leadsMap[a.lead_id]?.name || null) : null,
        lead_status: a.lead_id ? (leadsMap[a.lead_id]?.status || null) : null,
      }))

      setRepActivities(formattedActivities)
    } catch (error) {
      console.error('Error fetching activities:', error)
    } finally {
      setLoadingActivities(false)
    }
  }

  // Handle sales rep click
  const handleRepClick = (perf: SalesPerformance) => {
    setSelectedRepForDetail(perf)
    fetchRepActivities(perf.user.id)
  }

  // Lead analytics helpers
  function getFilteredLeads(): Lead[] {
    if (dateFilter === 'all_time') return leads

    const now = new Date()
    let startDate: Date
    let endDate: Date = endOfDay(now)

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
      case 'custom':
        if (!customDateFrom && !customDateTo) return leads
        startDate = customDateFrom ? startOfDay(new Date(customDateFrom)) : new Date(0)
        endDate = customDateTo ? endOfDay(new Date(customDateTo)) : endOfDay(now)
        break
      default:
        return leads
    }

    return leads.filter(lead => {
      const leadDate = new Date(lead.created_at)
      return isWithinInterval(leadDate, { start: startDate, end: endDate })
    })
  }

  function getStatusBreakdown(filteredLeads: Lead[]): Record<LeadStatus, number> {
    const breakdown: Record<LeadStatus, number> = {
      new: 0, call_not_picked: 0, not_interested: 0, follow_up_again: 0,
      demo_booked: 0, demo_completed: 0, deal_won: 0, deal_lost: 0
    }

    filteredLeads.forEach(lead => {
      if (lead.status in breakdown) {
        breakdown[lead.status]++
      }
    })

    return breakdown
  }

  function getSalesPerformance(): SalesPerformance[] {
    const filteredLeads = getFilteredLeads()

    return salesTeam.map(member => {
      // Count leads assigned to the member, OR unassigned leads created by them
      // This prevents double-counting: if a lead is assigned, count it for the assignee only
      // If unassigned, count it for the creator
      const memberLeads = filteredLeads.filter(lead => {
        // If lead is assigned, count it only for the assignee
        if (lead.assigned_to) {
          return lead.assigned_to === member.id
        }
        // If lead is unassigned, count it for the creator (if they're admin/super_admin/sales)
        return (member.role === 'admin' || member.role === 'super_admin' || member.role === 'sales') && lead.created_by === member.id
      })
      const statusBreakdown = getStatusBreakdown(memberLeads)
      const wonDeals = statusBreakdown.deal_won
      const actionedLeads = memberLeads.length - statusBreakdown.new

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

  // Memoize expensive lead analytics calculations
  const filteredLeads = useMemo(() => getFilteredLeads(), [leads, dateFilter, customDateFrom, customDateTo])
  const statusBreakdown = useMemo(() => getStatusBreakdown(filteredLeads), [filteredLeads])
  const salesPerformance = useMemo(() => canViewTeam ? getSalesPerformance() : [], [canViewTeam, leads, salesTeam])

  // Lead metrics
  const totalLeads = filteredLeads.length
  const wonDeals = statusBreakdown.deal_won
  const actionedLeadsCount = totalLeads - statusBreakdown.new
  const actionRate = totalLeads > 0 ? Math.round((actionedLeadsCount / totalLeads) * 100) : 0
  const conversionRate = actionedLeadsCount > 0 ? Math.round((wonDeals / actionedLeadsCount) * 100) : 0

  // Line chart: one line per (selected or all) lead status; data has one key per status per date
  const lineChartStatuses = lineChartStatusFilter.size === 0 ? LEAD_STATUS_OPTIONS : Array.from(lineChartStatusFilter)
  const leadsByDayData = useMemo(() => {
    const map = new Map<string, Record<LeadStatus, number>>()
    filteredLeads.forEach((lead) => {
      const key = format(new Date(lead.created_at), 'yyyy-MM-dd')
      const row = map.get(key) || ({} as Record<LeadStatus, number>)
      LEAD_STATUS_OPTIONS.forEach((s) => { if (!(s in row)) row[s] = 0 })
      if (lead.status in row) row[lead.status as LeadStatus] += 1
      map.set(key, row)
    })
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([dateKey, row]) => ({
        date: format(new Date(dateKey), 'MMM d'),
        ...row,
      }))
  }, [filteredLeads])

  // Bar chart: stacked bars by (selected or all) lead statuses
  const barChartStatuses = barChartStatusFilter.size === 0 ? LEAD_STATUS_OPTIONS : Array.from(barChartStatusFilter)
  const leadsByDayByStatusData = useMemo(() => {
    const map = new Map<string, Record<LeadStatus, number>>()
    filteredLeads.forEach((lead) => {
      const key = format(new Date(lead.created_at), 'yyyy-MM-dd')
      const row = map.get(key) || ({} as Record<LeadStatus, number>)
      LEAD_STATUS_OPTIONS.forEach((s) => { if (!(s in row)) row[s] = 0 })
      if (lead.status in row) row[lead.status as LeadStatus] += 1
      map.set(key, row)
    })
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([dateKey, row]) => ({
        date: format(new Date(dateKey), 'MMM d'),
        ...row,
      }))
  }, [filteredLeads])

  // Pie: sales reps by lead status (filter = lead status)
  const pieRepByStatusData = useMemo(() => {
    if (!pieRepByStatusFilter || !canViewTeam || salesTeam.length === 0) return []
    const leadsWithStatus = filteredLeads.filter((l) => l.status === pieRepByStatusFilter)
    const byRep = new Map<string, number>()
    salesTeam.forEach((u) => byRep.set(u.id, 0))
    leadsWithStatus.forEach((lead) => {
      const owner = lead.assigned_to || lead.created_by
      if (owner && byRep.has(owner)) byRep.set(owner, (byRep.get(owner) ?? 0) + 1)
    })
    return salesTeam
      .map((u) => ({ name: u.name, value: byRep.get(u.id) ?? 0 }))
      .filter((d) => d.value > 0)
  }, [filteredLeads, canViewTeam, salesTeam, pieRepByStatusFilter])

  // Pie: sales reps by subscription type (filter = sub type; only leads with subscription)
  const pieRepBySubData = useMemo(() => {
    if (!pieRepBySubFilter || !canViewTeam || salesTeam.length === 0) return []
    const leadsWithSub = filteredLeads.filter((l) => l.subscription_type === pieRepBySubFilter)
    const byRep = new Map<string, number>()
    salesTeam.forEach((u) => byRep.set(u.id, 0))
    leadsWithSub.forEach((lead) => {
      const owner = lead.assigned_to || lead.created_by
      if (owner && byRep.has(owner)) byRep.set(owner, (byRep.get(owner) ?? 0) + 1)
    })
    return salesTeam
      .map((u) => ({ name: u.name, value: byRep.get(u.id) ?? 0 }))
      .filter((d) => d.value > 0)
  }, [filteredLeads, canViewTeam, salesTeam, pieRepBySubFilter])

  // Pie: lead status by sales rep (filter = sales rep)
  const pieStatusByRepData = useMemo(() => {
    if (!pieStatusByRepFilter) return []
    const repLeads = filteredLeads.filter(
      (l) => (l.assigned_to === pieStatusByRepFilter || (!l.assigned_to && l.created_by === pieStatusByRepFilter))
    )
    const breakdown: Record<LeadStatus, number> = {
      new: 0, call_not_picked: 0, not_interested: 0, follow_up_again: 0,
      demo_booked: 0, demo_completed: 0, deal_won: 0, deal_lost: 0,
    }
    repLeads.forEach((l) => {
      if (l.status in breakdown) breakdown[l.status as LeadStatus] += 1
    })
    return (Object.entries(breakdown) as [LeadStatus, number][])
      .filter(([, c]) => c > 0)
      .map(([status, value]) => ({
        name: getStatusLabel(status, leadStatuses),
        value,
        color: CHART_STATUS_COLORS[status],
      }))
  }, [filteredLeads, pieStatusByRepFilter, leadStatuses])

  // Pie: subscription type by sales rep (filter = sales rep; only leads with subscription)
  const pieSubByRepData = useMemo(() => {
    if (!pieSubByRepFilter) return []
    const repLeads = filteredLeads.filter(
      (l) => (l.assigned_to === pieSubByRepFilter || (!l.assigned_to && l.created_by === pieSubByRepFilter)),
    ).filter((l) => l.subscription_type === 'trial' || l.subscription_type === 'paid')
    const trial = repLeads.filter((l) => l.subscription_type === 'trial').length
    const paid = repLeads.filter((l) => l.subscription_type === 'paid').length
    return [
      ...(trial > 0 ? [{ name: 'Trial', value: trial, color: '#3b82f6' }] : []),
      ...(paid > 0 ? [{ name: 'Paid', value: paid, color: '#22c55e' }] : []),
    ]
  }, [filteredLeads, pieSubByRepFilter])

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <Header
        title={getMenuLabel(menuNames, 'analytics', 'Analytics')}
        description={canViewTeam ? "Team performance and insights" : "Your performance metrics"}
      />

      <div className="flex-1 p-3 sm:p-4 lg:p-6 pb-20 lg:pb-6">
        <div className="space-y-3 sm:space-y-4 lg:space-y-6">
          {/* Date Filter */}
          <Card>
            <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-6">
              <CardTitle className="text-sm sm:text-base flex items-center gap-1.5 sm:gap-2">
                <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Time Period
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
              <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2">
                {[
                  { value: 'today', label: 'Today' },
                  { value: 'last_7_days', label: 'Last 7 Days' },
                  { value: 'last_30_days', label: 'Last 30 Days' },
                  { value: 'all_time', label: 'All Time' },
                  { value: 'custom', label: 'Custom' },
                ].map((filter) => (
                  <Button
                    key={filter.value}
                    variant={dateFilter === filter.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDateFilter(filter.value as DateFilter)}
                    className="text-xs sm:text-sm h-8 sm:h-9"
                  >
                    {filter.label}
                  </Button>
                ))}
                {dateFilter === 'custom' && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto sm:ml-2">
                    <Input
                      type="date"
                      value={customDateFrom}
                      onChange={(e) => setCustomDateFrom(e.target.value)}
                      className="w-full sm:w-[140px] h-8 sm:h-9 text-xs sm:text-sm"
                    />
                    <span className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">to</span>
                    <Input
                      type="date"
                      value={customDateTo}
                      onChange={(e) => setCustomDateTo(e.target.value)}
                      className="w-full sm:w-[140px] h-8 sm:h-9 text-xs sm:text-sm"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 lg:gap-4">
            <Card>
              <CardContent className="pt-3 sm:pt-4 lg:pt-6 p-3 sm:p-4 lg:p-6">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 bg-blue-100 rounded-lg shrink-0">
                    <Target className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg sm:text-xl lg:text-2xl font-bold truncate">{totalLeads}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Total Leads</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-3 sm:pt-4 lg:pt-6 p-3 sm:p-4 lg:p-6">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 bg-yellow-100 rounded-lg shrink-0">
                    <Phone className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg sm:text-xl lg:text-2xl font-bold truncate">{actionedLeadsCount}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Actioned</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-3 sm:pt-4 lg:pt-6 p-3 sm:p-4 lg:p-6">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 bg-cyan-100 rounded-lg shrink-0">
                    <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-cyan-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg sm:text-xl lg:text-2xl font-bold truncate">{actionRate}%</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Action Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-3 sm:pt-4 lg:pt-6 p-3 sm:p-4 lg:p-6">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 bg-green-100 rounded-lg shrink-0">
                    <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg sm:text-xl lg:text-2xl font-bold truncate">{wonDeals}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Deals Won</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-3 sm:pt-4 lg:pt-6 p-3 sm:p-4 lg:p-6">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 bg-purple-100 rounded-lg shrink-0">
                    <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg sm:text-xl lg:text-2xl font-bold truncate">{conversionRate}%</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Win Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts: Line, Stacked Bar, Pie */}
          <Card>
            <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-3">
              <CardTitle className="text-sm sm:text-base flex items-center gap-1.5 sm:gap-2">
                <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-5 lg:w-5" />
                Charts
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Leads over time, status breakdown, and distribution</CardDescription>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 space-y-6">
              {/* Leads over time – multi-select lead status for line chart */}
              {leadsByDayData.length > 0 && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <p className="text-xs sm:text-sm font-medium">Leads over time</p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="text-xs gap-1 h-8">
                          {lineChartStatusFilter.size === 0 ? 'All statuses' : `${lineChartStatusFilter.size} selected`}
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {LEAD_STATUS_OPTIONS.map((s) => (
                          <DropdownMenuCheckboxItem
                            key={s}
                            checked={lineChartStatusFilter.size === 0 || lineChartStatusFilter.has(s)}
                            onCheckedChange={(checked) => {
                              setLineChartStatusFilter((prev) => {
                                const next = new Set(prev)
                                if (prev.size === 0) {
                                  if (!checked) LEAD_STATUS_OPTIONS.filter((x) => x !== s).forEach((x) => next.add(x))
                                  return next
                                }
                                if (checked) next.add(s)
                                else next.delete(s)
                                return next
                              })
                            }}
                          >
                            {getStatusLabel(s, leadStatuses)}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={leadsByDayData} margin={{ left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Legend {...SMALL_LEGEND_PROPS} />
                        {lineChartStatuses.map((s) => (
                          <Line
                            key={s}
                            type="monotone"
                            dataKey={s}
                            name={getStatusLabel(s, leadStatuses)}
                            stroke={CHART_STATUS_COLORS[s]}
                            strokeWidth={2}
                            strokeOpacity={1}
                            dot={{ r: 3, fill: CHART_STATUS_COLORS[s] }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {/* Lead status by day – multi-select lead status for stacked bar chart */}
              {leadsByDayByStatusData.length > 0 && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <p className="text-xs sm:text-sm font-medium">Lead status by day</p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="text-xs gap-1 h-8">
                          {barChartStatusFilter.size === 0 ? 'All statuses' : `${barChartStatusFilter.size} selected`}
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {LEAD_STATUS_OPTIONS.map((s) => (
                          <DropdownMenuCheckboxItem
                            key={s}
                            checked={barChartStatusFilter.size === 0 || barChartStatusFilter.has(s)}
                            onCheckedChange={(checked) => {
                              setBarChartStatusFilter((prev) => {
                                const next = new Set(prev)
                                if (prev.size === 0) {
                                  if (!checked) LEAD_STATUS_OPTIONS.filter((x) => x !== s).forEach((x) => next.add(x))
                                  return next
                                }
                                if (checked) next.add(s)
                                else next.delete(s)
                                return next
                              })
                            }}
                          >
                            {getStatusLabel(s, leadStatuses)}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={leadsByDayByStatusData} barCategoryGap="24%" barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Legend {...SMALL_LEGEND_PROPS} />
                        {barChartStatuses.map((s, i) => (
                          <Bar
                            key={s}
                            dataKey={s}
                            stackId="a"
                            fill={CHART_STATUS_COLORS[s]}
                            name={getStatusLabel(s, leadStatuses)}
                            radius={i === barChartStatuses.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                            maxBarSize={40}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {/* Row 1: Sales reps by lead status | Sales reps by subscription type */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border p-4">
                  <p className="text-xs sm:text-sm font-medium mb-2">Sales reps by lead status</p>
                  <Select value={pieRepByStatusFilter || ''} onValueChange={setPieRepByStatusFilter}>
                    <SelectTrigger className="w-full max-w-[200px] mb-3 h-8 text-xs">
                      <SelectValue placeholder="Lead status" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {getStatusLabel(s, leadStatuses)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {pieRepByStatusData.length > 0 ? (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieRepByStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={64}>
                            {pieRepByStatusData.map((_, i) => (
                              <Cell key={i} fill={['hsl(var(--primary))', '#8b5cf6', '#06b6d4', '#22c55e', '#f97316', '#eab308'][i % 6]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm py-8 text-center">{pieRepByStatusFilter ? 'No data' : 'Select lead status'}</p>
                  )}
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs sm:text-sm font-medium mb-2">Sales reps by subscription type</p>
                  <Select value={pieRepBySubFilter} onValueChange={setPieRepBySubFilter}>
                    <SelectTrigger className="w-full max-w-[200px] mb-3 h-8 text-xs">
                      <SelectValue placeholder="Subscription type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">Trial</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                  {pieRepBySubData.length > 0 ? (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieRepBySubData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={64}>
                            {pieRepBySubData.map((_, i) => (
                              <Cell key={i} fill={['hsl(var(--primary))', '#8b5cf6', '#06b6d4', '#22c55e', '#f97316'][i % 5]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm py-8 text-center">No leads with this subscription type</p>
                  )}
                </div>
              </div>
              {/* Row 2: Lead status by sales rep | Subscription type by sales rep */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border p-4">
                  <p className="text-xs sm:text-sm font-medium mb-2">Lead status by sales rep</p>
                  <Select value={pieStatusByRepFilter} onValueChange={setPieStatusByRepFilter}>
                    <SelectTrigger className="w-full max-w-[200px] mb-3 h-8 text-xs">
                      <SelectValue placeholder="Sales rep" />
                    </SelectTrigger>
                    <SelectContent>
                      {(canViewTeam ? salesTeam : user ? [user] : []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {pieStatusByRepData.length > 0 ? (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieStatusByRepData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={64}>
                            {pieStatusByRepData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm py-8 text-center">{pieStatusByRepFilter ? 'No data' : 'Select sales rep'}</p>
                  )}
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs sm:text-sm font-medium mb-2">Subscription type by sales rep</p>
                  <Select value={pieSubByRepFilter} onValueChange={setPieSubByRepFilter}>
                    <SelectTrigger className="w-full max-w-[200px] mb-3 h-8 text-xs">
                      <SelectValue placeholder="Sales rep" />
                    </SelectTrigger>
                    <SelectContent>
                      {(canViewTeam ? salesTeam : user ? [user] : []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {pieSubByRepData.length > 0 ? (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieSubByRepData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={64}>
                            {pieSubByRepData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm py-8 text-center">{pieSubByRepFilter ? 'No leads with subscription' : 'Select sales rep'}</p>
                  )}
                </div>
              </div>
              {leadsByDayData.length === 0 && leadsByDayByStatusData.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-4">No chart data for this time period</p>
              )}
            </CardContent>
          </Card>

          {/* Team Performance (Admin and Managers) */}
          {canViewTeam && salesTeam.length > 0 && (
            <Card>
              <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0">
                  <CardTitle className="text-sm sm:text-base flex items-center gap-1.5 sm:gap-2">
                    <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-5 lg:w-5" />
                    Team Performance
                  </CardTitle>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Click on a row to see details</p>
                </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2 font-medium">Team Member</th>
                        <th className="text-center py-3 px-2 font-medium">Role</th>
                        <th className="text-center py-3 px-2 font-medium">Total</th>
                        <th className="text-center py-3 px-2 font-medium">Actioned</th>
                        <th className="text-center py-3 px-2 font-medium">Action %</th>
                        <th className="text-center py-3 px-2 font-medium">Meeting</th>
                        <th className="text-center py-3 px-2 font-medium">Won</th>
                        <th className="text-center py-3 px-2 font-medium">Win Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesPerformance.map((perf) => (
                        <tr
                          key={perf.user.id}
                          className="border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => handleRepClick(perf)}
                        >
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                                {perf.user.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex flex-col">
                                <span className="font-medium">{perf.user.name}</span>
                                <span className="text-xs text-muted-foreground">{perf.user.email}</span>
                              </div>
                            </div>
                          </td>
                          <td className="text-center py-3 px-2">
                            <Badge variant="outline" className="capitalize">
                              {perf.user.role === 'super_admin' ? 'Super Admin' : perf.user.role}
                            </Badge>
                          </td>
                          <td className="text-center py-3 px-2">
                            <Badge variant="secondary">{perf.totalLeads}</Badge>
                          </td>
                          <td className="text-center py-3 px-2">{perf.actionedLeads}</td>
                          <td className="text-center py-3 px-2">
                            <Badge className={perf.actionRate >= 70 ? 'bg-cyan-600' : ''}>
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
                            <Badge className={perf.conversionRate >= 50 ? 'bg-green-600' : ''}>
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
                    <div
                      key={perf.user.id}
                      className="border rounded-lg p-4 space-y-3 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => handleRepClick(perf)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                            {perf.user.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium">{perf.user.name}</span>
                            <span className="text-xs text-muted-foreground">{perf.user.email}</span>
                          </div>
                        </div>
                        <Badge variant="secondary">{perf.totalLeads} leads</Badge>
                      </div>

                      <div className="flex flex-col sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-center text-sm">
                        <div className="bg-slate-50 rounded p-2">
                          <p className="text-muted-foreground text-xs">Total</p>
                          <p className="font-medium text-base">{perf.totalLeads}</p>
                        </div>
                        <div className="bg-blue-50 rounded p-2">
                          <p className="text-muted-foreground text-xs">Actioned</p>
                          <p className="font-medium text-base">{perf.actionedLeads}</p>
                        </div>
                        <div className="bg-cyan-50 rounded p-2">
                          <p className="text-muted-foreground text-xs">Action%</p>
                          <p className="font-medium text-base">{perf.actionRate}%</p>
                        </div>
                        <div className="bg-green-50 rounded p-2">
                          <p className="text-muted-foreground text-xs">Won</p>
                          <p className="font-medium text-base">{perf.statusBreakdown.deal_won}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Activity Summary for Sales (non-managers) */}
          {!canViewTeam && (
            <Card>
              <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-3">
                <CardTitle className="text-sm sm:text-base">Your Activity Summary</CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <div className="flex flex-col sm:grid sm:grid-cols-2 gap-2 sm:gap-3 lg:gap-4">
                  <div className="text-center p-3 sm:p-4 bg-slate-50 rounded-lg">
                    <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-700">
                      {statusBreakdown.new + statusBreakdown.call_not_picked + statusBreakdown.follow_up_again}
                    </p>
                    <p className="text-xs sm:text-sm text-muted-foreground">Leads to Follow Up</p>
                  </div>
                  <div className="text-center p-3 sm:p-4 bg-purple-50 rounded-lg">
                    <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-purple-700">{statusBreakdown.demo_booked}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">Meetings Scheduled</p>
                  </div>
                  <div className="text-center p-3 sm:p-4 bg-green-50 rounded-lg">
                    <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-green-700">{statusBreakdown.deal_won}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">Deals Closed</p>
                  </div>
                  <div className="text-center p-3 sm:p-4 bg-indigo-50 rounded-lg">
                    <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-indigo-700">{statusBreakdown.demo_completed}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">Meetings Completed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Sales Rep Detail Dialog */}
      <Dialog open={!!selectedRepForDetail} onOpenChange={() => setSelectedRepForDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          {selectedRepForDetail && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary/10 text-primary text-lg">
                      {selectedRepForDetail.user.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <DialogTitle className="text-xl">{selectedRepForDetail.user.name}</DialogTitle>
                    <DialogDescription>{selectedRepForDetail.user.email}</DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              {/* Stats Summary */}
              <div className="flex flex-col sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 py-3 sm:py-4">
                <div className="text-center p-2 sm:p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <p className="text-xl sm:text-2xl font-bold">{selectedRepForDetail.totalLeads}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Total Leads</p>
                </div>
                <div className="text-center p-2 sm:p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <p className="text-xl sm:text-2xl font-bold text-blue-600">{selectedRepForDetail.actionedLeads}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Actioned</p>
                </div>
                <div className="text-center p-2 sm:p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                  <p className="text-xl sm:text-2xl font-bold text-green-600">{selectedRepForDetail.statusBreakdown.deal_won}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Deals Won</p>
                </div>
                <div className="text-center p-2 sm:p-3 bg-purple-50 dark:bg-purple-950 rounded-lg">
                  <p className="text-xl sm:text-2xl font-bold text-purple-600">{selectedRepForDetail.conversionRate}%</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Win Rate</p>
                </div>
              </div>

              {/* Lead Status Breakdown */}
              <div className="border rounded-lg p-4 space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Lead Status Breakdown</h4>
                <div className="flex flex-col sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs sm:text-sm">
                  {Object.keys(selectedRepForDetail.statusBreakdown).map((status) => {
                    const count = selectedRepForDetail.statusBreakdown[status as LeadStatus]
                    if (count === 0) return null
                    const statusLabel = getStatusLabel(status, leadStatuses)
                    const statusColor = getStatusColor(status, leadStatuses)
                    return (
                      <div key={status} className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${statusColor}`} />
                        <span className="text-muted-foreground truncate">{statusLabel}:</span>
                        <span className="font-medium">{count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Activity Timeline */}
              <div className="flex-1 overflow-hidden">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Recent Activities</h4>
                {loadingActivities ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : repActivities.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p>No activities recorded yet</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[280px] pr-4">
                    <div className="space-y-3">
                      {repActivities.map((activity) => {
                        const actionInfo = ACTION_TYPE_LABELS[activity.action_type] || {
                          label: activity.action_type.replace(/_/g, ' '),
                          color: 'bg-gray-100 text-gray-700'
                        }
                        return (
                          <div
                            key={activity.id}
                            className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                          >
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                              <Phone className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className={actionInfo.color}>
                                  {actionInfo.label}
                                </Badge>
                                {activity.lead_name && (
                                  <span className="font-medium text-sm truncate">
                                    {activity.lead_name}
                                  </span>
                                )}
                                {activity.lead_status && (
                                  <Badge variant="outline" className="text-xs">
                                    {getStatusLabel(activity.lead_status, leadStatuses)}
                                  </Badge>
                                )}
                              </div>
                              {activity.comments && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                  {activity.comments}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1.5">
                                {format(new Date(activity.action_date), 'MMM d, yyyy h:mm a')}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Note: Recording detail dialog removed - using native call tracking only */}
    </>
  )
}
