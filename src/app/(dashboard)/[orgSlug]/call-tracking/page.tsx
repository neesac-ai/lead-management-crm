'use client'

import { use, useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  PieChart,
  Pie,
} from 'recharts'
import {
  Calendar,
  ChevronDown,
  Loader2,
  Phone,
  RefreshCw,
  Search,
  User as UserIcon,
  XCircle,
  AlertCircle,
  TrendingUp,
  Clock,
  Users,
  BarChart3,
  Lightbulb,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { endOfDay, startOfDay, subDays, format as fmt } from 'date-fns'
import { getMenuNames, getMenuLabel } from '@/lib/menu-names'

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

type DateFilter = 'today' | 'last_7_days' | 'last_30_days' | 'all_time' | 'custom'

type CallLog = {
  id: string
  phone_number: string
  call_direction: string
  call_status: string
  call_started_at: string
  call_ended_at: string | null
  duration_seconds: number
  talk_time_seconds: number
  ring_duration_seconds: number
  user_id: string
  lead_id: string | null
  users?: { id: string; name: string; email: string } | null
  leads?: { id: string; name: string; phone: string; status?: string } | null
}

type UserProfile = { id: string; role: string }

const STATUS_COLORS: Record<string, string> = {
  completed: '#22c55e',
  missed: '#f97316',
  failed: '#ef4444',
  rejected: '#eab308',
  busy: '#a855f7',
  blocked: '#6b7280',
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const SMALL_LEGEND_PROPS = {
  wrapperStyle: { fontSize: 10 },
  iconSize: 8,
  iconType: 'square' as const,
  layout: 'horizontal' as const,
  align: 'center' as const,
}

export default function CallTrackingPage({ params }: PageProps) {
  const { orgSlug } = use(params)
  const [dateFilter, setDateFilter] = useState<DateFilter>('last_7_days')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [callLogs, setCallLogs] = useState<CallLog[]>([])
  const [totalLeads, setTotalLeads] = useState(0)
  const [contactedLeads, setContactedLeads] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [menuNames, setMenuNames] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<'insights' | 'recommendations'>('insights')
  const [seasonalityRepFilter, setSeasonalityRepFilter] = useState<string>('all')
  const [lineChartStatusFilter, setLineChartStatusFilter] = useState<Set<string>>(new Set(['completed', 'missed', 'failed', 'rejected', 'busy', 'blocked']))
  const [repPieCallStatusFilter, setRepPieCallStatusFilter] = useState<string>('completed')
  const [repPieLeadStatusFilter, setRepPieLeadStatusFilter] = useState<string>('')

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

  const CALL_STATUS_OPTIONS = ['completed', 'missed', 'failed', 'rejected', 'busy', 'blocked'] as const

  useEffect(() => {
    const supabase = createClient()
    const loadUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: profile } = await supabase
        .from('users')
        .select('id, role')
        .eq('auth_id', authUser.id)
        .single()
      if (profile) setUser(profile as UserProfile)
    }
    void loadUser()
    fetchMenuNames()
  }, [orgSlug])

  const fetchMenuNames = async () => {
    try {
      const names = await getMenuNames()
      setMenuNames(names)
    } catch (error) {
      console.error('Error fetching menu names:', error)
    }
  }

  useEffect(() => {
    const handleMenuNamesUpdate = () => fetchMenuNames()
    window.addEventListener('menu-names-updated', handleMenuNamesUpdate)
    return () => window.removeEventListener('menu-names-updated', handleMenuNamesUpdate)
  }, [])

  async function fetchLogs() {
    setRefreshing(true)
    try {
      const params = new URLSearchParams()
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

      if (startDate) params.append('start_date', startDate.toISOString())
      if (endDate) params.append('end_date', endDate.toISOString())

      const res = await fetch(`/api/calls/analytics?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch call logs')
      const data = await res.json()
      const logs = (data.call_logs || []) as CallLog[]
      setTotalLeads(data.total_leads ?? 0)
      setContactedLeads(data.contacted_leads ?? 0)

      if (user?.role === 'sales') {
        const supabase = createClient()
        let filtered = logs.filter((l) => l.user_id === user.id)
        try {
          const { data: reportees } = await supabase
            .rpc('get_all_reportees', { manager_user_id: user.id } as any)
          const reporteeIds = (reportees as Array<{ reportee_id: string }> | null)?.map((r) => r.reportee_id) || []
          if (reporteeIds.length > 0) {
            filtered = logs.filter((l) => l.user_id === user.id || reporteeIds.includes(l.user_id))
          }
        } catch {
          // ignore
        }
        setCallLogs(filtered)
      } else {
        setCallLogs(logs)
      }
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter, user?.id, customDateFrom, customDateTo])

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return callLogs
    return callLogs.filter((l) => {
      const phone = (l.phone_number || '').toLowerCase()
      const userName = (l.users?.name || '').toLowerCase()
      const userEmail = (l.users?.email || '').toLowerCase()
      const leadName = (l.leads?.name || '').toLowerCase()
      return phone.includes(q) || userName.includes(q) || userEmail.includes(q) || leadName.includes(q)
    })
  }, [callLogs, searchQuery])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500/10 text-green-600 border-green-500/20'
      case 'missed': return 'bg-orange-500/10 text-orange-600 border-orange-500/20'
      case 'failed': return 'bg-red-500/10 text-red-600 border-red-500/20'
      case 'rejected': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
      case 'busy': return 'bg-purple-500/10 text-purple-600 border-purple-500/20'
      case 'blocked': return 'bg-gray-500/10 text-gray-600 border-gray-500/20'
      default: return 'bg-gray-500/10 text-gray-600 border-gray-500/20'
    }
  }

  const formatDuration = (seconds: number) => {
    const s = Math.max(0, seconds || 0)
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Insights: call overview (byUser, byLead, statusCounts)
  const callOverview = useMemo(() => {
    const logs = callLogs
    const statusCounts: Record<string, number> = {}
    let totalDuration = 0
    let totalTalkTime = 0
    const uniqueLeadsAll = new Set<string>()
    const byUser = new Map<string, {
      userId: string
      name: string
      email: string
      totalCalls: number
      completed: number
      missed: number
      failed: number
      rejected: number
      busy: number
      blocked: number
      uniqueLeads: number
      totalTalkTime: number
      avgTalkTime: number
      answerRate: number
      lastCallAt: string | null
    }>()
    const uniqueLeadsByUser = new Map<string, Set<string>>()

    for (const l of logs) {
      const s = l.call_status || 'unknown'
      statusCounts[s] = (statusCounts[s] || 0) + 1
      totalDuration += l.duration_seconds || 0
      totalTalkTime += l.talk_time_seconds || 0
      if (l.lead_id) uniqueLeadsAll.add(l.lead_id)

      const uid = l.user_id
      const u = l.users
      const base = byUser.get(uid) || {
        userId: uid,
        name: u?.name || 'Unknown',
        email: u?.email || '',
        totalCalls: 0,
        completed: 0,
        missed: 0,
        failed: 0,
        rejected: 0,
        busy: 0,
        blocked: 0,
        uniqueLeads: 0,
        totalTalkTime: 0,
        avgTalkTime: 0,
        answerRate: 0,
        lastCallAt: null as string | null,
      }
      base.totalCalls += 1
      if (l.call_status === 'completed') base.completed += 1
      else if (l.call_status === 'missed') base.missed += 1
      else if (l.call_status === 'failed') base.failed += 1
      else if (l.call_status === 'rejected') base.rejected += 1
      else if (l.call_status === 'busy') base.busy += 1
      else if (l.call_status === 'blocked') base.blocked += 1
      base.totalTalkTime += l.talk_time_seconds || 0
      if (l.call_started_at && (!base.lastCallAt || new Date(l.call_started_at) > new Date(base.lastCallAt))) {
        base.lastCallAt = l.call_started_at
      }
      const set = uniqueLeadsByUser.get(uid) || new Set<string>()
      if (l.lead_id) set.add(l.lead_id)
      uniqueLeadsByUser.set(uid, set)
      byUser.set(uid, base)
    }

    const byUserArray = Array.from(byUser.values()).map((u) => {
      const avgTT = u.completed > 0 ? Math.round(u.totalTalkTime / u.completed) : 0
      const ans = u.totalCalls > 0 ? Math.round((u.completed / u.totalCalls) * 100) : 0
      const uniqueLeads = uniqueLeadsByUser.get(u.userId)?.size || 0
      const repLabel = u.email ? `${u.name} (${u.email})` : u.name
      return { ...u, avgTalkTime: avgTT, answerRate: ans, uniqueLeads, repLabel }
    }).sort((a, b) => b.totalCalls - a.totalCalls)

    const byLead = new Map<string, {
      leadId: string
      name: string
      phone: string | null
      status: string | null
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
      const base = byLead.get(lid) || {
        leadId: lid,
        name: lead?.name || 'Unknown',
        phone: lead?.phone || null,
        status: lead?.status ?? null,
        totalCalls: 0,
        completed: 0,
        missed: 0,
        failed: 0,
        totalTalkTime: 0,
        lastCallAt: null as string | null,
      }
      if (lead?.status) base.status = lead.status
      base.totalCalls += 1
      if (l.call_status === 'completed') base.completed += 1
      else if (l.call_status === 'missed') base.missed += 1
      else if (l.call_status === 'failed') base.failed += 1
      base.totalTalkTime += l.talk_time_seconds || 0
      if (l.call_started_at && (!base.lastCallAt || new Date(l.call_started_at) > new Date(base.lastCallAt))) {
        base.lastCallAt = l.call_started_at
      }
      byLead.set(lid, base)
    }
    const byLeadArray = Array.from(byLead.values())
      .sort((a, b) => b.totalCalls - a.totalCalls)
      .slice(0, 15)

    const totalCalls = logs.length
    const completed = statusCounts.completed || 0
    const answerRate = totalCalls > 0 ? Math.round((completed / totalCalls) * 100) : 0
    const avgTalkTime = completed > 0 ? Math.round(totalTalkTime / completed) : 0

    const nonLeadCallsCount = logs.filter((l) => !l.lead_id).length

    const leadStatusBreakdown: Record<string, number> = {}
    logs.forEach((l) => {
      if (l.lead_id && l.leads?.status) {
        const st = l.leads.status
        leadStatusBreakdown[st] = (leadStatusBreakdown[st] || 0) + 1
      }
    })

    return {
      totalCalls,
      totalDuration,
      totalTalkTime,
      avgTalkTime,
      answerRate,
      uniqueLeads: uniqueLeadsAll.size,
      statusCounts: { completed, missed: statusCounts.missed || 0, failed: statusCounts.failed || 0, rejected: statusCounts.rejected || 0, busy: statusCounts.busy || 0, blocked: statusCounts.blocked || 0 },
      byUser: byUserArray,
      byLead: byLeadArray,
      nonLeadCallsCount,
      leadStatusBreakdown,
    }
  }, [callLogs])

  // Seasonality: by hour, day of week, week of month (filterable by sales rep)
  const seasonality = useMemo(() => {
    const logs = seasonalityRepFilter === 'all'
      ? callLogs
      : callLogs.filter((l) => l.user_id === seasonalityRepFilter)
    const byHour = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0, label: `${i}:00` }))
    const byDayOfWeek = DAY_LABELS.map((label, i) => ({ day: i, dayLabel: label, count: 0 }))
    const byWeekOfMonth = [
      { week: 1, label: '1st week', count: 0 },
      { week: 2, label: '2nd week', count: 0 },
      { week: 3, label: '3rd week', count: 0 },
      { week: 4, label: '4th week', count: 0 },
      { week: 5, label: '5th week', count: 0 },
    ]
    for (const l of logs) {
      const d = new Date(l.call_started_at)
      const hour = d.getHours()
      byHour[hour].count += 1
      const day = d.getDay()
      const dayIndex = day === 0 ? 6 : day - 1
      byDayOfWeek[dayIndex].count += 1
      const weekOfMonth = Math.min(5, Math.ceil(d.getDate() / 7))
      byWeekOfMonth[weekOfMonth - 1].count += 1
    }
    return { byHour, byDayOfWeek, byWeekOfMonth }
  }, [callLogs, seasonalityRepFilter])

  // Charts data
  const statusChartData = useMemo(() => {
    const { statusCounts } = callOverview
    return [
      { name: 'Completed', value: statusCounts.completed, color: STATUS_COLORS.completed },
      { name: 'Missed', value: statusCounts.missed, color: STATUS_COLORS.missed },
      { name: 'Failed', value: statusCounts.failed, color: STATUS_COLORS.failed },
      { name: 'Rejected', value: statusCounts.rejected, color: STATUS_COLORS.rejected },
      { name: 'Busy', value: statusCounts.busy, color: STATUS_COLORS.busy },
      { name: 'Blocked', value: statusCounts.blocked, color: STATUS_COLORS.blocked },
    ].filter((d) => d.value > 0)
  }, [callOverview])

  const callsByDayStackedData = useMemo(() => {
    const map = new Map<string, { completed: number; missed: number; failed: number; rejected: number; busy: number; blocked: number }>()
    callLogs.forEach((l) => {
      const key = fmt(new Date(l.call_started_at), 'yyyy-MM-dd')
      const cur = map.get(key) || { completed: 0, missed: 0, failed: 0, rejected: 0, busy: 0, blocked: 0 }
      const s = l.call_status as keyof typeof cur
      if (s in cur && typeof cur[s] === 'number') cur[s] += 1
      map.set(key, cur)
    })
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([dateKey, counts]) => ({
        date: fmt(new Date(dateKey), 'MMM d'),
        ...counts,
      }))
  }, [callLogs])

  const leadStatusChartData = useMemo(() => {
    const b = callOverview.leadStatusBreakdown
    return Object.entries(b).map(([status, count]) => ({
      status: status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      count,
    })).sort((a, b) => b.count - a.count)
  }, [callOverview.leadStatusBreakdown])

  // Lead status by day (for daily bar chart, lead-linked only)
  const leadStatusByDayData = useMemo(() => {
    const map = new Map<string, Record<string, number>>()
    callLogs.forEach((l) => {
      if (!l.lead_id || !l.leads?.status) return
      const key = fmt(new Date(l.call_started_at), 'yyyy-MM-dd')
      const cur = map.get(key) || {}
      const st = l.leads.status
      cur[st] = (cur[st] || 0) + 1
      map.set(key, cur)
    })
    const allStatuses = new Set<string>()
    map.forEach((counts) => Object.keys(counts).forEach((s) => allStatuses.add(s)))
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([dateKey, counts]) => {
        const row: Record<string, string | number> = { date: fmt(new Date(dateKey), 'MMM d') }
        allStatuses.forEach((s) => { row[s] = counts[s] || 0 })
        return row
      })
  }, [callLogs])

  // Seasonality stacked by call status (and by lead status for lead-linked)
  const seasonalityStacked = useMemo(() => {
    const logs = seasonalityRepFilter === 'all'
      ? callLogs
      : callLogs.filter((l) => l.user_id === seasonalityRepFilter)
    const statusKeys = ['completed', 'missed', 'failed', 'rejected', 'busy', 'blocked'] as const
    const byHour = Array.from({ length: 24 }, (_, i) => {
      const row: Record<string, number> = { hour: i, label: `${i}:00` }
      statusKeys.forEach((s) => { row[s] = 0 })
      return row
    })
    const byDayOfWeek = DAY_LABELS.map((_, i) => {
      const row: Record<string, number | string> = { day: i, dayLabel: DAY_LABELS[i] }
      statusKeys.forEach((s) => { row[s] = 0 })
      return row
    })
    const byWeekOfMonth = [1, 2, 3, 4, 5].map((w) => {
      const row: Record<string, number | string> = { week: w, label: `${w}${w === 1 ? 'st' : w === 2 ? 'nd' : w === 3 ? 'rd' : 'th'} week` }
      statusKeys.forEach((s) => { row[s] = 0 })
      return row
    })
    for (const l of logs) {
      const d = new Date(l.call_started_at)
      const hour = d.getHours()
      const s = l.call_status as (typeof statusKeys)[number]
      if (s in byHour[hour]) (byHour[hour] as Record<string, number>)[s] += 1
      const day = d.getDay()
      const dayIndex = day === 0 ? 6 : day - 1
      if (s in byDayOfWeek[dayIndex]) (byDayOfWeek[dayIndex] as Record<string, number>)[s] += 1
      const weekOfMonth = Math.min(5, Math.ceil(d.getDate() / 7))
      if (s in byWeekOfMonth[weekOfMonth - 1]) (byWeekOfMonth[weekOfMonth - 1] as Record<string, number>)[s] += 1
    }
    return { byHour, byDayOfWeek, byWeekOfMonth }
  }, [callLogs, seasonalityRepFilter])

  const seasonalityLeadStacked = useMemo(() => {
    const logs = seasonalityRepFilter === 'all'
      ? callLogs
      : callLogs.filter((l) => l.user_id === seasonalityRepFilter)
    const leadLogs = logs.filter((l) => l.lead_id && l.leads?.status)
    const byHour = Array.from({ length: 24 }, (_, i) => ({ hour: i, label: `${i}:00` } as Record<string, number | string>))
    const byDayOfWeek = DAY_LABELS.map((_, i) => ({ day: i, dayLabel: DAY_LABELS[i] } as Record<string, number | string>))
    const byWeekOfMonth = [1, 2, 3, 4, 5].map((w) => ({ week: w, label: `${w}${w === 1 ? 'st' : w === 2 ? 'nd' : w === 3 ? 'rd' : 'th'} week` } as Record<string, number | string>))
    const addCount = (arr: Record<string, number | string>[], index: number, status: string) => {
      if (!(status in arr[index])) arr[index][status] = 0
        ; (arr[index] as Record<string, number>)[status] += 1
    }
    leadLogs.forEach((l) => {
      const d = new Date(l.call_started_at)
      const st = l.leads!.status!
      addCount(byHour, d.getHours(), st)
      const dayIndex = d.getDay() === 0 ? 6 : d.getDay() - 1
      addCount(byDayOfWeek, dayIndex, st)
      const w = Math.min(5, Math.ceil(d.getDate() / 7)) - 1
      addCount(byWeekOfMonth, w, st)
    })
    return { byHour, byDayOfWeek, byWeekOfMonth }
  }, [callLogs, seasonalityRepFilter])

  // Recommendations
  const recommendations = useMemo(() => {
    const gap = Math.max(0, totalLeads - contactedLeads)
    const callsPerLead = contactedLeads > 0 ? callOverview.totalCalls / contactedLeads : 2
    const callsNeededToCoverGap = Math.ceil(gap * Math.max(1, callsPerLead))

    const byUser = callOverview.byUser
    const avgCalls = byUser.length > 0 ? byUser.reduce((s, u) => s + u.totalCalls, 0) / byUser.length : 0
    const repTiers = byUser.map((u) => {
      let tier: 'good' | 'average' | 'poor' = 'average'
      if (u.totalCalls >= avgCalls * 1.2 && u.answerRate >= 50) tier = 'good'
      else if (u.totalCalls < avgCalls * 0.7 || u.answerRate < 30) tier = 'poor'
      const scopeCalls = tier === 'poor' ? Math.max(0, Math.ceil(avgCalls - u.totalCalls)) : 0
      return { ...u, tier, scopeCalls }
    })

    const bestHour = seasonality.byHour.reduce((best, cur) => (cur.count > best.count ? cur : best), seasonality.byHour[0])
    const bestDay = seasonality.byDayOfWeek.reduce((best, cur) => (cur.count > best.count ? cur : best), seasonality.byDayOfWeek[0])

    const leadStatusByRep = new Map<string, Record<string, number>>()
    callLogs.forEach((l) => {
      if (!l.lead_id || !l.leads?.status) return
      const uid = l.user_id
      const cur = leadStatusByRep.get(uid) || {}
      const st = l.leads.status
      cur[st] = (cur[st] || 0) + 1
      leadStatusByRep.set(uid, cur)
    })

    return {
      gap,
      callsNeededToCoverGap,
      repTiers,
      bestHour: bestHour?.hour ?? 10,
      bestDayLabel: bestDay?.dayLabel ?? 'Mon',
      leadStatusByRep,
    }
  }, [callOverview, totalLeads, contactedLeads, seasonality, callLogs])

  // Pie: calls by rep filtered by call status
  const repPieByCallStatusData = useMemo(() => {
    return callOverview.byUser
      .map((u) => ({ name: u.repLabel ?? u.name, value: (u as Record<string, number>)[repPieCallStatusFilter] ?? 0 }))
      .filter((d) => d.value > 0)
  }, [callOverview.byUser, repPieCallStatusFilter])

  // Pie: calls by rep filtered by lead status (uses recommendations.leadStatusByRep)
  const repPieByLeadStatusData = useMemo(() => {
    if (!repPieLeadStatusFilter) return []
    const byRep = recommendations.leadStatusByRep
    return callOverview.byUser
      .map((u) => ({ name: u.repLabel ?? u.name, value: byRep.get(u.userId)?.[repPieLeadStatusFilter] ?? 0 }))
      .filter((d) => d.value > 0)
  }, [callOverview.byUser, recommendations.leadStatusByRep, repPieLeadStatusFilter])

  const leadStatusOptions = useMemo(() => Object.keys(callOverview.leadStatusBreakdown).sort(), [callOverview.leadStatusBreakdown])

  useEffect(() => {
    if (leadStatusOptions.length > 0 && !repPieLeadStatusFilter) setRepPieLeadStatusFilter(leadStatusOptions[0])
  }, [leadStatusOptions, repPieLeadStatusFilter])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title={getMenuLabel(menuNames, 'call-tracking', 'Call Tracking')}
        description="Insights, recommendations, and call history"
      />

      <div className="flex-1 p-4 lg:p-6 space-y-6">
        {/* Global date filter */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                <CardTitle>Time period</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { value: 'today', label: 'Today' },
                  { value: 'last_7_days', label: 'Last 7 days' },
                  { value: 'last_30_days', label: 'Last 30 days' },
                  { value: 'all_time', label: 'All time' },
                  { value: 'custom', label: 'Custom' },
                ].map((opt) => (
                  <Button
                    key={opt.value}
                    variant={dateFilter === opt.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDateFilter(opt.value as DateFilter)}
                  >
                    {opt.label}
                  </Button>
                ))}
                {dateFilter === 'custom' && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={customDateFrom}
                      onChange={(e) => setCustomDateFrom(e.target.value)}
                      className="w-36"
                    />
                    <span className="text-muted-foreground">to</span>
                    <Input
                      type="date"
                      value={customDateTo}
                      onChange={(e) => setCustomDateTo(e.target.value)}
                      className="w-36"
                    />
                  </div>
                )}
                <Button variant="outline" size="icon" onClick={() => fetchLogs()} disabled={refreshing}>
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'insights' | 'recommendations')} className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2 h-auto">
            <TabsTrigger value="insights" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Insights
            </TabsTrigger>
            <TabsTrigger value="recommendations" className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Recommendations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="insights" className="space-y-4 mt-4">
            {/* Total call analysis */}
            <Card>
              <CardHeader>
                <CardTitle>Total call analysis</CardTitle>
                <CardDescription>Status, duration, and volume for the selected period</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Total calls</p>
                    <p className="text-2xl font-bold">{callOverview.totalCalls}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Lead calls</p>
                    <p className="text-2xl font-bold text-blue-600">{callOverview.totalCalls - callOverview.nonLeadCallsCount}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Unique leads called</p>
                    <p className="text-2xl font-bold text-indigo-600">{callOverview.uniqueLeads}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Non-lead calls</p>
                    <p className="text-2xl font-bold text-slate-600">{callOverview.nonLeadCallsCount}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p className="text-2xl font-bold text-green-600">{callOverview.statusCounts.completed}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Missed</p>
                    <p className="text-2xl font-bold text-orange-600">{callOverview.statusCounts.missed}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Failed</p>
                    <p className="text-2xl font-bold text-red-600">{callOverview.statusCounts.failed}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Answer rate</p>
                    <p className="text-2xl font-bold">{callOverview.answerRate}%</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Avg talk time</p>
                    <p className="text-2xl font-bold">{formatDuration(callOverview.avgTalkTime)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {statusChartData.length > 0 && (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={statusChartData} margin={{ left: 8 }} barCategoryGap="28%" barGap={4}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={44}>
                            {statusChartData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {callsByDayStackedData.length > 0 && (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={callsByDayStackedData} barCategoryGap="24%" barGap={2}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Legend {...SMALL_LEGEND_PROPS} />
                          <Bar dataKey="completed" stackId="a" fill={STATUS_COLORS.completed} name="Completed" radius={[0, 0, 0, 0]} maxBarSize={40} />
                          <Bar dataKey="missed" stackId="a" fill={STATUS_COLORS.missed} name="Missed" radius={[0, 0, 0, 0]} maxBarSize={40} />
                          <Bar dataKey="failed" stackId="a" fill={STATUS_COLORS.failed} name="Failed" radius={[0, 0, 0, 0]} maxBarSize={40} />
                          <Bar dataKey="rejected" stackId="a" fill={STATUS_COLORS.rejected} name="Rejected" radius={[0, 0, 0, 0]} maxBarSize={40} />
                          <Bar dataKey="busy" stackId="a" fill={STATUS_COLORS.busy} name="Busy" radius={[0, 0, 0, 0]} maxBarSize={40} />
                          <Bar dataKey="blocked" stackId="a" fill={STATUS_COLORS.blocked} name="Blocked" radius={[4, 4, 0, 0]} maxBarSize={40} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
                {callsByDayStackedData.length > 0 && (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <p className="text-sm font-medium">Call status over time (by day)</p>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="text-xs gap-1">
                            Show lines: {lineChartStatusFilter.size} selected
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {CALL_STATUS_OPTIONS.map((status) => (
                            <DropdownMenuCheckboxItem
                              key={status}
                              checked={lineChartStatusFilter.has(status)}
                              onCheckedChange={() => {
                                setLineChartStatusFilter((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(status)) next.delete(status)
                                  else next.add(status)
                                  return next
                                })
                              }}
                            >
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={callsByDayStackedData} margin={{ left: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Legend {...SMALL_LEGEND_PROPS} />
                          {lineChartStatusFilter.has('completed') && <Line type="monotone" dataKey="completed" name="Completed" stroke={STATUS_COLORS.completed} strokeWidth={2} dot={{ r: 2 }} />}
                          {lineChartStatusFilter.has('missed') && <Line type="monotone" dataKey="missed" name="Missed" stroke={STATUS_COLORS.missed} strokeWidth={2} dot={{ r: 2 }} />}
                          {lineChartStatusFilter.has('failed') && <Line type="monotone" dataKey="failed" name="Failed" stroke={STATUS_COLORS.failed} strokeWidth={2} dot={{ r: 2 }} />}
                          {lineChartStatusFilter.has('rejected') && <Line type="monotone" dataKey="rejected" name="Rejected" stroke={STATUS_COLORS.rejected} strokeWidth={2} dot={{ r: 2 }} />}
                          {lineChartStatusFilter.has('busy') && <Line type="monotone" dataKey="busy" name="Busy" stroke={STATUS_COLORS.busy} strokeWidth={2} dot={{ r: 2 }} />}
                          {lineChartStatusFilter.has('blocked') && <Line type="monotone" dataKey="blocked" name="Blocked" stroke={STATUS_COLORS.blocked} strokeWidth={2} dot={{ r: 2 }} />}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {leadStatusChartData.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Calls by lead status (lead-linked calls only)</p>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={leadStatusChartData} margin={{ left: 8 }} barCategoryGap="28%" barGap={4}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="status" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Bar dataKey="count" fill="hsl(var(--primary))" name="Calls" radius={[4, 4, 0, 0]} maxBarSize={44} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                  {leadStatusByDayData.length > 0 && (() => {
                    const statusKeys = Object.keys(leadStatusByDayData[0] || {}).filter((k) => k !== 'date')
                    if (statusKeys.length === 0) return null
                    const leadStatusColors = ['hsl(var(--primary))', '#8b5cf6', '#06b6d4', '#22c55e', '#f97316', '#eab308', '#ef4444']
                    return (
                      <div>
                        <p className="text-sm font-medium mb-2">Lead status breakdown (daily, lead-linked calls only)</p>
                        <div className="h-56">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={leadStatusByDayData} barCategoryGap="24%" barGap={2}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                              <YAxis tick={{ fontSize: 10 }} />
                              <Tooltip />
                              <Legend {...SMALL_LEGEND_PROPS} />
                              {statusKeys.map((key, i) => (
                                <Bar key={key} dataKey={key} stackId="a" name={key.replace(/_/g, ' ')} fill={leadStatusColors[i % leadStatusColors.length]} radius={[0, 0, 0, 0]} maxBarSize={40} />
                              ))}
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </CardContent>
            </Card>

            {/* Sales rep breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Sales rep breakdown</CardTitle>
                <CardDescription>Total calls, unique leads, duration, and status per rep</CardDescription>
              </CardHeader>
              <CardContent>
                {callOverview.byUser.length === 0 ? (
                  <p className="text-muted-foreground text-center py-6">No call data for this period</p>
                ) : (
                  <>
                    <div className="h-72 mb-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={callOverview.byUser.slice(0, 10)} margin={{ left: 8, right: 8 }} barCategoryGap="22%" barGap={2}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="repLabel"
                            interval={0}
                            height={64}
                            tick={(props: { x?: number; y?: number; payload?: { value?: string } }) => {
                              const { x = 0, y = 0, payload } = props
                              const raw = payload?.value ?? ''
                              const paren = raw.indexOf(' (')
                              const name = paren >= 0 ? raw.slice(0, paren) : raw
                              const email = paren >= 0 ? raw.slice(paren + 2).replace(/\)$/, '') : ''
                              return (
                                <g transform={`translate(${x},${y})`}>
                                  <text textAnchor="middle" dy={8} fontSize={10} fill="currentColor">
                                    {name}
                                  </text>
                                  {email ? (
                                    <text textAnchor="middle" dy={20} fontSize={9} fill="hsl(var(--muted-foreground))">
                                      ({email})
                                    </text>
                                  ) : null}
                                </g>
                              )
                            }}
                          />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Legend {...SMALL_LEGEND_PROPS} />
                          <Bar dataKey="completed" stackId="a" fill={STATUS_COLORS.completed} name="Completed" radius={[0, 0, 0, 0]} maxBarSize={36} />
                          <Bar dataKey="missed" stackId="a" fill={STATUS_COLORS.missed} name="Missed" radius={[0, 0, 0, 0]} maxBarSize={36} />
                          <Bar dataKey="failed" stackId="a" fill={STATUS_COLORS.failed} name="Failed" radius={[0, 0, 0, 0]} maxBarSize={36} />
                          <Bar dataKey="rejected" stackId="a" fill={STATUS_COLORS.rejected} name="Rejected" radius={[0, 0, 0, 0]} maxBarSize={36} />
                          <Bar dataKey="busy" stackId="a" fill={STATUS_COLORS.busy} name="Busy" radius={[0, 0, 0, 0]} maxBarSize={36} />
                          <Bar dataKey="blocked" stackId="a" fill={STATUS_COLORS.blocked} name="Blocked" radius={[4, 4, 0, 0]} maxBarSize={36} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
                      <div className="rounded-lg border p-4">
                        <p className="text-sm font-medium mb-2">Calls by sales rep (filtered by call status)</p>
                        <Select value={repPieCallStatusFilter} onValueChange={setRepPieCallStatusFilter}>
                          <SelectTrigger className="w-full max-w-[200px] mb-3">
                            <SelectValue placeholder="Call status" />
                          </SelectTrigger>
                          <SelectContent>
                            {CALL_STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s.charAt(0).toUpperCase() + s.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {repPieByCallStatusData.length > 0 ? (
                          <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                              <Pie
                                data={repPieByCallStatusData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={72}
                              >
                                {repPieByCallStatusData.map((_, i) => (
                                  <Cell key={i} fill={['hsl(var(--primary))', '#8b5cf6', '#06b6d4', '#22c55e', '#f97316', '#eab308', '#ef4444'][i % 7]} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(value, name) => [value, name]} contentStyle={{ fontSize: 11 }} labelFormatter={(name) => `Rep: ${name}`} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <p className="text-muted-foreground text-sm py-8 text-center">No calls for this status</p>
                        )}
                      </div>
                      <div className="rounded-lg border p-4">
                        <p className="text-sm font-medium mb-2">Calls by sales rep (filtered by lead status)</p>
                        <Select value={repPieLeadStatusFilter || undefined} onValueChange={setRepPieLeadStatusFilter}>
                          <SelectTrigger className="w-full max-w-[200px] mb-3">
                            <SelectValue placeholder="Lead status" />
                          </SelectTrigger>
                          <SelectContent>
                            {leadStatusOptions.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s.replace(/_/g, ' ')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {repPieByLeadStatusData.length > 0 ? (
                          <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                              <Pie
                                data={repPieByLeadStatusData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={72}
                              >
                                {repPieByLeadStatusData.map((_, i) => (
                                  <Cell key={i} fill={['hsl(var(--primary))', '#8b5cf6', '#06b6d4', '#22c55e', '#f97316', '#eab308', '#ef4444'][i % 7]} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(value, name) => [value, name]} contentStyle={{ fontSize: 11 }} labelFormatter={(name) => `Rep: ${name}`} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <p className="text-muted-foreground text-sm py-8 text-center">
                            {repPieLeadStatusFilter ? 'No calls for this lead status' : 'Select a lead status'}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left py-2 px-3 font-medium">Rep</th>
                            <th className="text-center py-2 px-3 font-medium">Calls</th>
                            <th className="text-center py-2 px-3 font-medium">Unique leads</th>
                            <th className="text-center py-2 px-3 font-medium">Completed</th>
                            <th className="text-center py-2 px-3 font-medium">Answer %</th>
                            <th className="text-center py-2 px-3 font-medium">Avg talk</th>
                          </tr>
                        </thead>
                        <tbody>
                          {callOverview.byUser.map((u) => (
                            <tr key={u.userId} className="border-b last:border-0">
                              <td className="py-2 px-3 font-medium">
                                <span className="block">{u.name}</span>
                                {u.email && <span className="block text-xs text-muted-foreground">{u.email}</span>}
                              </td>
                              <td className="text-center py-2 px-3">{u.totalCalls}</td>
                              <td className="text-center py-2 px-3">{u.uniqueLeads}</td>
                              <td className="text-center py-2 px-3">{u.completed}</td>
                              <td className="text-center py-2 px-3">{u.answerRate}%</td>
                              <td className="text-center py-2 px-3">{formatDuration(u.avgTalkTime)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Lead level breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Lead level breakdown</CardTitle>
                <CardDescription>Top leads by call volume</CardDescription>
              </CardHeader>
              <CardContent>
                {callOverview.byLead.length === 0 ? (
                  <p className="text-muted-foreground text-center py-6">No lead-linked calls in this period</p>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-2 px-3 font-medium">Lead</th>
                          <th className="text-center py-2 px-3 font-medium">Lead status</th>
                          <th className="text-center py-2 px-3 font-medium">Calls</th>
                          <th className="text-center py-2 px-3 font-medium">Completed</th>
                          <th className="text-center py-2 px-3 font-medium">Missed</th>
                          <th className="text-center py-2 px-3 font-medium">Talk time</th>
                          <th className="text-right py-2 px-3 font-medium">Last call</th>
                        </tr>
                      </thead>
                      <tbody>
                        {callOverview.byLead.map((l) => (
                          <tr key={l.leadId} className="border-b last:border-0">
                            <td className="py-2 px-3">
                              <div>
                                <span className="font-medium">{l.name}</span>
                                {l.phone && <span className="block text-xs text-muted-foreground">{l.phone}</span>}
                              </div>
                            </td>
                            <td className="text-center py-2 px-3">
                              {l.status ? (
                                <Badge variant="secondary" className="text-xs capitalize">
                                  {l.status.replace(/_/g, ' ')}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">--</span>
                              )}
                            </td>
                            <td className="text-center py-2 px-3">{l.totalCalls}</td>
                            <td className="text-center py-2 px-3">{l.completed}</td>
                            <td className="text-center py-2 px-3">{l.missed}</td>
                            <td className="text-center py-2 px-3">{formatDuration(l.totalTalkTime)}</td>
                            <td className="text-right py-2 px-3 text-muted-foreground">
                              {l.lastCallAt ? fmt(new Date(l.lastCallAt), 'MMM d, HH:mm') : '--'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Seasonality */}
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Seasonality</CardTitle>
                    <CardDescription>Time of day, day of week, and week of month</CardDescription>
                  </div>
                  {callOverview.byUser.length > 0 && (
                    <Select value={seasonalityRepFilter} onValueChange={setSeasonalityRepFilter}>
                      <SelectTrigger className="w-full sm:w-48">
                        <SelectValue placeholder="Sales rep" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All reps</SelectItem>
                        {callOverview.byUser.map((u) => (
                          <SelectItem key={u.userId} value={u.userId}>
                            {u.email ? `${u.name} (${u.email})` : u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium mb-3">Call status by time</p>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                  <div className="h-56">
                    <p className="text-xs text-muted-foreground mb-2">By hour</p>
                    <ResponsiveContainer width="100%" height="90%">
                      <BarChart data={seasonalityStacked.byHour} barCategoryGap="24%" barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hour" />
                        <YAxis />
                        <Tooltip />
                        <Legend {...SMALL_LEGEND_PROPS} />
                        <Bar dataKey="completed" stackId="a" fill={STATUS_COLORS.completed} name="Completed" radius={[0, 0, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="missed" stackId="a" fill={STATUS_COLORS.missed} name="Missed" radius={[0, 0, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="failed" stackId="a" fill={STATUS_COLORS.failed} name="Failed" radius={[0, 0, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="rejected" stackId="a" fill={STATUS_COLORS.rejected} name="Rejected" radius={[0, 0, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="busy" stackId="a" fill={STATUS_COLORS.busy} name="Busy" radius={[0, 0, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="blocked" stackId="a" fill={STATUS_COLORS.blocked} name="Blocked" radius={[2, 2, 0, 0]} maxBarSize={28} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="h-56">
                    <p className="text-xs text-muted-foreground mb-2">By day of week</p>
                    <ResponsiveContainer width="100%" height="90%">
                      <BarChart data={seasonalityStacked.byDayOfWeek} barCategoryGap="24%" barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="dayLabel" />
                        <YAxis />
                        <Tooltip />
                        <Legend {...SMALL_LEGEND_PROPS} />
                        <Bar dataKey="completed" stackId="a" fill={STATUS_COLORS.completed} name="Completed" radius={[0, 0, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="missed" stackId="a" fill={STATUS_COLORS.missed} name="Missed" radius={[0, 0, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="failed" stackId="a" fill={STATUS_COLORS.failed} name="Failed" radius={[0, 0, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="rejected" stackId="a" fill={STATUS_COLORS.rejected} name="Rejected" radius={[0, 0, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="busy" stackId="a" fill={STATUS_COLORS.busy} name="Busy" radius={[0, 0, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="blocked" stackId="a" fill={STATUS_COLORS.blocked} name="Blocked" radius={[2, 2, 0, 0]} maxBarSize={28} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="h-56">
                    <p className="text-xs text-muted-foreground mb-2">By week of month</p>
                    <ResponsiveContainer width="100%" height="90%">
                      <BarChart data={seasonalityStacked.byWeekOfMonth} barCategoryGap="24%" barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis />
                        <Tooltip />
                        <Legend {...SMALL_LEGEND_PROPS} />
                        <Bar dataKey="completed" stackId="a" fill={STATUS_COLORS.completed} name="Completed" radius={[0, 0, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="missed" stackId="a" fill={STATUS_COLORS.missed} name="Missed" radius={[0, 0, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="failed" stackId="a" fill={STATUS_COLORS.failed} name="Failed" radius={[0, 0, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="rejected" stackId="a" fill={STATUS_COLORS.rejected} name="Rejected" radius={[0, 0, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="busy" stackId="a" fill={STATUS_COLORS.busy} name="Busy" radius={[0, 0, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="blocked" stackId="a" fill={STATUS_COLORS.blocked} name="Blocked" radius={[2, 2, 0, 0]} maxBarSize={28} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <p className="text-sm font-medium mb-3">Lead status by time (lead-linked calls only)</p>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {(() => {
                    const byHour = seasonalityLeadStacked.byHour
                    const byDay = seasonalityLeadStacked.byDayOfWeek
                    const byWeek = seasonalityLeadStacked.byWeekOfMonth
                    const leadStatusKeys = Array.from(new Set([
                      ...Object.keys(byHour[0] || {}).filter((k) => k !== 'hour' && k !== 'label'),
                      ...Object.keys(byDay[0] || {}).filter((k) => k !== 'day' && k !== 'dayLabel'),
                      ...Object.keys(byWeek[0] || {}).filter((k) => k !== 'week' && k !== 'label'),
                    ]))
                    if (leadStatusKeys.length === 0) return <p className="text-muted-foreground text-sm col-span-full">No lead status data in this period.</p>
                    const colors = ['hsl(var(--primary))', '#8b5cf6', '#06b6d4', '#22c55e', '#f97316', '#eab308']
                    return (
                      <>
                        <div className="h-56">
                          <p className="text-xs text-muted-foreground mb-2">By hour</p>
                          <ResponsiveContainer width="100%" height="90%">
                            <BarChart data={byHour} barCategoryGap="24%" barGap={2}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="hour" />
                              <YAxis />
                              <Tooltip />
                              <Legend {...SMALL_LEGEND_PROPS} />
                              {leadStatusKeys.map((key, i) => (
                                <Bar key={key} dataKey={key} stackId="b" name={key.replace(/_/g, ' ')} fill={colors[i % colors.length]} radius={[0, 0, 0, 0]} maxBarSize={28} />
                              ))}
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="h-56">
                          <p className="text-xs text-muted-foreground mb-2">By day of week</p>
                          <ResponsiveContainer width="100%" height="90%">
                            <BarChart data={byDay} barCategoryGap="24%" barGap={2}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="dayLabel" />
                              <YAxis />
                              <Tooltip />
                              <Legend {...SMALL_LEGEND_PROPS} />
                              {leadStatusKeys.map((key, i) => (
                                <Bar key={key} dataKey={key} stackId="b" name={key.replace(/_/g, ' ')} fill={colors[i % colors.length]} radius={[0, 0, 0, 0]} maxBarSize={28} />
                              ))}
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="h-56">
                          <p className="text-xs text-muted-foreground mb-2">By week of month</p>
                          <ResponsiveContainer width="100%" height="90%">
                            <BarChart data={byWeek} barCategoryGap="24%" barGap={2}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="label" />
                              <YAxis />
                              <Tooltip />
                              <Legend {...SMALL_LEGEND_PROPS} />
                              {leadStatusKeys.map((key, i) => (
                                <Bar key={key} dataKey={key} stackId="b" name={key.replace(/_/g, ' ')} fill={colors[i % colors.length]} radius={[0, 0, 0, 0]} maxBarSize={28} />
                              ))}
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </CardContent>
            </Card>

            {/* Calls table (all calls: lead + non-lead) */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Phone className="w-5 h-5 text-primary" />
                    <CardTitle>Calls</CardTitle>
                    <CardDescription>All calls in the selected period</CardDescription>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search phone / lead / rep…"
                      className="pl-9"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredLogs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No call logs found for this period</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[520px] pr-3">
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left py-2 px-3 font-medium">Phone</th>
                            <th className="text-center py-2 px-3 font-medium">Call status</th>
                            <th className="text-center py-2 px-3 font-medium">Direction</th>
                            <th className="text-center py-2 px-3 font-medium">Duration</th>
                            <th className="text-center py-2 px-3 font-medium">Business</th>
                            <th className="text-center py-2 px-3 font-medium">Lead status</th>
                            <th className="text-left py-2 px-3 font-medium">Sales rep</th>
                            <th className="text-right py-2 px-3 font-medium">Datetime</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLogs.map((log) => (
                            <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="py-2 px-3 font-medium">{log.phone_number}</td>
                              <td className="text-center py-2 px-3">
                                <Badge variant="outline" className={`text-xs ${getStatusColor(log.call_status)}`}>
                                  {log.call_status}
                                </Badge>
                              </td>
                              <td className="text-center py-2 px-3">{log.call_direction}</td>
                              <td className="text-center py-2 px-3">{formatDuration(log.duration_seconds || 0)}</td>
                              <td className="text-center py-2 px-3">
                                {log.lead_id ? (
                                  <Badge variant="outline" className="text-xs">Lead</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">Non-lead</Badge>
                                )}
                              </td>
                              <td className="text-center py-2 px-3">
                                {log.lead_id && log.leads?.status ? (
                                  <span className="capitalize">{log.leads.status.replace(/_/g, ' ')}</span>
                                ) : (
                                  <span className="text-muted-foreground">--</span>
                                )}
                              </td>
                              <td className="text-left py-2 px-3 text-muted-foreground">
                                {log.users ? (
                                  log.users.email ? `${log.users.name} (${log.users.email})` : log.users.name
                                ) : (
                                  '--'
                                )}
                              </td>
                              <td className="text-right py-2 px-3 text-muted-foreground">
                                {fmt(new Date(log.call_started_at), 'MMM d, yyyy HH:mm')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recommendations" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Business level</CardTitle>
                <CardDescription>Lead coverage and call volume</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Total leads (period)</p>
                    <p className="text-2xl font-bold">{totalLeads}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Leads contacted</p>
                    <p className="text-2xl font-bold text-green-600">{contactedLeads}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Gap (not contacted)</p>
                    <p className="text-2xl font-bold text-orange-600">{recommendations.gap}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Est. calls to cover gap</p>
                    <p className="text-2xl font-bold">{recommendations.callsNeededToCoverGap}</p>
                  </div>
                </div>
                {recommendations.gap > 0 && (
                  <p className="text-sm text-muted-foreground">
                    To reach all leads in this period, aim for roughly {recommendations.callsNeededToCoverGap} more calls
                    (based on current calls-per-contact rate).
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sales rep level</CardTitle>
                <CardDescription>Performance tier and scope for improvement</CardDescription>
              </CardHeader>
              <CardContent>
                {recommendations.repTiers.length === 0 ? (
                  <p className="text-muted-foreground text-center py-6">No rep data for this period</p>
                ) : (
                  <div className="space-y-3">
                    {recommendations.repTiers.map((u) => (
                      <div
                        key={u.userId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{u.repLabel ?? (u.email ? `${u.name} (${u.email})` : u.name)}</span>
                          <Badge
                            variant={u.tier === 'good' ? 'default' : u.tier === 'poor' ? 'destructive' : 'secondary'}
                          >
                            {u.tier === 'good' ? 'Good' : u.tier === 'poor' ? 'Needs improvement' : 'Average'}
                          </Badge>
                        </div>
                        {u.tier === 'poor' && u.scopeCalls > 0 && (
                          <p className="text-sm text-muted-foreground">
                            Try {u.scopeCalls} more calls to align with team average.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Calls vs lead status (correlation) */}
            <Card>
              <CardHeader>
                <CardTitle>Calls vs lead status</CardTitle>
                <CardDescription>Lead-linked calls correlated with current lead status (demo, deal won, etc.)</CardDescription>
              </CardHeader>
              <CardContent>
                {callOverview.byUser.length === 0 ? (
                  <p className="text-muted-foreground text-center py-6">No rep data for this period</p>
                ) : (
                  <div className="space-y-4">
                    {callOverview.byUser.map((u) => {
                      const statusBreakdown = recommendations.leadStatusByRep.get(u.userId)
                      const entries = statusBreakdown ? Object.entries(statusBreakdown).sort((a, b) => b[1] - a[1]) : []
                      const dealWon = statusBreakdown?.deal_won ?? 0
                      const demoBooked = (statusBreakdown?.demo_booked ?? 0) + (statusBreakdown?.demo_completed ?? 0)
                      return (
                        <div key={u.userId} className="rounded-lg border p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{u.repLabel ?? (u.email ? `${u.name} (${u.email})` : u.name)}</span>
                            <span className="text-xs text-muted-foreground">
                              {u.uniqueLeads} unique leads contacted
                            </span>
                          </div>
                          {entries.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No lead status data from calls</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {entries.map(([status, count]) => (
                                <Badge key={status} variant="secondary" className="text-xs">
                                  {status.replace(/_/g, ' ')}: {count}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {(dealWon > 0 || demoBooked > 0) && (
                            <p className="text-xs text-muted-foreground">
                              Outcomes: {dealWon} deal(s) won, {demoBooked} demo(s) from called leads.
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Seasonality</CardTitle>
                <CardDescription>Best time and day to call</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Peak hour (by volume)</p>
                    <p className="text-xl font-bold">{recommendations.bestHour}:00</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Peak day (by volume)</p>
                    <p className="text-xl font-bold">{recommendations.bestDayLabel}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Based on when most calls were made in this period. Consider aligning outreach with these times.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
