'use client'

import { use, useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Calendar, Loader2, Phone, RefreshCw, Search, User as UserIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { endOfDay, startOfDay, subDays } from 'date-fns'
import { getMenuNames, getMenuLabel } from '@/lib/menu-names'

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

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
  leads?: { id: string; name: string; phone: string } | null
}

type UserProfile = { id: string; role: string }

export default function CallTrackingPage({ params }: PageProps) {
  const { orgSlug } = use(params)
  const [dateFilter, setDateFilter] = useState<'today' | 'last_7_days' | 'last_30_days' | 'all_time'>('last_7_days')
  const [searchQuery, setSearchQuery] = useState('')
  const [callLogs, setCallLogs] = useState<CallLog[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [menuNames, setMenuNames] = useState<Record<string, string>>({})

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

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
      if (profile) setUser(profile as any)
    }
    void loadUser()
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
      }

      if (startDate) params.append('start_date', startDate.toISOString())
      if (endDate) params.append('end_date', endDate.toISOString())

      const res = await fetch(`/api/calls/analytics?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch call logs')
      const data = await res.json()
      const logs = (data.call_logs || []) as CallLog[]

      // Sales role: filter to own calls (reuse logic similar to analytics page).
      if (user?.role === 'sales') {
        const supabase = createClient()
        let filtered = logs.filter(l => l.user_id === user.id)
        try {
          const { data: reportees } = await supabase
            .rpc('get_all_reportees', { manager_user_id: user.id } as any)
          const reporteeIds = (reportees as Array<{ reportee_id: string }> | null)?.map(r => r.reportee_id) || []
          if (reporteeIds.length > 0) {
            filtered = logs.filter(l => l.user_id === user.id || reporteeIds.includes(l.user_id))
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
  }, [dateFilter, user?.id])

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
        description="All tracked inbound and outbound calls"
      />

      <div className="flex-1 p-4 lg:p-6 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-primary" />
                <CardTitle>Tracked Calls</CardTitle>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <div className="w-full sm:w-44">
                  <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="last_7_days">Last 7 days</SelectItem>
                      <SelectItem value="last_30_days">Last 30 days</SelectItem>
                      <SelectItem value="all_time">All time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" onClick={() => fetchLogs()} disabled={refreshing} className="h-9">
                  <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search phone / lead / sales rep…"
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
                <div className="space-y-3">
                  {filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-4 p-4 rounded-lg border hover:bg-muted/50"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Phone className="w-5 h-5 text-primary" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{log.phone_number}</span>
                          <Badge variant="outline" className={`text-xs ${getStatusColor(log.call_status)}`}>
                            {log.call_status}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {log.call_direction}
                          </Badge>
                          {log.lead_id ? (
                            <Badge variant="outline" className="text-xs">
                              Lead: {log.leads?.name || 'Linked'}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              Unlinked
                            </Badge>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>{new Date(log.call_started_at).toLocaleString()}</span>
                          <span className="mx-1">•</span>
                          <span>Duration: {formatDuration(log.duration_seconds || 0)}</span>
                          {(log.talk_time_seconds || 0) > 0 ? (
                            <>
                              <span className="mx-1">•</span>
                              <span>Talk: {formatDuration(log.talk_time_seconds || 0)}</span>
                            </>
                          ) : null}
                          {isAdmin && log.users ? (
                            <>
                              <span className="mx-1">•</span>
                              <UserIcon className="w-3 h-3" />
                              <span className="text-primary">{log.users.name}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

