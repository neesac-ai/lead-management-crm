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
  leads: {
    id: string
    name: string
    email: string | null
    phone: string | null
    status: string
    custom_fields: { company?: string } | null
    assigned_to: string | null
    assignee?: { name: string } | null
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

  useEffect(() => {
    setMounted(true)
    fetchFollowUps()
  }, [orgSlug])

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
      .update({ status: newStatus, updated_at: new Date().toISOString() })
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
        .update({ next_followup: null })
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
    
    const adminRole = profile.role === 'admin' || profile.role === 'super_admin'
    setIsAdmin(adminRole)
    
    // Fetch sales team for admin filter
    if (adminRole && profile.org_id) {
      const { data: teamData } = await supabase
        .from('users')
        .select('id, name')
        .eq('org_id', profile.org_id)
        .eq('role', 'sales')
        .eq('is_approved', true)
        .eq('is_active', true)
      setSalesTeam(teamData || [])
    }

    // Fetch products
    if (profile.org_id) {
      const { data: productsData } = await supabase
        .from('products')
        .select('id, name')
        .eq('org_id', profile.org_id)
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
      // Build leads query - sales reps only see their assigned leads
      let leadsQuery = supabase
        .from('leads')
        .select('id')
        .eq('org_id', org.id)
        .eq('status', 'follow_up_again')
      
      // Sales reps only see follow-ups for leads assigned to them
      if (!adminRole) {
        leadsQuery = leadsQuery.eq('assigned_to', profile.id)
      }

      const { data: leads } = await leadsQuery

      if (leads && leads.length > 0) {
        const leadIds = leads.map(l => l.id)
        
        // Get activities with next_followup for these leads
        const { data } = await supabase
          .from('lead_activities')
          .select(`
            id, lead_id, next_followup, comments, 
            leads(id, name, email, phone, status, custom_fields, assigned_to, assignee:users!leads_assigned_to_fkey(name))
          `)
          .in('lead_id', leadIds)
          .not('next_followup', 'is', null)
          .order('next_followup', { ascending: true })

        // Map with assignee info
        const followUpsWithAssignee = (data || []).map(f => ({
          ...f,
          leads: f.leads ? {
            ...f.leads,
            assignee: (f.leads as unknown as { assignee: { name: string } | null }).assignee
          } : null
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
      
      return true
    })
  }, [followUps, isAdmin, selectedSalesRep, dateFrom, dateTo, showUpcomingOnly])

  // Check if any filter is active
  const hasActiveFilters = selectedSalesRep !== 'all' || selectedProduct !== 'all' || 
    dateFrom || dateTo || !showUpcomingOnly

  // Clear all filters
  const clearAllFilters = () => {
    setSelectedSalesRep('all')
    setSelectedProduct('all')
    setDateFrom('')
    setDateTo('')
    setShowUpcomingOnly(true)
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
        title="Follow-ups" 
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
              <div className="flex items-center gap-2">
                {/* Sales Rep Filter - Admin Only */}
                {isAdmin && salesTeam.length > 0 && (
                  <Select value={selectedSalesRep} onValueChange={setSelectedSalesRep}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Sales Rep" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Reps</SelectItem>
                      {salesTeam.map((rep) => (
                        <SelectItem key={rep.id} value={rep.id}>{rep.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Product Filter */}
                {products.length > 0 && (
                  <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                    <SelectTrigger className="w-[140px]">
                      <Package className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Product" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Products</SelectItem>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                  className={showFilters ? 'bg-primary/10' : ''}
                >
                  <Filter className="h-4 w-4 mr-1" />
                  More
                </Button>

                {hasActiveFilters && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={clearAllFilters}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Extended Filters */}
            {showFilters && (
              <div className="flex flex-wrap items-center gap-4 p-3 bg-muted/50 rounded-lg">
                {/* Show Upcoming Only */}
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="upcoming-only"
                    checked={showUpcomingOnly} 
                    onCheckedChange={(checked) => setShowUpcomingOnly(checked === true)}
                  />
                  <Label htmlFor="upcoming-only" className="text-sm cursor-pointer">
                    Upcoming only
                  </Label>
                </div>

                {/* Date Range Filter */}
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-[140px] h-9"
                    placeholder="From"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-[140px] h-9"
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
                {filteredFollowUps.map((followUp) => (
                  <div 
                    key={followUp.id} 
                    className={`p-4 rounded-lg border bg-card ${
                      isOverdue(followUp.next_followup) ? 'border-red-500/50 bg-red-500/5' : 
                      isTodayDate(followUp.next_followup) ? 'border-yellow-500/50 bg-yellow-500/5' : ''
                    }`}
                  >
                    {/* Top row: Phone (primary) + Time Badge */}
                    <div className="flex items-start justify-between gap-2 mb-3">
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
                      {isOverdue(followUp.next_followup) ? (
                        <Badge variant="destructive" className="shrink-0">Overdue</Badge>
                      ) : isTodayDate(followUp.next_followup) ? (
                        <Badge className="bg-yellow-500 shrink-0">Today</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(followUp.next_followup), { addSuffix: true })}
                        </span>
                      )}
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
                        <span>Assigned to: {followUp.leads.assignee.name}</span>
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
    </div>
  )
}
