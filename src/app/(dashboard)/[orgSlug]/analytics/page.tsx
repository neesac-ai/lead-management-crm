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
  Cloud,
  ExternalLink,
  AlertCircle,
  User as UserIcon,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { User, Lead, LeadStatus } from '@/types/database.types'
import { format, subDays, startOfDay, endOfDay, isWithinInterval, formatDistanceToNow } from 'date-fns'
import type { CallRecording } from '@/types/ai.types'
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

  // Call analytics state
  const [recordings, setRecordings] = useState<CallRecording[]>([])
  const [syncing, setSyncing] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRecording, setSelectedRecording] = useState<CallRecording | null>(null)
  const [hasAIConfig, setHasAIConfig] = useState(false)
  const [isGoogleConnected, setIsGoogleConnected] = useState(false)
  const [folderConfigured, setFolderConfigured] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null)
  const [selectedSalesRep, setSelectedSalesRep] = useState<string>('all')

  const [callStats, setCallStats] = useState({
    totalCalls: 0,
    totalDuration: 0,
    avgDuration: 0,
    positive: 0,
    neutral: 0,
    negative: 0,
    pending: 0,
    completed: 0,
    failed: 0,
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

  // Auto-sync calls on page load and every 3 minutes (reduced from 60s for performance)
  useEffect(() => {
    if (!folderConfigured || !isGoogleConnected || loading || activeTab !== 'calls') return

    // Initial sync with small delay to avoid blocking
    const initialSync = setTimeout(autoSync, 1000)
    // Sync every 3 minutes instead of every minute
    const syncInterval = setInterval(autoSync, 180000)
    return () => {
      clearTimeout(initialSync)
      clearInterval(syncInterval)
    }
  }, [folderConfigured, isGoogleConnected, loading, activeTab])

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
      setIsGoogleConnected(!!userData.google_refresh_token)

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

      setHasAIConfig(!!(aiConfigs && aiConfigs.length > 0))

      // Check folder config
      const { data: syncSettings } = await supabase
        .from('drive_sync_settings')
        .select('folder_id, last_sync_at')
        .eq('user_id', userData.id)
        .single()

      setFolderConfigured(!!(syncSettings?.folder_id))
      if (syncSettings?.last_sync_at) {
        setLastSyncTime(syncSettings.last_sync_at)
      }

      // Fetch recordings
      await fetchRecordings(currentOrgId, userData)

    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchRecordings(currentOrgId?: string, currentUser?: User) {
    const orgIdToUse = currentOrgId || orgId
    const userToUse = currentUser || user
    if (!orgIdToUse || !userToUse) return

    // Fetch recordings without foreign key relationship
    let query = supabase
      .from('call_recordings')
      .select(`
        id, phone_number, duration_seconds, recording_date,
        summary, sentiment, sentiment_reasoning, processing_status, processing_error,
        transcript, key_points, action_items, call_quality,
        drive_file_id, drive_file_name, drive_file_url,
        user_id, lead_id
      `)
      .eq('org_id', orgIdToUse)
      .order('recording_date', { ascending: false })

    // Sales can only see their own recordings
    // Managers can see their team's recordings
    if (userToUse.role === 'sales') {
      // Check if manager
      try {
        const { data: reportees } = await supabase
          .rpc('get_all_reportees', { manager_user_id: userToUse.id } as any)

        const reporteeIds = (reportees as Array<{ reportee_id: string }> | null)?.map((r: { reportee_id: string }) => r.reportee_id) || []
        if (reporteeIds.length > 0) {
          // Manager: see recordings from self + reportees
          query = query.in('user_id', [userToUse.id, ...reporteeIds])
        } else {
          // Non-manager: only own recordings
          query = query.eq('user_id', userToUse.id)
        }
      } catch (error) {
        // Fallback: only own recordings
        query = query.eq('user_id', userToUse.id)
      }
    }

    const { data: recordingsData, error } = await query

    if (error) {
      console.error('Error fetching recordings:', error)
      setRecordings([])
      return
    }

    // Fetch user names separately
    const userIds = new Set<string>()
    recordingsData?.forEach((rec: { user_id: string | null }) => {
      if (rec.user_id) userIds.add(rec.user_id)
    })

    let userMap: Record<string, { id: string; name: string; email: string }> = {}
    if (userIds.size > 0) {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', Array.from(userIds))

      if (usersData) {
        usersData.forEach(user => {
          userMap[user.id] = { id: user.id, name: user.name, email: user.email }
        })
      }
    }

    // Map recordings with user data
    const recordingsWithUsers = (recordingsData || []).map((rec: any) => ({
      ...rec,
      users: rec.user_id ? (userMap[rec.user_id] || null) : null
    }))

    setRecordings(recordingsWithUsers as CallRecording[])
    calculateCallStats(recordingsWithUsers as CallRecording[])
  }

  function calculateCallStats(recs: CallRecording[]) {
    const stats = {
      totalCalls: recs.length,
      totalDuration: 0,
      avgDuration: 0,
      positive: 0,
      neutral: 0,
      negative: 0,
      pending: 0,
      completed: 0,
      failed: 0,
    }

    recs.forEach(r => {
      if (r.duration_seconds) stats.totalDuration += r.duration_seconds
      if (r.sentiment === 'positive') stats.positive++
      else if (r.sentiment === 'negative') stats.negative++
      else if (r.sentiment === 'neutral') stats.neutral++
      if (r.processing_status === 'pending') stats.pending++
      else if (r.processing_status === 'completed') stats.completed++
      else if (r.processing_status === 'failed') stats.failed++
    })

    stats.avgDuration = stats.totalCalls > 0
      ? Math.round(stats.totalDuration / stats.totalCalls)
      : 0

    setCallStats(stats)
  }

  // Auto-sync in background
  const autoSync = async () => {
    try {
      const response = await fetch('/api/recordings/sync', { method: 'POST' })
      const result = await response.json()

      if (result.success && result.files_imported > 0) {
        toast.success(`${result.files_imported} new recording(s) synced`)
      }

      // Always refresh recordings list to pick up deletions and updates
      if (result.success) {
        setLastSyncTime(new Date().toISOString())
        fetchRecordings()
      }
    } catch {
      console.error('Auto-sync failed')
    }
  }

  // Manual sync
  const handleManualSync = async () => {
    setSyncing(true)
    try {
      const response = await fetch('/api/recordings/sync', { method: 'POST' })
      const result = await response.json()

      if (result.success) {
        if (result.files_imported > 0) {
          toast.success(`${result.files_imported} recording(s) imported!`)
        } else if (result.files_found > 0) {
          toast.info(`Found ${result.files_found} files, all already imported`)
        } else {
          toast.info('No recordings found in folder')
        }
        setLastSyncTime(new Date().toISOString())
        fetchRecordings()
      } else {
        toast.error(result.error || 'Sync failed')
      }
    } catch {
      toast.error('Failed to sync recordings')
    }
    setSyncing(false)
  }

  // Process recording
  const handleProcess = async (recordingId: string) => {
    setProcessing(recordingId)
    try {
      const response = await fetch('/api/recordings/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordingId }),
      })

      const result = await response.json()

      if (result.success) {
        toast.success('Recording analyzed successfully')
        fetchRecordings()
      } else {
        toast.error(result.error || 'Processing failed')
      }
    } catch {
      toast.error('Failed to process recording')
    }
    setProcessing(null)
  }

  // Delete recording (admin only)
  const handleDelete = async (recordingId: string) => {
    if (!confirm('Are you sure you want to delete this recording? This action cannot be undone. Note: The recording will remain in your Google Drive.')) {
      return
    }

    setDeleting(recordingId)
    try {
      const response = await fetch('/api/recordings/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordingId }),
      })

      const result = await response.json()

      if (result.success) {
        toast.success('Recording deleted')
        setRecordings(prev => prev.filter(r => r.id !== recordingId))
        // Close dialog if the deleted recording was selected
        if (selectedRecording?.id === recordingId) {
          setSelectedRecording(null)
        }
      } else {
        toast.error(result.error || 'Delete failed')
      }
    } catch {
      toast.error('Failed to delete recording')
    }
    setDeleting(null)
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

  // Call analytics helpers
  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getSentimentIcon = (sentiment: string | null) => {
    switch (sentiment) {
      case 'positive': return <TrendingUp className="w-4 h-4 text-green-500" />
      case 'negative': return <TrendingDown className="w-4 h-4 text-red-500" />
      default: return <Minus className="w-4 h-4 text-yellow-500" />
    }
  }

  const getSentimentBadge = (sentiment: string | null) => {
    switch (sentiment) {
      case 'positive': return <Badge className="bg-green-100 text-green-700">Positive</Badge>
      case 'negative': return <Badge className="bg-red-100 text-red-700">Negative</Badge>
      default: return <Badge className="bg-yellow-100 text-yellow-700">Neutral</Badge>
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3 mr-1" />Analyzed</Badge>
      case 'processing':
        return <Badge className="bg-blue-100 text-blue-700"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing</Badge>
      case 'failed':
        return <Badge className="bg-red-100 text-red-700"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>
      default:
        return <Badge className="bg-gray-100 text-gray-700"><AlertCircle className="w-3 h-3 mr-1" />Pending</Badge>
    }
  }

  // Filter recordings by search and sales rep - memoized for performance
  const filteredRecordings = useMemo(() => {
    return recordings.filter(r => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesSearch = r.phone_number?.toLowerCase().includes(query) ||
          r.summary?.toLowerCase().includes(query)
        if (!matchesSearch) return false
      }

      // Sales rep filter (admin only)
      if (isAdmin && selectedSalesRep !== 'all') {
        if (r.user_id !== selectedSalesRep) return false
      }

      return true
    })
  }, [recordings, searchQuery, isAdmin, selectedSalesRep])

  // Calculate call stats for selected rep - memoized
  const repCallStats = useMemo(() => {
    const recs = selectedSalesRep === 'all'
      ? recordings
      : recordings.filter(r => r.user_id === selectedSalesRep)

    const stats = {
      totalCalls: recs.length,
      totalDuration: 0,
      positive: 0,
      neutral: 0,
      negative: 0,
    }

    recs.forEach(r => {
      if (r.duration_seconds) stats.totalDuration += r.duration_seconds
      if (r.sentiment === 'positive') stats.positive++
      else if (r.sentiment === 'negative') stats.negative++
      else if (r.sentiment === 'neutral') stats.neutral++
    })

    return stats
  }, [recordings, selectedSalesRep])

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
            {/* Header with Refresh and Filters */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <p className="text-muted-foreground">
                  {folderConfigured ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      Auto-syncing
                      {lastSyncTime && (
                        <span className="text-xs">
                          • Last: {formatDistanceToNow(new Date(lastSyncTime), { addSuffix: true })}
                        </span>
                      )}
                    </span>
                  ) : (
                    'Connect your recording folder in Settings'
                  )}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                {/* Team Member Filter (Admin and Managers) */}
                {canViewTeam && salesTeam.length > 0 && (
                  <Select value={selectedSalesRep} onValueChange={setSelectedSalesRep}>
                    <SelectTrigger className="w-full sm:w-[180px] h-8 sm:h-9 text-xs sm:text-sm">
                      <SelectValue placeholder="Filter by member" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Team Members</SelectItem>
                      {salesTeam.map((rep) => (
                        <SelectItem key={rep.id} value={rep.id}>
                          {rep.name} ({rep.email}) - {rep.role === 'super_admin' ? 'Super Admin' : rep.role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {folderConfigured && isGoogleConnected && (
                  <Button variant="outline" onClick={handleManualSync} disabled={syncing} className="h-8 sm:h-9 text-xs sm:text-sm">
                    <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Syncing...' : 'Refresh'}
                  </Button>
                )}
              </div>
            </div>

            {/* Warnings */}
            {!isGoogleConnected && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="flex items-center gap-4 py-4">
                  <Cloud className="w-8 h-8 text-red-500" />
                  <div className="flex-1">
                    <h3 className="font-medium text-red-700">Google Drive Not Connected</h3>
                    <p className="text-sm text-red-600">Connect your Google account in Settings</p>
                  </div>
                  <Button asChild variant="destructive">
                    <Link href={`/${orgSlug}/settings`}>Go to Settings</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {isGoogleConnected && !folderConfigured && (
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="flex items-center gap-4 py-4">
                  <Cloud className="w-8 h-8 text-amber-500" />
                  <div className="flex-1">
                    <h3 className="font-medium text-amber-700">Recording Folder Not Selected</h3>
                    <p className="text-sm text-amber-600">Select your Google Drive folder in Settings</p>
                  </div>
                  <Button asChild variant="outline">
                    <Link href={`/${orgSlug}/settings`}>Select Folder</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {isGoogleConnected && !hasAIConfig && isAdmin && (
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="flex items-center gap-4 py-4">
                  <Sparkles className="w-8 h-8 text-amber-500" />
                  <div className="flex-1">
                    <h3 className="font-medium">AI Not Configured</h3>
                    <p className="text-sm text-muted-foreground">Configure AI for transcription and analysis</p>
                  </div>
                  <Button asChild>
                    <Link href={`/${orgSlug}/settings`}>Go to Settings</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Call Stats */}
            <div className="flex flex-col sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
              <Card>
                <CardHeader className="pb-2 p-3 sm:p-6">
                  <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Total Calls</CardTitle>
                </CardHeader>
                <CardContent className="p-3 sm:p-6 pt-0">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
                    <span className="text-xl sm:text-2xl font-bold">{repCallStats.totalCalls}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 p-3 sm:p-6">
                  <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Total Duration</CardTitle>
                </CardHeader>
                <CardContent className="p-3 sm:p-6 pt-0">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 shrink-0" />
                    <span className="text-xl sm:text-2xl font-bold">
                      {Math.round(repCallStats.totalDuration / 60)} min
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 p-3 sm:p-6">
                  <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Sentiment</CardTitle>
                </CardHeader>
                <CardContent className="p-3 sm:p-6 pt-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500 shrink-0" />
                      <span className="text-xs sm:text-sm">{repCallStats.positive}</span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-500 shrink-0" />
                      <span className="text-xs sm:text-sm">{repCallStats.neutral}</span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500 shrink-0" />
                      <span className="text-xs sm:text-sm">{repCallStats.negative}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 p-3 sm:p-6">
                  <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Processing</CardTitle>
                </CardHeader>
                <CardContent className="p-3 sm:p-6 pt-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                    <span className="text-green-600">{callStats.completed} Done</span>
                    <span className="text-amber-600">{callStats.pending} Pending</span>
                    <span className="text-red-600">{callStats.failed} Failed</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recordings List */}
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <CardTitle>Call Recordings</CardTitle>
                    <CardDescription>Click on a recording to view details and AI analysis</CardDescription>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search recordings..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 sm:pl-9 pr-2 h-8 sm:h-9 text-xs sm:text-sm"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredRecordings.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Phone className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>{recordings.length === 0 ? 'No recordings synced yet' : 'No recordings match your search'}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredRecordings.map((recording) => (
                      <div
                        key={recording.id}
                        className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => setSelectedRecording(recording)}
                      >
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Phone className="w-5 h-5 text-primary" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{recording.phone_number}</span>
                            {recording.sentiment && getSentimentIcon(recording.sentiment)}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(recording.recording_date), 'MMM d, h:mm a')}
                            <Clock className="w-3 h-3 ml-2" />
                            {formatDuration(recording.duration_seconds)}
                            {/* Show sales rep name for admin */}
                            {isAdmin && recording.users && (
                              <>
                                <UserIcon className="w-3 h-3 ml-2" />
                                <span className="text-primary">
                                  {(recording.users as { name: string; email: string }).name} ({(recording.users as { email: string }).email})
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {getStatusBadge(recording.processing_status)}
                          {recording.processing_status === 'pending' && hasAIConfig && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleProcess(recording.id)
                              }}
                              disabled={processing === recording.id}
                              title="Analyze with AI"
                            >
                              {processing === recording.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Sparkles className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(recording.id)
                              }}
                              disabled={deleting === recording.id}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Delete recording"
                            >
                              {deleting === recording.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
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

      {/* Recording Detail Dialog */}
      <Dialog open={!!selectedRecording} onOpenChange={() => setSelectedRecording(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedRecording && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Phone className="w-5 h-5" />
                  Call Details
                </DialogTitle>
                <DialogDescription>
                  {format(new Date(selectedRecording.recording_date), 'MMMM d, yyyy at h:mm a')}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Call Info */}
                <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserIcon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">{selectedRecording.phone_number}</h3>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(selectedRecording.recording_date), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <Badge variant="outline">
                      <Clock className="w-3 h-3 mr-1" />
                      {formatDuration(selectedRecording.duration_seconds)}
                    </Badge>
                    {selectedRecording.sentiment && getSentimentBadge(selectedRecording.sentiment)}
                  </div>
                </div>

                {/* Analysis Results */}
                {selectedRecording.processing_status === 'completed' ? (
                  <Tabs defaultValue="summary">
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="summary">Summary</TabsTrigger>
                      <TabsTrigger value="quality">Quality</TabsTrigger>
                      <TabsTrigger value="transcript">Transcript</TabsTrigger>
                      <TabsTrigger value="actions">Actions</TabsTrigger>
                    </TabsList>

                    <TabsContent value="summary" className="space-y-4 mt-4">
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-2">Summary</h4>
                        <p className="text-sm">{selectedRecording.summary}</p>
                      </div>

                      {/* Sentiment with reasoning */}
                      {selectedRecording.sentiment && (
                        <div>
                          <h4 className="text-sm font-medium text-muted-foreground mb-2">Sentiment Analysis</h4>
                          <div className="flex items-center gap-2 mb-2">
                            {getSentimentBadge(selectedRecording.sentiment)}
                          </div>
                          {selectedRecording.sentiment_reasoning && (
                            <p className="text-sm text-muted-foreground italic">
                              &quot;{selectedRecording.sentiment_reasoning}&quot;
                            </p>
                          )}
                        </div>
                      )}

                      {selectedRecording.key_points && (selectedRecording.key_points as string[]).length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-muted-foreground mb-2">Key Points</h4>
                          <ul className="text-sm space-y-1">
                            {(selectedRecording.key_points as string[]).map((point, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-primary">•</span>
                                {point}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {selectedRecording.next_steps && (
                        <div>
                          <h4 className="text-sm font-medium text-muted-foreground mb-2">Next Steps</h4>
                          <p className="text-sm">{selectedRecording.next_steps}</p>
                        </div>
                      )}
                    </TabsContent>

                    {/* Call Quality Tab */}
                    <TabsContent value="quality" className="space-y-4 mt-4">
                      {selectedRecording.call_quality ? (
                        <>
                          {/* Overall Score */}
                          <div className="text-center p-4 rounded-lg bg-muted/50">
                            <p className="text-sm text-muted-foreground mb-1">Overall Quality Score</p>
                            <p className="text-4xl font-bold text-primary">
                              {(selectedRecording.call_quality as { overall_score: number }).overall_score}/10
                            </p>
                          </div>

                          {/* Score Breakdown */}
                          <div className="flex flex-col sm:grid sm:grid-cols-2 gap-2 sm:gap-3">
                            {[
                              { label: 'Communication', key: 'communication_clarity' },
                              { label: 'Product Knowledge', key: 'product_knowledge' },
                              { label: 'Objection Handling', key: 'objection_handling' },
                              { label: 'Rapport Building', key: 'rapport_building' },
                              { label: 'Closing Technique', key: 'closing_technique' },
                            ].map(({ label, key }) => {
                              const score = (selectedRecording.call_quality as Record<string, number>)[key] || 0
                              const color = score >= 7 ? 'text-green-600' : score >= 5 ? 'text-yellow-600' : 'text-red-600'
                              return (
                                <div key={key} className="p-2 sm:p-3 rounded-lg border">
                                  <p className="text-xs text-muted-foreground">{label}</p>
                                  <p className={`text-base sm:text-lg font-semibold ${color}`}>{score}/10</p>
                                </div>
                              )
                            })}
                          </div>

                          {/* Strengths */}
                          {(selectedRecording.call_quality as { strengths?: string[] }).strengths?.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium text-green-600 mb-2">💪 Strengths</h4>
                              <ul className="text-sm space-y-1">
                                {((selectedRecording.call_quality as { strengths: string[] }).strengths).map((s, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="text-green-500">✓</span>
                                    {s}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Areas of Improvement */}
                          {(selectedRecording.call_quality as { areas_of_improvement?: string[] }).areas_of_improvement?.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium text-orange-600 mb-2">📈 Areas to Improve</h4>
                              <ul className="text-sm space-y-1">
                                {((selectedRecording.call_quality as { areas_of_improvement: string[] }).areas_of_improvement).map((a, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="text-orange-500">→</span>
                                    {a}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          Call quality metrics not available. Re-analyze with latest AI to get detailed quality scores.
                        </p>
                      )}
                    </TabsContent>

                    <TabsContent value="transcript" className="mt-4">
                      <div className="max-h-[300px] overflow-y-auto p-4 rounded-lg bg-muted/50 text-sm whitespace-pre-wrap">
                        {selectedRecording.transcript || 'No transcript available'}
                      </div>
                    </TabsContent>

                    <TabsContent value="actions" className="mt-4">
                      {selectedRecording.action_items && (selectedRecording.action_items as string[]).length > 0 ? (
                        <ul className="space-y-2">
                          {(selectedRecording.action_items as string[]).map((item, i) => (
                            <li key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                              <CheckCircle2 className="w-5 h-5 text-muted-foreground mt-0.5" />
                              <span className="text-sm">{item}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          No action items identified
                        </p>
                      )}
                    </TabsContent>
                  </Tabs>
                ) : (
                  <div className="text-center py-8">
                    {selectedRecording.processing_status === 'pending' ? (
                      <>
                        <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="font-medium">Recording Not Yet Analyzed</h3>
                        <p className="text-sm text-muted-foreground mt-2">
                          Click the button below to analyze this recording with AI
                        </p>
                        <Button
                          className="mt-4"
                          onClick={() => handleProcess(selectedRecording.id)}
                          disabled={processing === selectedRecording.id || !hasAIConfig}
                        >
                          {processing === selectedRecording.id ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4 mr-2" />
                          )}
                          Analyze with AI
                        </Button>
                      </>
                    ) : selectedRecording.processing_status === 'processing' ? (
                      <>
                        <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                        <h3 className="font-medium">Analyzing Recording...</h3>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                        <h3 className="font-medium">Analysis Failed</h3>
                        <p className="text-sm text-muted-foreground mt-2">
                          {selectedRecording.processing_error || 'Unknown error occurred'}
                        </p>
                        <Button
                          className="mt-4"
                          onClick={() => handleProcess(selectedRecording.id)}
                          disabled={processing === selectedRecording.id}
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Retry
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {/* Audio Player */}
                {selectedRecording.drive_file_id && (
                  <div className="pt-4 border-t space-y-3">
                    <h4 className="text-sm font-medium text-muted-foreground">Recording</h4>
                    <div className="rounded-lg overflow-hidden bg-muted">
                      <iframe
                        src={`https://drive.google.com/file/d/${selectedRecording.drive_file_id}/preview`}
                        width="100%"
                        height="80"
                        allow="autoplay"
                        className="border-0"
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{selectedRecording.drive_file_name}</span>
                      <Button variant="ghost" size="sm" asChild>
                        <a
                          href={selectedRecording.drive_file_url || `https://drive.google.com/file/d/${selectedRecording.drive_file_id}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          Open in Drive
                        </a>
                      </Button>
                    </div>
                  </div>
                )}

                {/* Delete Button - Admin Only */}
                {isAdmin && (
                  <div className="pt-4 border-t">
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => handleDelete(selectedRecording.id)}
                      disabled={deleting === selectedRecording.id}
                    >
                      {deleting === selectedRecording.id ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4 mr-2" />
                      )}
                      Delete Recording
                    </Button>
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      This will remove the recording from the app. The file will remain in Google Drive.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
