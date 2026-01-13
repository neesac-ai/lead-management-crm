'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  XCircle,
  Calendar,
  Users,
  BarChart3,
  Phone,
  Clock,
  RefreshCw,
  Search,
  Loader2,
  AlertCircle,
  User as UserIcon,
} from 'lucide-react'
import { User, Lead, LeadStatus } from '@/types/database.types'
import { format, subDays, startOfDay, endOfDay, isWithinInterval } from 'date-fns'
// Note: CallRecording type removed - using native call tracking only
import Link from 'next/link'

type DateFilter = 'today' | 'last_7_days' | 'last_30_days' | 'all_time' | 'custom'

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
  demo_booked: 'Meeting Booked',
  demo_completed: 'Meeting Completed',
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
  const [activeTab, setActiveTab] = useState('overview')
  const [isManager, setIsManager] = useState(false)
  const [canViewTeam, setCanViewTeam] = useState(false)

  // Lead analytics state
  const [leads, setLeads] = useState<Lead[]>([])
  const [salesTeam, setSalesTeam] = useState<User[]>([])
  const [dateFilter, setDateFilter] = useState<DateFilter>('all_time')
  const [customDateFrom, setCustomDateFrom] = useState<string>('')
  const [customDateTo, setCustomDateTo] = useState<string>('')

  // Call analytics state (using native call tracking)
  type CallLog = {
    id: string
    lead_id: string | null
    user_id: string
    phone_number: string
    call_direction: string
    call_status: string
    call_started_at: string
    call_ended_at: string | null
    duration_seconds: number
    talk_time_seconds: number | null
    ring_duration_seconds: number | null
    users?: { id: string; name: string; email: string } | null
    leads?: { id: string; name: string; phone: string | null } | null
  }
  const [callLogs, setCallLogs] = useState<CallLog[]>([])
  const [isLoadingCallLogs, setIsLoadingCallLogs] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSalesRep, setSelectedSalesRep] = useState<string>('all')

  const [callStats, setCallStats] = useState({
    totalCalls: 0,
    totalDuration: 0,
    avgDuration: 0,
    completed: 0,
    missed: 0,
    failed: 0,
    totalTalkTime: 0,
    avgTalkTime: 0,
  })

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
  }, [orgSlug])

  // Refresh call logs when tab changes to calls
  useEffect(() => {
    if (activeTab === 'calls' && !loading && orgId && user) {
      fetchCallLogs(orgId, user)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, loading, orgId, user?.id, selectedSalesRep, dateFilter, customDateFrom, customDateTo])

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

      const { data: leadsData, error: leadsError } = await leadsQuery

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

      // Note: Google Drive sync removed - using native call tracking only
      await fetchCallLogs(currentOrgId, userData)

    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchCallLogs(currentOrgId?: string, currentUser?: User) {
    const orgIdToUse = currentOrgId || orgId
    const userToUse = currentUser || user
    if (!orgIdToUse || !userToUse) return

    setIsLoadingCallLogs(true)

    try {
      // Build API URL with filters
      const params = new URLSearchParams()

      // Apply date filter
      let startDate: Date | null = null
      let endDate: Date | null = null

      if (dateFilter === 'today') {
        startDate = startOfDay(new Date())
        endDate = endOfDay(new Date())
      } else if (dateFilter === 'last_7_days') {
        startDate = startOfDay(subDays(new Date(), 7))
        endDate = endOfDay(new Date())
      } else if (dateFilter === 'last_30_days') {
        startDate = startOfDay(subDays(new Date(), 30))
        endDate = endOfDay(new Date())
      } else if (dateFilter === 'custom' && customDateFrom && customDateTo) {
        startDate = startOfDay(new Date(customDateFrom))
        endDate = endOfDay(new Date(customDateTo))
      }

      if (startDate) {
        params.append('start_date', startDate.toISOString())
      }
      if (endDate) {
        params.append('end_date', endDate.toISOString())
      }

      const response = await fetch(`/api/calls/analytics?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Failed to fetch call logs')
      }

      const data = await response.json()
      const logs = data.call_logs || []

      // Filter by user role (sales can only see their own, managers see team)
      let filteredLogs = logs
      if (userToUse.role === 'sales') {
        try {
          const { data: reportees } = await supabase
            .rpc('get_all_reportees', { manager_user_id: userToUse.id } as any)

          const reporteeIds = (reportees as Array<{ reportee_id: string }> | null)?.map((r: { reportee_id: string }) => r.reportee_id) || []
          if (reporteeIds.length > 0) {
            // Manager: see logs from self + reportees
            filteredLogs = logs.filter((log: CallLog) =>
              (log.user_id === userToUse.id || reporteeIds.includes(log.user_id))
            )
          } else {
            // Non-manager: only own logs
            filteredLogs = logs.filter((log: CallLog) =>
              log.user_id === userToUse.id
            )
          }
        } catch (error) {
          // Fallback: only own logs
          filteredLogs = logs.filter((log: CallLog) =>
            log.user_id === userToUse.id
          )
        }
      }

      setCallLogs(filteredLogs)
      calculateCallStats(filteredLogs)
    } catch (error) {
      console.error('Error fetching call logs:', error)
      setCallLogs([])
    } finally {
      setIsLoadingCallLogs(false)
    }
  }

  function calculateCallStats(logs: CallLog[]) {
    const stats = {
      totalCalls: logs.length,
      totalDuration: 0,
      avgDuration: 0,
      completed: 0,
      missed: 0,
      failed: 0,
      totalTalkTime: 0,
      avgTalkTime: 0,
    }

    logs.forEach(log => {
      stats.totalDuration += log.duration_seconds || 0
      stats.totalTalkTime += log.talk_time_seconds || 0
      if (log.call_status === 'completed') stats.completed++
      else if (log.call_status === 'missed') stats.missed++
      else if (log.call_status === 'failed') stats.failed++
    })

    stats.avgDuration = stats.totalCalls > 0
      ? Math.round(stats.totalDuration / stats.totalCalls)
      : 0
    stats.avgTalkTime = stats.completed > 0
      ? Math.round(stats.totalTalkTime / stats.completed)
      : 0

    setCallStats(stats)
  }

  // Note: Google Drive sync removed - using native call tracking only

  // Note: handleProcess and handleDelete removed - using native call tracking only

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

  // Call analytics helpers
  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Note: getSentimentIcon, getSentimentBadge, getStatusBadge removed - using native call tracking only

  // Filter call logs by search and sales rep - memoized for performance
  const filteredCallLogs = useMemo(() => {
    return callLogs.filter(log => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesSearch = log.phone_number?.toLowerCase().includes(query) ||
          log.users?.name?.toLowerCase().includes(query) ||
          log.users?.email?.toLowerCase().includes(query)
        if (!matchesSearch) return false
      }

      // Sales rep filter (admin only)
      if (isAdmin && selectedSalesRep !== 'all') {
        if (log.user_id !== selectedSalesRep) return false
      }

      return true
    })
  }, [callLogs, searchQuery, isAdmin, selectedSalesRep])

  const RECENT_CALLS_LIMIT = 20
  const recentCalls = useMemo(() => {
    return filteredCallLogs.slice(0, RECENT_CALLS_LIMIT)
  }, [filteredCallLogs])

  // Call Overview (for Overview tab) - aggregated across all visible call logs (ignores selectedSalesRep)
  const callOverview = useMemo(() => {
    const logs = callLogs

    const statusCounts: Record<string, number> = {}
    let totalDuration = 0
    let totalTalkTime = 0
    let totalRingTime = 0

    const uniqueLeadsAll = new Set<string>()
    const uniqueLeadsByStatus: Record<string, Set<string>> = {
      completed: new Set(),
      missed: new Set(),
      failed: new Set(),
      rejected: new Set(),
      blocked: new Set(),
      busy: new Set(),
    }

    for (const l of logs) {
      const s = l.call_status || 'unknown'
      statusCounts[s] = (statusCounts[s] || 0) + 1
      totalDuration += l.duration_seconds || 0
      totalTalkTime += l.talk_time_seconds || 0
      totalRingTime += l.ring_duration_seconds || 0

      if (l.lead_id) {
        uniqueLeadsAll.add(l.lead_id)
        if (uniqueLeadsByStatus[s]) {
          uniqueLeadsByStatus[s].add(l.lead_id)
        }
      }
    }

    const totalCalls = logs.length
    const completed = statusCounts.completed || 0
    const missed = statusCounts.missed || 0
    const failed = statusCounts.failed || 0
    const rejected = statusCounts.rejected || 0
    const blocked = statusCounts.blocked || 0
    const busy = statusCounts.busy || 0

    const answerRate = totalCalls > 0 ? Math.round((completed / totalCalls) * 100) : 0
    const avgTalkTime = completed > 0 ? Math.round(totalTalkTime / completed) : 0
    const avgRingTime = totalCalls > 0 ? Math.round(totalRingTime / totalCalls) : 0

    // By Team Member
    const byUser = new Map<string, {
      userId: string
      name: string
      email: string
      totalCalls: number
      completed: number
      missed: number
      failed: number
      uniqueLeads: number
      uniqueCompletedLeads: number
      uniqueMissedLeads: number
      uniqueFailedLeads: number
      totalTalkTime: number
      avgTalkTime: number
      answerRate: number
      lastCallAt: string | null
    }>()

    const uniqueLeadsByUser = new Map<string, {
      all: Set<string>
      completed: Set<string>
      missed: Set<string>
      failed: Set<string>
    }>()

    for (const l of logs) {
      const uid = l.user_id
      const u = l.users
      const existing = byUser.get(uid)
      const callAt = l.call_started_at || null
      const base = existing || {
        userId: uid,
        name: u?.name || 'Unknown',
        email: u?.email || '',
        totalCalls: 0,
        completed: 0,
        missed: 0,
        failed: 0,
        uniqueLeads: 0,
        uniqueCompletedLeads: 0,
        uniqueMissedLeads: 0,
        uniqueFailedLeads: 0,
        totalTalkTime: 0,
        avgTalkTime: 0,
        answerRate: 0,
        lastCallAt: null as string | null,
      }

      base.totalCalls += 1
      if (l.call_status === 'completed') base.completed += 1
      else if (l.call_status === 'missed') base.missed += 1
      else if (l.call_status === 'failed') base.failed += 1
      base.totalTalkTime += l.talk_time_seconds || 0

      if (l.lead_id) {
        const sets = uniqueLeadsByUser.get(uid) || {
          all: new Set<string>(),
          completed: new Set<string>(),
          missed: new Set<string>(),
          failed: new Set<string>(),
        }
        sets.all.add(l.lead_id)
        if (l.call_status === 'completed') sets.completed.add(l.lead_id)
        if (l.call_status === 'missed') sets.missed.add(l.lead_id)
        if (l.call_status === 'failed') sets.failed.add(l.lead_id)
        uniqueLeadsByUser.set(uid, sets)
      }

      if (!base.lastCallAt || (callAt && new Date(callAt) > new Date(base.lastCallAt))) {
        base.lastCallAt = callAt
      }

      byUser.set(uid, base)
    }

    const byUserArray = Array.from(byUser.values()).map(u => {
      const avgTT = u.completed > 0 ? Math.round(u.totalTalkTime / u.completed) : 0
      const ans = u.totalCalls > 0 ? Math.round((u.completed / u.totalCalls) * 100) : 0
      const sets = uniqueLeadsByUser.get(u.userId)
      return {
        ...u,
        avgTalkTime: avgTT,
        answerRate: ans,
        uniqueLeads: sets?.all.size || 0,
        uniqueCompletedLeads: sets?.completed.size || 0,
        uniqueMissedLeads: sets?.missed.size || 0,
        uniqueFailedLeads: sets?.failed.size || 0,
      }
    }).sort((a, b) => b.totalCalls - a.totalCalls)

    // By Lead (top 10)
    const byLead = new Map<string, {
      leadId: string
      name: string
      phone: string | null
      totalCalls: number
      completed: number
      missed: number
      failed: number
      totalTalkTime: number
      lastCallAt: string | null
    }>()

    for (const l of logs) {
      if (!l.lead_id) continue
      const lid = l.lead_id
      const lead = l.leads
      const existing = byLead.get(lid)
      const callAt = l.call_started_at || null
      const base = existing || {
        leadId: lid,
        name: lead?.name || 'Unknown',
        phone: lead?.phone || null,
        totalCalls: 0,
        completed: 0,
        missed: 0,
        failed: 0,
        totalTalkTime: 0,
        lastCallAt: null as string | null,
      }
      base.totalCalls += 1
      if (l.call_status === 'completed') base.completed += 1
      else if (l.call_status === 'missed') base.missed += 1
      else if (l.call_status === 'failed') base.failed += 1
      base.totalTalkTime += l.talk_time_seconds || 0
      if (!base.lastCallAt || (callAt && new Date(callAt) > new Date(base.lastCallAt))) {
        base.lastCallAt = callAt
      }
      byLead.set(lid, base)
    }

    const byLeadArray = Array.from(byLead.values())
      .sort((a, b) => b.totalCalls - a.totalCalls)
      .slice(0, 10)

    return {
      totalCalls,
      totalDuration,
      totalTalkTime,
      totalRingTime,
      avgTalkTime,
      avgRingTime,
      answerRate,
      uniqueLeads: uniqueLeadsAll.size,
      uniqueLeadsByStatus: {
        completed: uniqueLeadsByStatus.completed.size,
        missed: uniqueLeadsByStatus.missed.size,
        failed: uniqueLeadsByStatus.failed.size,
        rejected: uniqueLeadsByStatus.rejected.size,
        blocked: uniqueLeadsByStatus.blocked.size,
        busy: uniqueLeadsByStatus.busy.size,
      },
      statusCounts: { completed, missed, failed, rejected, blocked, busy },
      byUser: byUserArray,
      byLead: byLeadArray,
    }
  }, [callLogs])

  // Calculate call stats for selected rep - memoized (using call logs)
  const repCallStats = useMemo(() => {
    const logs = selectedSalesRep === 'all'
      ? callLogs
      : callLogs.filter(log => log.users?.id === selectedSalesRep)

    const stats = {
      totalCalls: logs.length,
      totalDuration: 0,
      completed: 0,
      missed: 0,
      failed: 0,
    }

    logs.forEach(log => {
      stats.totalDuration += log.duration_seconds || 0
      if (log.call_status === 'completed') stats.completed++
      else if (log.call_status === 'missed') stats.missed++
      else if (log.call_status === 'failed') stats.failed++
    })

    return stats
  }, [callLogs, selectedSalesRep])

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

  // Subscription type breakdown
  const trialLeads = filteredLeads.filter(l => l.subscription_type === 'trial').length
  const paidLeads = filteredLeads.filter(l => l.subscription_type === 'paid').length
  const unspecifiedLeads = filteredLeads.filter(l => !l.subscription_type).length

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
        title="Analytics"
        description={canViewTeam ? "Team performance and insights" : "Your performance metrics"}
      />

      <div className="flex-1 p-3 sm:p-4 lg:p-6 pb-20 lg:pb-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3 sm:space-y-4 lg:space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2 h-auto">
            <TabsTrigger value="overview" className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4 py-2">
              <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="calls" className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4 py-2">
              <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Calls
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-3 sm:space-y-4 lg:space-y-6 mt-3 sm:mt-4">
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

            {/* Subscription Type Breakdown */}
            <Card>
              <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-3">
                <CardTitle className="text-sm sm:text-base flex items-center gap-1.5 sm:gap-2">
                  <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-5 lg:w-5" />
                  Subscription Type Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
                  <div className="flex items-center justify-between p-2 sm:p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Trial</p>
                      <p className="text-lg sm:text-xl lg:text-2xl font-bold text-blue-600 truncate">{trialLeads}</p>
                    </div>
                    <Badge variant="outline" className="border-blue-500 text-blue-600 text-xs shrink-0 ml-2">
                      {totalLeads > 0 ? Math.round((trialLeads / totalLeads) * 100) : 0}%
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-2 sm:p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Paid</p>
                      <p className="text-lg sm:text-xl lg:text-2xl font-bold text-green-600 truncate">{paidLeads}</p>
                    </div>
                    <Badge variant="outline" className="border-green-500 text-green-600 text-xs shrink-0 ml-2">
                      {totalLeads > 0 ? Math.round((paidLeads / totalLeads) * 100) : 0}%
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Not Specified</p>
                      <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-600 truncate">{unspecifiedLeads}</p>
                    </div>
                    <Badge variant="outline" className="border-gray-500 text-gray-600 text-xs shrink-0 ml-2">
                      {totalLeads > 0 ? Math.round((unspecifiedLeads / totalLeads) * 100) : 0}%
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Status Breakdown */}
            <Card>
              <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-3">
                <CardTitle className="text-sm sm:text-base flex items-center gap-1.5 sm:gap-2">
                  <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-5 lg:w-5" />
                  Lead Status Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
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
          </TabsContent>

          {/* CALLS TAB */}
          <TabsContent value="calls" className="space-y-6">
            {/* Time Period (same as Overview tab) */}
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

            {/* Header with Refresh and Filters */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <p className="text-muted-foreground">
                  Call analytics (native tracking)
                </p>
                <p className="text-xs text-muted-foreground">
                  Overview is based on the selected time period. Team member filter applies only to the logs list.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                {/* Team Member Filter (Admin and Managers) - affects log list only */}
                {canViewTeam && salesTeam.length > 0 && (
                  <Select value={selectedSalesRep} onValueChange={setSelectedSalesRep}>
                    <SelectTrigger className="w-full sm:w-[220px] h-8 sm:h-9 text-xs sm:text-sm">
                      <SelectValue placeholder="Filter logs by member" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Team Members (Logs)</SelectItem>
                      {salesTeam.map((rep) => (
                        <SelectItem key={rep.id} value={rep.id}>
                          {rep.name} ({rep.email}) - {rep.role === 'super_admin' ? 'Super Admin' : rep.role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Button variant="outline" onClick={() => fetchCallLogs()} disabled={isLoadingCallLogs} className="h-8 sm:h-9 text-xs sm:text-sm">
                  <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 ${isLoadingCallLogs ? 'animate-spin' : ''}`} />
                  {isLoadingCallLogs ? 'Loading...' : 'Refresh'}
                </Button>
              </div>
            </div>

            {/* Warnings */}
            {/* Note: Google Drive sync warnings removed - using native call tracking only */}

            {/* Call Analytics Overview (same style as Overview tab) */}
            <Card>
              <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-3">
                <CardTitle className="text-sm sm:text-base flex items-center gap-1.5 sm:gap-2">
                  <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-5 lg:w-5" />
                  Call Overview
                </CardTitle>
                <CardDescription>
                  Summary of calls for the selected time period
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0 space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 sm:gap-3 lg:gap-4">
                  <Card>
                    <CardHeader className="pb-2 p-3 sm:p-4">
                      <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Total Calls</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 pt-0">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
                        <span className="text-lg sm:text-xl font-bold">{callOverview.totalCalls}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2 p-3 sm:p-4">
                      <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Completed</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 pt-0">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 shrink-0" />
                        <span className="text-lg sm:text-xl font-bold">{callOverview.statusCounts.completed}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2 p-3 sm:p-4">
                      <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Not Picked</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 pt-0">
                      <div className="flex items-center gap-2">
                        <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 shrink-0" />
                        <span className="text-lg sm:text-xl font-bold">{callOverview.statusCounts.missed}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2 p-3 sm:p-4">
                      <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Failed</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 pt-0">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 shrink-0" />
                        <span className="text-lg sm:text-xl font-bold">{callOverview.statusCounts.failed}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2 p-3 sm:p-4">
                      <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Answer Rate</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 pt-0">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-600 shrink-0" />
                        <span className="text-lg sm:text-xl font-bold">{callOverview.answerRate}%</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2 p-3 sm:p-4">
                      <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Avg Talk Time</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 pt-0">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 shrink-0" />
                        <span className="text-lg sm:text-xl font-bold">{formatDuration(callOverview.avgTalkTime)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    Unique leads contacted: <span className="font-medium text-foreground">{callOverview.uniqueLeads}</span>
                  </span>
                  <span className="text-muted-foreground/60">|</span>
                  <span>
                    Unique completed leads: <span className="font-medium text-foreground">{callOverview.uniqueLeadsByStatus.completed}</span>
                  </span>
                  <span className="text-muted-foreground/60">|</span>
                  <span>
                    Unique not picked leads: <span className="font-medium text-foreground">{callOverview.uniqueLeadsByStatus.missed}</span>
                  </span>
                </div>

                {/* Unique Leads Summary (cards) */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 lg:gap-4">
                  <Card>
                    <CardHeader className="pb-2 p-3 sm:p-4">
                      <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Unique Leads</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 pt-0">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
                        <span className="text-lg sm:text-xl font-bold">{callOverview.uniqueLeads}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2 p-3 sm:p-4">
                      <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Unique Completed</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 pt-0">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 shrink-0" />
                        <span className="text-lg sm:text-xl font-bold">{callOverview.uniqueLeadsByStatus.completed}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2 p-3 sm:p-4">
                      <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Unique Not Picked</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 pt-0">
                      <div className="flex items-center gap-2">
                        <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 shrink-0" />
                        <span className="text-lg sm:text-xl font-bold">{callOverview.uniqueLeadsByStatus.missed}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2 p-3 sm:p-4">
                      <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Unique Failed</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 pt-0">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 shrink-0" />
                        <span className="text-lg sm:text-xl font-bold">{callOverview.uniqueLeadsByStatus.failed}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2 p-3 sm:p-4">
                      <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Unique Answer %</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 pt-0">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-600 shrink-0" />
                        <span className="text-lg sm:text-xl font-bold">
                          {callOverview.uniqueLeads > 0
                            ? Math.round((callOverview.uniqueLeadsByStatus.completed / callOverview.uniqueLeads) * 100)
                            : 0}%
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Call Metrics (per team member) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {canViewTeam ? 'Team Call Performance' : 'Your Call Performance'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Avg talk time is calculated on completed calls
                    </p>
                  </div>

                  {callOverview.byUser.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      No call data for this period
                    </p>
                  ) : (
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left py-2.5 px-3 font-medium">Member</th>
                            <th className="text-center py-2.5 px-3 font-medium">Calls</th>
                            <th className="text-center py-2.5 px-3 font-medium">Completed</th>
                            <th className="text-center py-2.5 px-3 font-medium">Not Picked</th>
                            <th className="text-center py-2.5 px-3 font-medium">Failed</th>
                            <th className="text-center py-2.5 px-3 font-medium">Answer %</th>
                            <th className="text-center py-2.5 px-3 font-medium">Avg Talk</th>
                            <th className="text-right py-2.5 px-3 font-medium">Last Call</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(canViewTeam
                            ? callOverview.byUser
                            : callOverview.byUser.filter(u => u.userId === user?.id)
                          ).map((u) => (
                            <tr key={u.userId} className="border-b last:border-0">
                              <td className="py-2.5 px-3">
                                <div className="flex flex-col">
                                  <span className="font-medium">{u.name}</span>
                                  {u.email ? <span className="text-xs text-muted-foreground">{u.email}</span> : null}
                                </div>
                              </td>
                              <td className="text-center py-2.5 px-3">{u.totalCalls}</td>
                              <td className="text-center py-2.5 px-3">{u.completed}</td>
                              <td className="text-center py-2.5 px-3">{u.missed}</td>
                              <td className="text-center py-2.5 px-3">{u.failed}</td>
                              <td className="text-center py-2.5 px-3">
                                <Badge variant="secondary">{u.answerRate}%</Badge>
                              </td>
                              <td className="text-center py-2.5 px-3">{formatDuration(u.avgTalkTime)}</td>
                              <td className="text-right py-2.5 px-3 text-muted-foreground">
                                {u.lastCallAt ? format(new Date(u.lastCallAt), 'MMM d, HH:mm') : '--'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Unique Leads Metrics (per team member) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      Unique Leads Metrics
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Unique Answer % = unique completed leads / unique leads contacted
                    </p>
                  </div>

                  {callOverview.byUser.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      No lead-linked call data for this period
                    </p>
                  ) : (
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left py-2.5 px-3 font-medium">Member</th>
                            <th className="text-center py-2.5 px-3 font-medium">Unique Leads</th>
                            <th className="text-center py-2.5 px-3 font-medium">Unique Completed</th>
                            <th className="text-center py-2.5 px-3 font-medium">Unique Not Picked</th>
                            <th className="text-center py-2.5 px-3 font-medium">Unique Failed</th>
                            <th className="text-center py-2.5 px-3 font-medium">Unique Answer %</th>
                            <th className="text-right py-2.5 px-3 font-medium">Last Call</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(canViewTeam
                            ? callOverview.byUser
                            : callOverview.byUser.filter(u => u.userId === user?.id)
                          ).map((u) => {
                            const uniqueAnswerRate = u.uniqueLeads > 0
                              ? Math.round((u.uniqueCompletedLeads / u.uniqueLeads) * 100)
                              : 0
                            return (
                              <tr key={`unique-${u.userId}`} className="border-b last:border-0">
                                <td className="py-2.5 px-3">
                                  <div className="flex flex-col">
                                    <span className="font-medium">{u.name}</span>
                                    {u.email ? <span className="text-xs text-muted-foreground">{u.email}</span> : null}
                                  </div>
                                </td>
                                <td className="text-center py-2.5 px-3">{u.uniqueLeads}</td>
                                <td className="text-center py-2.5 px-3">{u.uniqueCompletedLeads}</td>
                                <td className="text-center py-2.5 px-3">{u.uniqueMissedLeads}</td>
                                <td className="text-center py-2.5 px-3">{u.uniqueFailedLeads}</td>
                                <td className="text-center py-2.5 px-3">
                                  <Badge variant="secondary">{uniqueAnswerRate}%</Badge>
                                </td>
                                <td className="text-right py-2.5 px-3 text-muted-foreground">
                                  {u.lastCallAt ? format(new Date(u.lastCallAt), 'MMM d, HH:mm') : '--'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Lead breakdown */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Top Leads by Calls</p>

                  {callOverview.byLead.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      No lead-linked call data for this period
                    </p>
                  ) : (
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left py-2.5 px-3 font-medium">Lead</th>
                            <th className="text-center py-2.5 px-3 font-medium">Calls</th>
                            <th className="text-center py-2.5 px-3 font-medium">Completed</th>
                            <th className="text-center py-2.5 px-3 font-medium">Not Picked</th>
                            <th className="text-center py-2.5 px-3 font-medium">Failed</th>
                            <th className="text-center py-2.5 px-3 font-medium">Talk Time</th>
                            <th className="text-right py-2.5 px-3 font-medium">Last Call</th>
                          </tr>
                        </thead>
                        <tbody>
                          {callOverview.byLead.map((l) => (
                            <tr key={l.leadId} className="border-b last:border-0">
                              <td className="py-2.5 px-3">
                                <div className="flex flex-col">
                                  <span className="font-medium">{l.name}</span>
                                  {l.phone ? <span className="text-xs text-muted-foreground">{l.phone}</span> : null}
                                </div>
                              </td>
                              <td className="text-center py-2.5 px-3">{l.totalCalls}</td>
                              <td className="text-center py-2.5 px-3">{l.completed}</td>
                              <td className="text-center py-2.5 px-3">{l.missed}</td>
                              <td className="text-center py-2.5 px-3">{l.failed}</td>
                              <td className="text-center py-2.5 px-3">{formatDuration(l.totalTalkTime)}</td>
                              <td className="text-right py-2.5 px-3 text-muted-foreground">
                                {l.lastCallAt ? format(new Date(l.lastCallAt), 'MMM d, HH:mm') : '--'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recent Calls */}
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <CardTitle>Recent Calls</CardTitle>
                    <CardDescription>Most recent calls for the selected time period</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingCallLogs ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                ) : recentCalls.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Phone className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>{callLogs.length === 0 ? 'No calls tracked yet' : 'No recent calls for this period'}</p>
                    <p className="text-sm mt-2">Calls made from the app will appear here</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[420px] pr-3">
                    <div className="space-y-3">
                      {recentCalls.map((log) => {
                        const formatDuration = (seconds: number) => {
                          const mins = Math.floor(seconds / 60)
                          const secs = seconds % 60
                          return `${mins}:${secs.toString().padStart(2, '0')}`
                        }

                        const getStatusColor = () => {
                          switch (log.call_status) {
                            case 'completed': return 'bg-green-500/10 text-green-600 border-green-500/20'
                            case 'missed': return 'bg-orange-500/10 text-orange-600 border-orange-500/20'
                            case 'failed': return 'bg-red-500/10 text-red-600 border-red-500/20'
                            case 'rejected': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                            case 'busy': return 'bg-purple-500/10 text-purple-600 border-purple-500/20'
                            case 'blocked': return 'bg-gray-500/10 text-gray-600 border-gray-500/20'
                            default: return 'bg-gray-500/10 text-gray-600 border-gray-500/20'
                          }
                        }

                        const getStatusLabel = () => {
                          switch (log.call_status) {
                            case 'completed': return 'Completed'
                            case 'missed': return 'Not Picked'
                            case 'failed': return 'Failed'
                            case 'rejected': return 'Rejected'
                            case 'busy': return 'Busy'
                            case 'blocked': return 'Blocked'
                            default: return log.call_status
                          }
                        }

                        return (
                          <div
                            key={log.id}
                            className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50"
                          >
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <Phone className="w-5 h-5 text-primary" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{log.phone_number}</span>
                                <Badge variant="outline" className={`text-xs ${getStatusColor()}`}>
                                  {getStatusLabel()}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(log.call_started_at), 'MMM d, h:mm a')}
                                <Clock className="w-3 h-3 ml-2" />
                                {formatDuration(log.duration_seconds)}
                                {log.talk_time_seconds && log.talk_time_seconds > 0 && (
                                  <>
                                    <span className="ml-2">•</span>
                                    <span>Talk: {formatDuration(log.talk_time_seconds)}</span>
                                  </>
                                )}
                                {/* Show sales rep name for admin */}
                                {isAdmin && log.users && (
                                  <>
                                    <UserIcon className="w-3 h-3 ml-2" />
                                    <span className="text-primary">
                                      {log.users.name} ({log.users.email})
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
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
                  {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((status) => {
                    const count = selectedRepForDetail.statusBreakdown[status]
                    if (count === 0) return null
                    return (
                      <div key={status} className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[status]}`} />
                        <span className="text-muted-foreground truncate">{STATUS_LABELS[status]}:</span>
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
                                    {STATUS_LABELS[activity.lead_status as LeadStatus] || activity.lead_status}
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
