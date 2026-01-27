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
import { CalendarDays, User, Loader2, Clock, Phone, Mail, Building2, UserCircle, Filter, Calendar, Package, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ContactActions } from '@/components/leads/contact-actions'
import { formatDistanceToNow } from 'date-fns'
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

type FollowUp = {
  id: string
  lead_id: string
  next_followup: string
  comments: string | null
  product_id: string | null
  product?: { id: string; name: string } | null
  leads: {
    id: string
    name: string
    email: string | null
    phone: string | null
    status: string
    custom_fields: { company?: string } | null
    assigned_to: string | null
    assignee?: { name: string; email: string } | null
  }
}

// Get user's timezone
const getUserTimezone = () => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
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

export default function FollowUpsPage() {
  const params = useParams()
  const router = useRouter()
  const orgSlug = params.orgSlug as string

  const [followUps, setFollowUps] = useState<FollowUp[]>([])
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
    fetchFollowUps()
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

  const handleDeleteFollowUp = async () => {
    if (!deleteId) return

    setIsDeleting(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('lead_activities')
      .delete()
      .eq('id', deleteId)

    if (error) {
      console.error('Error deleting follow-up:', error)
      toast.error('Failed to delete follow-up')
    } else {
      toast.success('Follow-up deleted successfully')
      setFollowUps(prev => prev.filter(f => f.id !== deleteId))
      // Refresh to invalidate cached pages like dashboard
      router.refresh()
    }

    setIsDeleting(false)
    setDeleteId(null)
  }

  const handleLeadStatusChange = async (leadId: string, newStatus: string, followUpId: string) => {
    const supabase = createClient()

    // Update lead status
    const { error } = await supabase
      .from('leads')
      .update({ status: newStatus, updated_at: new Date().toISOString() } as any)
      .eq('id', leadId)

    if (error) {
      console.error('Error updating lead status:', error)
      toast.error('Failed to update lead status')
      return
    }

    // If status is no longer "follow_up_again", clear the follow-up date to remove it from list
    if (newStatus !== 'follow_up_again') {
      // Clear the next_followup date from the activity to remove it from follow-ups list
      await supabase
        .from('lead_activities')
        .update({ next_followup: null } as any)
        .eq('id', followUpId)

      // Remove from local list
      setFollowUps(prev => prev.filter(f => f.id !== followUpId))
      toast.success('Lead status updated and follow-up removed from list')
    } else {
      // Just update local state
      setFollowUps(prev => prev.map(f =>
        f.leads.id === leadId
          ? { ...f, leads: { ...f.leads, status: newStatus } }
          : f
      ))
      toast.success('Lead status updated')
    }

    router.refresh()
  }

  const fetchFollowUps = async () => {
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
          .rpc('get_all_reportees', { manager_user_id: profileData.id } as any)

        const reporteeIds = (reportees as Array<{ reportee_id: string }> | null)?.map((r: { reportee_id: string }) => r.reportee_id) || []
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
      const orgData = org as { id: string }
      // Build leads query
      let leadsQuery = supabase
        .from('leads')
        .select('id')
        .eq('org_id', orgData.id)
        .eq('status', 'follow_up_again')

      // Sales reps (non-managers) only see follow-ups for leads assigned to them
      // Managers and admins see their team's follow-ups
      if (!canViewTeam) {
        leadsQuery = leadsQuery.eq('assigned_to', profileData.id)
      } else if (isManager && !adminRole) {
        // Manager: see leads assigned to self + reportees
        leadsQuery = leadsQuery.in('assigned_to', accessibleUserIds)
      }

      const { data: leadsDataFromQuery } = await leadsQuery

      if (leadsDataFromQuery && leadsDataFromQuery.length > 0) {
        const leadIds = (leadsDataFromQuery as Array<{ id: string }>).map(l => l.id)

        // Get activities with next_followup for these leads
        const { data: activitiesData } = await supabase
          .from('lead_activities')
          .select('id, lead_id, next_followup, comments, product_id')
          .in('lead_id', leadIds)
          .not('next_followup', 'is', null)
          .order('next_followup', { ascending: true })

        if (!activitiesData || activitiesData.length === 0) {
          setFollowUps([])
          return
        }

        const activities = activitiesData as Array<{ id: string; lead_id: string; next_followup: string; comments: string | null; product_id: string | null }>

        // Fetch leads separately
        const { data: leadsData } = await supabase
          .from('leads')
          .select('id, name, email, phone, status, custom_fields, assigned_to')
          .in('id', leadIds)

        const leads = (leadsData || []) as Array<{ id: string; name: string; email: string | null; phone: string | null; status: string; custom_fields: { company?: string } | null; assigned_to: string | null }>

        // Fetch user names for assignees
        const assigneeIds = new Set<string>()
        leads.forEach(lead => {
          if (lead.assigned_to) assigneeIds.add(lead.assigned_to)
        })

        let assigneeMap: Record<string, { name: string; email: string }> = {}
        if (assigneeIds.size > 0) {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, name, email')
            .in('id', Array.from(assigneeIds))

          if (usersData) {
            (usersData as Array<{ id: string; name: string; email: string }>).forEach(user => {
              assigneeMap[user.id] = { name: user.name, email: user.email }
            })
          }
        }

        // Fetch products separately
        const productIds = new Set<string>()
        activities.forEach(activity => {
          if (activity.product_id) productIds.add(activity.product_id)
        })

        let productMap: Record<string, { id: string; name: string }> = {}
        if (productIds.size > 0) {
          const { data: productsData } = await supabase
            .from('products')
            .select('id, name')
            .in('id', Array.from(productIds))

          if (productsData) {
            (productsData as Array<{ id: string; name: string }>).forEach(product => {
              productMap[product.id] = product
            })
          }
        }

        // Build leads map
        const leadsMap: Record<string, any> = {}
        leads.forEach(lead => {
          leadsMap[lead.id] = {
            ...lead,
            assignee: lead.assigned_to ? (assigneeMap[lead.assigned_to] || null) : null
          }
        })

        // Map activities with leads and products
        const followUpsWithAssignee = activities.map(activity => ({
          ...activity,
          product: activity.product_id ? (productMap[activity.product_id] || null) : null,
          leads: leadsMap[activity.lead_id] || null
        }))

        setFollowUps(followUpsWithAssignee as FollowUp[])
      } else {
        setFollowUps([])
      }
    }
    setIsLoading(false)
  }

  // Check if follow-up is upcoming
  const isUpcoming = (date: string) => new Date(date) >= new Date()

  // Filter follow-ups by all criteria
  const filteredFollowUps = useMemo(() => {
    return followUps.filter(f => {
      // Show only upcoming filter
      if (showUpcomingOnly && !isUpcoming(f.next_followup)) return false

      // Sales rep filter (admin only)
      if (isAdmin && selectedSalesRep !== 'all') {
        if (f.leads?.assigned_to !== selectedSalesRep) return false
      }

      // Product filter
      if (selectedProduct !== 'all') {
        if (selectedProduct === 'none') {
          if (f.product_id) return false
        } else {
          if (f.product_id !== selectedProduct) return false
        }
      }

      // Date range filter
      if (dateFrom) {
        const followUpDate = new Date(f.next_followup)
        const fromDate = new Date(dateFrom)
        fromDate.setHours(0, 0, 0, 0)
        if (followUpDate < fromDate) return false
      }
      if (dateTo) {
        const followUpDate = new Date(f.next_followup)
        const toDate = new Date(dateTo)
        toDate.setHours(23, 59, 59, 999)
        if (followUpDate > toDate) return false
      }

      // Search filter: phone or lead name
      if (phoneSearch) {
        const searchText = phoneSearch.trim().toLowerCase()
        const searchDigits = phoneSearch.replace(/[^\d]/g, '')
        const leadPhoneDigits = (f.leads?.phone || '').replace(/[^\d]/g, '')
        const leadName = (f.leads?.name || '').toLowerCase()

        const matchesPhone = searchDigits ? leadPhoneDigits.includes(searchDigits) : false
        const matchesName = searchText ? leadName.includes(searchText) : false

        if (!matchesPhone && !matchesName) return false
      }

      return true
    })
  }, [followUps, isAdmin, selectedSalesRep, selectedProduct, dateFrom, dateTo, showUpcomingOnly, phoneSearch])

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

  const isOverdue = (date: string) => new Date(date) < new Date()
  const isTodayDate = (date: string) => {
    const d = new Date(date)
    const today = new Date()
    return d.toDateString() === today.toDateString()
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title={getMenuLabel(menuNames, 'follow-ups', 'Follow-ups')}
        description="Track leads that need follow-up"
      />

      <div className="flex-1 p-4 lg:p-6">
        <Card>
          <CardHeader className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle>Scheduled Follow-ups</CardTitle>
                <CardDescription>{filteredFollowUps.length} follow-up{filteredFollowUps.length !== 1 ? 's' : ''}</CardDescription>
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
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredFollowUps.length > 0 ? (
              <div className="space-y-3">
                {filteredFollowUps.map((followUp, index) => (
                  <div
                    key={followUp.id}
                    className={`p-4 rounded-lg border bg-card ${isOverdue(followUp.next_followup) ? 'border-red-500/50 bg-red-500/5' :
                      isTodayDate(followUp.next_followup) ? 'border-yellow-500/50 bg-yellow-500/5' : ''
                      }`}
                  >
                    {/* Top row: Serial + Phone (primary) + Time Badge */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        {/* Serial Number */}
                        <span className="w-8 h-8 flex items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium shrink-0">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-primary shrink-0" />
                            <p className="font-semibold truncate text-lg">{followUp.leads?.phone}</p>
                          </div>
                          {followUp.leads?.name && followUp.leads.name !== followUp.leads.phone && (
                            <p className="text-sm text-muted-foreground truncate mt-0.5">
                              {followUp.leads.name}
                            </p>
                          )}
                          {followUp.leads?.custom_fields?.company && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Building2 className="h-3 w-3" />
                              <span className="truncate">{followUp.leads.custom_fields.company}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0 items-center">
                        {isOverdue(followUp.next_followup) ? (
                          <Badge variant="destructive">Overdue</Badge>
                        ) : isTodayDate(followUp.next_followup) ? (
                          <Badge className="bg-yellow-500">Today</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(followUp.next_followup), { addSuffix: true })}
                          </span>
                        )}
                        {followUp.product && (
                          <Badge variant="outline" className="border-purple-500 text-purple-600">
                            <Package className="h-3 w-3 mr-1" />
                            {followUp.product.name}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Email */}
                    {followUp.leads?.email && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">{followUp.leads.email}</span>
                      </div>
                    )}

                    {/* Sales Rep Name - Admin Only */}
                    {isAdmin && followUp.leads?.assignee && (
                      <div className="flex items-center gap-1 text-sm text-primary mb-3">
                        <UserCircle className="h-3 w-3" />
                        <span>Assigned to: {followUp.leads.assignee.name} ({followUp.leads.assignee.email})</span>
                      </div>
                    )}

                    {/* Contact Actions */}
                    <div className="mb-3">
                      <ContactActions
                        phone={followUp.leads?.phone || null}
                        email={followUp.leads?.email || null}
                        name={followUp.leads?.name || ''}
                      />
                    </div>

                    {/* Lead Status */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm text-muted-foreground">Lead Status:</span>
                      {mounted ? (
                        <Select
                          value={followUp.leads?.status || 'new'}
                          onValueChange={(value) => handleLeadStatusChange(followUp.leads.id, value, followUp.id)}
                        >
                          <SelectTrigger className="w-[160px] h-8 text-xs">
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
                        <Badge className={getLeadStatusColor(followUp.leads?.status || 'new')}>
                          {LEAD_STATUS_OPTIONS.find(o => o.value === followUp.leads?.status)?.label || 'New'}
                        </Badge>
                      )}
                    </div>

                    {/* Date/Time */}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span>{formatInTimeZone(new Date(followUp.next_followup), userTimezone, 'MMM d, yyyy')}</span>
                      <span className="font-medium text-foreground">
                        {formatInTimeZone(new Date(followUp.next_followup), userTimezone, 'h:mm a')}
                      </span>
                    </div>

                    {/* Comment and Delete */}
                    <div className="flex items-end justify-between gap-4">
                      {followUp.comments && (
                        <p className="text-sm text-muted-foreground bg-muted/50 rounded px-3 py-2 flex-1">
                          {followUp.comments}
                        </p>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => setDeleteId(followUp.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No follow-ups scheduled</p>
                <p className="text-sm">Mark leads for follow-up to see them here</p>
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
              <AlertDialogTitle>Delete Follow-up</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this follow-up? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteFollowUp}
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
