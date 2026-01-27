'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Zap, User, Loader2, Clock, Video, Phone, Mail, Building2, UserCircle, Filter, Calendar, Package, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ContactActions } from '@/components/leads/contact-actions'
import { formatInTimeZone } from 'date-fns-tz'
import { toast } from 'sonner'
import { getMenuNames, getMenuLabel } from '@/lib/menu-names'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type SalesUser = {
  id: string
  name: string
  email: string
}

type Product = {
  id: string
  name: string
}

type Demo = {
  id: string
  scheduled_at: string
  status: string
  google_meet_link: string | null
  notes: string | null
  product_id: string | null
  product?: { id: string; name: string } | null
  leads: {
    id: string
    name: string
    email: string | null
    phone: string | null
    lead_status: string
    custom_fields: { company?: string } | null
    assigned_to: string | null
    assignee?: { name: string; email: string } | null
  }
}

const demoStatusColors: Record<string, string> = {
  scheduled: 'bg-purple-500',
  completed: 'bg-green-500',
  cancelled: 'bg-red-500',
  rescheduled: 'bg-yellow-500',
}

const LEAD_STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'call_not_picked', label: 'Call Not Picked' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'follow_up_again', label: 'Follow Up Again' },
  { value: 'demo_booked', label: 'Meeting Booked' },
  { value: 'demo_completed', label: 'Meeting Completed' },
  { value: 'deal_won', label: 'Deal Won' },
  { value: 'deal_lost', label: 'Deal Lost' },
]

const getLeadStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    new: 'bg-blue-500',
    call_not_picked: 'bg-yellow-500',
    not_interested: 'bg-gray-500',
    follow_up_again: 'bg-orange-500',
    demo_booked: 'bg-purple-500',
    demo_completed: 'bg-indigo-500',
    deal_won: 'bg-emerald-500',
    deal_lost: 'bg-red-500',
  }
  return colors[status] || 'bg-gray-500'
}

// Get user's timezone
const getUserTimezone = () => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export default function MeetingsPage() {
  const params = useParams()
  const router = useRouter()
  const orgSlug = params.orgSlug as string

  const [meetings, setMeetings] = useState<Demo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userTimezone] = useState(getUserTimezone())
  const [isAdmin, setIsAdmin] = useState(false)
  const [salesTeam, setSalesTeam] = useState<SalesUser[]>([])
  const [selectedSalesRep, setSelectedSalesRep] = useState<string>('all')
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [showUpcomingOnly, setShowUpcomingOnly] = useState<boolean>(true)
  const [showFilters, setShowFilters] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [phoneSearch, setPhoneSearch] = useState<string>('')
  const [menuNames, setMenuNames] = useState<Record<string, string>>({})

  useEffect(() => {
    setMounted(true)
    fetchMeetings()
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

  const handleDeleteMeeting = async () => {
    if (!deleteId) return

    setIsDeleting(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('demos')
      .delete()
      .eq('id', deleteId)

    if (error) {
      console.error('Error deleting meeting:', error)
      toast.error('Failed to delete meeting')
    } else {
      toast.success('Meeting deleted successfully')
      setMeetings(prev => prev.filter(m => m.id !== deleteId))
      // Refresh to invalidate cached pages like dashboard
      router.refresh()
    }

    setIsDeleting(false)
    setDeleteId(null)
  }

  const handleLeadStatusChange = async (leadId: string, newStatus: string, meetingId: string) => {
    const supabase = createClient()

    // Update lead status
    const { error } = await supabase
      .from('leads')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', leadId)

    if (error) {
      console.error('Error updating lead status:', error)
      toast.error('Failed to update lead status')
      return
    }

    // If status is no longer "demo_booked" (Meeting Booked), update the meeting status
    if (newStatus !== 'demo_booked') {
      // Mark meeting as completed or cancelled based on new status
      const meetingStatus = newStatus === 'demo_completed' ? 'completed' :
        newStatus === 'deal_won' ? 'completed' :
          newStatus === 'deal_lost' ? 'cancelled' : 'completed'

      await supabase
        .from('demos')
        .update({ status: meetingStatus })
        .eq('id', meetingId)

      // Remove from local list since it's no longer a scheduled meeting
      setMeetings(prev => prev.filter(m => m.id !== meetingId))
      toast.success('Lead status updated and meeting removed from scheduled list')
    } else {
      // Just update local state
      setMeetings(prev => prev.map(m =>
        m.leads.id === leadId
          ? { ...m, leads: { ...m.leads, lead_status: newStatus } }
          : m
      ))
      toast.success('Lead status updated')
    }

    router.refresh()
  }

  const fetchMeetings = async () => {
    const supabase = createClient()

    // Get current user profile
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return

    const { data: profile } = await supabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', authUser.id)
      .single()

    if (!profile) return

    const profileData = profile as { id: string; role: string; org_id: string }
    const adminRole = profileData.role === 'admin' || profileData.role === 'super_admin'

    // Check if user is a manager (sales with reportees)
    let isManager = false
    let accessibleUserIds: string[] = [profileData.id]

    if (profileData.role === 'sales') {
      try {
        const { data: reportees } = await supabase
          .rpc('get_all_reportees', { manager_user_id: profileData.id })

        const reporteeIds = reportees?.map((r: { reportee_id: string }) => r.reportee_id) || []
        if (reporteeIds.length > 0) {
          isManager = true
          accessibleUserIds = [profileData.id, ...reporteeIds]
        }
      } catch (error) {
        console.error('Error fetching reportees:', error)
      }
    }

    const canViewTeam = adminRole || isManager
    setIsAdmin(canViewTeam)

    // Fetch sales team for admin/manager filter
    if (canViewTeam && profileData.org_id) {
      let teamQuery = supabase
        .from('users')
        .select('id, name, email')
        .eq('org_id', profileData.org_id)
        .eq('role', 'sales')
        .eq('is_approved', true)
        .eq('is_active', true)

      // Managers see only their reportees + self
      if (isManager && !adminRole) {
        teamQuery = teamQuery.in('id', accessibleUserIds)
      }

      const { data: teamData } = await teamQuery
      setSalesTeam(teamData || [])
    }

    // Fetch products
    if (profileData.org_id) {
      const { data: productsData } = await supabase
        .from('products')
        .select('id, name')
        .eq('org_id', profileData.org_id)
        .eq('is_active', true)
        .order('name')
      setProducts(productsData || [])
    }

    // Get org ID from slug
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', orgSlug)
      .single()

    if (org) {
      // Build leads query
      let leadsQuery = supabase
        .from('leads')
        .select('id')
        .eq('org_id', org.id)

      // Sales reps (non-managers) only see meetings for leads assigned to them
      // Managers and admins see their team's meetings
      if (!canViewTeam) {
        leadsQuery = leadsQuery.eq('assigned_to', profileData.id)
      } else if (isManager && !adminRole) {
        // Manager: see leads assigned to self + reportees
        leadsQuery = leadsQuery.in('assigned_to', accessibleUserIds)
      }

      const { data: leads } = await leadsQuery

      if (leads && leads.length > 0) {
        const leadIds = leads.map(l => l.id)

        // Get only scheduled demos for these leads
        const { data: demosData } = await supabase
          .from('demos')
          .select('id, lead_id, scheduled_at, status, google_meet_link, notes')
          .in('lead_id', leadIds)
          .eq('status', 'scheduled')
          .order('scheduled_at', { ascending: true })

        if (!demosData || demosData.length === 0) {
          setMeetings([])
          return
        }

        // Fetch leads separately
        const { data: leadsData } = await supabase
          .from('leads')
          .select('id, name, email, phone, status, custom_fields, assigned_to')
          .in('id', leadIds)

        // Fetch user names for assignees
        const assigneeIds = new Set<string>()
        leadsData?.forEach(lead => {
          if (lead.assigned_to) assigneeIds.add(lead.assigned_to)
        })

        let assigneeMap: Record<string, { name: string; email: string }> = {}
        if (assigneeIds.size > 0) {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, name, email')
            .in('id', Array.from(assigneeIds))

          if (usersData) {
            usersData.forEach(user => {
              assigneeMap[user.id] = { name: user.name, email: user.email }
            })
          }
        }

        // Build leads map
        const leadsMap: Record<string, any> = {}
        leadsData?.forEach(lead => {
          leadsMap[lead.id] = {
            ...lead,
            lead_status: lead.status,
            assignee: lead.assigned_to ? (assigneeMap[lead.assigned_to] || null) : null
          }
        })

        // Map demos with leads
        const meetingsWithStatus = demosData.map(meeting => ({
          ...meeting,
          product_id: null,
          product: null,
          leads: leadsMap[meeting.lead_id] || null
        }))

        setMeetings(meetingsWithStatus as Demo[])
      } else {
        setMeetings([])
      }
    }
    setIsLoading(false)
  }

  // Helper functions - defined before useMemo
  const isUpcoming = (date: string) => new Date(date) > new Date()
  const isToday = (date: string) => {
    const d = new Date(date)
    const today = new Date()
    return d.toDateString() === today.toDateString()
  }

  // Filter meetings by all criteria
  const filteredMeetings = useMemo(() => {
    return meetings.filter(m => {
      // Show only upcoming filter
      if (showUpcomingOnly && !isUpcoming(m.scheduled_at)) return false

      // Sales rep filter (admin only)
      if (isAdmin && selectedSalesRep !== 'all') {
        if (m.leads?.assigned_to !== selectedSalesRep) return false
      }

      // Product filter
      if (selectedProduct !== 'all') {
        if (selectedProduct === 'none') {
          if (m.product_id) return false
        } else {
          if (m.product_id !== selectedProduct) return false
        }
      }

      // Date range filter
      if (dateFrom) {
        const meetingDate = new Date(m.scheduled_at)
        const fromDate = new Date(dateFrom)
        fromDate.setHours(0, 0, 0, 0)
        if (meetingDate < fromDate) return false
      }
      if (dateTo) {
        const meetingDate = new Date(m.scheduled_at)
        const toDate = new Date(dateTo)
        toDate.setHours(23, 59, 59, 999)
        if (meetingDate > toDate) return false
      }

      // Search filter: phone or lead name
      if (phoneSearch) {
        const searchText = phoneSearch.trim().toLowerCase()
        const searchDigits = phoneSearch.replace(/[^\d]/g, '')
        const leadPhoneDigits = (m.leads?.phone || '').replace(/[^\d]/g, '')
        const leadName = (m.leads?.name || '').toLowerCase()

        const matchesPhone = searchDigits ? leadPhoneDigits.includes(searchDigits) : false
        const matchesName = searchText ? leadName.includes(searchText) : false

        if (!matchesPhone && !matchesName) return false
      }

      return true
    })
  }, [meetings, isAdmin, selectedSalesRep, selectedProduct, dateFrom, dateTo, showUpcomingOnly, phoneSearch])

  // Check if any filter is active
  const hasActiveFilters = selectedSalesRep !== 'all' || selectedProduct !== 'all' ||
    dateFrom || dateTo || !showUpcomingOnly || phoneSearch

  // Clear all filters
  const clearAllFilters = () => {
    setSelectedSalesRep('all')
    setSelectedProduct('all')
    setDateFrom('')
    setDateTo('')
    setShowUpcomingOnly(true)
    setPhoneSearch('')
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title={getMenuLabel(menuNames, 'meetings', 'Meetings')}
        description="Manage scheduled meetings"
      />

      <div className="flex-1 p-3 sm:p-4 lg:p-6 pb-20 lg:pb-6">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:gap-4 p-3 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div>
                <CardTitle className="text-sm sm:text-base">Scheduled Meetings</CardTitle>
                <CardDescription className="text-xs sm:text-sm">{filteredMeetings.length} meeting{filteredMeetings.length !== 1 ? 's' : ''}</CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                {mounted && (
                  <>
                    {/* Sales Rep Filter - Admin Only */}
                    {isAdmin && salesTeam.length > 0 && (
                      <Select value={selectedSalesRep} onValueChange={setSelectedSalesRep}>
                        <SelectTrigger className="w-full sm:w-[150px] h-8 sm:h-9 text-xs sm:text-sm">
                          <SelectValue placeholder="Sales Rep" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Reps</SelectItem>
                          {salesTeam.map((rep) => (
                            <SelectItem key={rep.id} value={rep.id}>{rep.name} ({rep.email})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Product Filter */}
                    {products.length > 0 && (
                      <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                        <SelectTrigger className="w-full sm:w-[150px] h-8 sm:h-9 text-xs sm:text-sm">
                          <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                          <SelectValue placeholder="Product" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Products</SelectItem>
                          <SelectItem value="none">No Product</SelectItem>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </>
                )}

                {/* Phone Search */}
                <div className="relative w-full sm:w-[160px]">
                  <Phone className="absolute left-2 top-2 sm:left-2.5 sm:top-2.5 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search by phone..."
                    value={phoneSearch}
                    onChange={(e) => setPhoneSearch(e.target.value)}
                    className="w-full sm:w-[160px] pl-8 pr-2 h-8 sm:h-9 text-xs sm:text-sm"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className={`h-8 sm:h-9 text-xs sm:text-sm ${showFilters ? 'bg-primary/10' : ''}`}
                  >
                    <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                    More
                  </Button>

                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAllFilters}
                      className="h-8 sm:h-9 text-xs sm:text-sm"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Extended Filters */}
            {showFilters && (
              <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-4 p-2 sm:p-3 bg-muted/50 rounded-lg">
                {/* Show Upcoming Only */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="upcoming-only"
                    checked={showUpcomingOnly}
                    onCheckedChange={(checked) => setShowUpcomingOnly(checked === true)}
                  />
                  <Label htmlFor="upcoming-only" className="text-xs sm:text-sm cursor-pointer">
                    Upcoming only
                  </Label>
                </div>

                {/* Date Range Filter */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="flex-1 sm:w-[140px] h-8 sm:h-9 text-xs sm:text-sm"
                      placeholder="From"
                    />
                  </div>
                  <span className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">to</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="flex-1 sm:w-[140px] h-8 sm:h-9 text-xs sm:text-sm"
                    placeholder="To"
                  />
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-3 sm:p-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredMeetings.length > 0 ? (
              <div className="space-y-2 sm:space-y-3">
                {filteredMeetings.map((meeting, index) => (
                  <div
                    key={meeting.id}
                    className={`p-3 sm:p-4 rounded-lg border bg-card ${isToday(meeting.scheduled_at) && meeting.status === 'scheduled'
                        ? 'border-purple-500/50 bg-purple-500/5' : ''
                      }`}
                  >
                    {/* Top row: Serial + Phone (primary) + Meeting Status */}
                    <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
                      <div className="flex items-start gap-2 sm:gap-3 min-w-0 flex-1">
                        {/* Serial Number */}
                        <span className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs sm:text-sm font-medium shrink-0">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />
                            <p className="font-semibold text-base sm:text-lg break-all">{meeting.leads?.phone}</p>
                          </div>
                          {meeting.leads?.name && meeting.leads.name !== meeting.leads.phone && (
                            <p className="text-xs sm:text-sm text-muted-foreground break-words mt-0.5">
                              {meeting.leads.name}
                            </p>
                          )}
                          {meeting.leads?.custom_fields?.company && (
                            <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
                              <Building2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
                              <span className="break-words">{meeting.leads.custom_fields.company}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5 sm:gap-2 shrink-0">
                        <Badge className={`${demoStatusColors[meeting.status] || 'bg-gray-500'} text-xs`}>
                          {meeting.status}
                        </Badge>
                        {meeting.product && (
                          <Badge variant="outline" className="border-purple-500 text-purple-600 text-xs">
                            <Package className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                            {meeting.product.name}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Email */}
                    {meeting.leads?.email && (
                      <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground mb-2">
                        <Mail className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        <span className="truncate break-all">{meeting.leads.email}</span>
                      </div>
                    )}

                    {/* Sales Rep Name - Admin Only */}
                    {isAdmin && meeting.leads?.assignee && (
                      <div className="flex items-center gap-1 text-xs sm:text-sm text-primary mb-2 sm:mb-3">
                        <UserCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        <span className="break-words">Assigned to: {meeting.leads.assignee.name} ({meeting.leads.assignee.email})</span>
                      </div>
                    )}

                    {/* Contact Actions */}
                    <div className="mb-2 sm:mb-3">
                      <ContactActions
                        phone={meeting.leads?.phone || null}
                        email={meeting.leads?.email || null}
                        name={meeting.leads?.name || ''}
                      />
                    </div>

                    {/* Lead Status */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2 sm:mb-3">
                      <span className="text-xs sm:text-sm text-muted-foreground">Lead Status:</span>
                      {mounted ? (
                        <Select
                          value={meeting.leads?.lead_status || 'new'}
                          onValueChange={(value) => handleLeadStatusChange(meeting.leads.id, value, meeting.id)}
                        >
                          <SelectTrigger className="w-full sm:w-[160px] h-8 sm:h-9 text-xs sm:text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LEAD_STATUS_OPTIONS.map(option => (
                              <SelectItem key={option.value} value={option.value}>
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${getLeadStatusColor(option.value)}`} />
                                  {option.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge className={getLeadStatusColor(meeting.leads?.lead_status || 'new')}>
                          {LEAD_STATUS_OPTIONS.find(o => o.value === meeting.leads?.lead_status)?.label || 'New'}
                        </Badge>
                      )}
                    </div>

                    {/* Date/Time */}
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3">
                      <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                      <span>{formatInTimeZone(new Date(meeting.scheduled_at), userTimezone, 'MMM d, yyyy')}</span>
                      <span className="font-medium text-foreground">
                        {formatInTimeZone(new Date(meeting.scheduled_at), userTimezone, 'h:mm a')}
                      </span>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      {meeting.google_meet_link && (
                        <a
                          href={meeting.google_meet_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-xs sm:text-sm font-medium rounded-lg hover:bg-primary/90"
                        >
                          <Video className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          Join Google Meet
                        </a>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 sm:h-9 text-xs sm:text-sm"
                        onClick={() => setDeleteId(meeting.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 sm:py-12 text-muted-foreground">
                <Zap className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-4 opacity-50" />
                <p className="text-sm sm:text-lg font-medium">No meetings scheduled</p>
                <p className="text-xs sm:text-sm">Book a meeting from a lead to see it here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      {mounted && (
        <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Meeting</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this meeting? This action cannot be undone.
                The Google Calendar event will remain (you&apos;ll need to delete it manually from your calendar).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteMeeting}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
