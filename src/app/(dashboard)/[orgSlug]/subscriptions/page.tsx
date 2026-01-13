'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CreditCard,
  Loader2,
  Calendar,
  Clock,
  Pause,
  Play,
  User,
  Phone,
  Mail,
  Building2,
  UserCircle,
  Filter,
  Package,
  DollarSign,
  CheckCircle2,
  XCircle
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ContactActions } from '@/components/leads/contact-actions'
import { toast } from 'sonner'
import { differenceInDays, format, parseISO } from 'date-fns'

type SalesUser = {
  id: string
  name: string
  email: string
}

type Product = {
  id: string
  name: string
}

type Subscription = {
  id: string
  lead_id: string
  start_date: string
  end_date: string
  validity_days: number
  status: string
  deal_value: number
  amount_credited: number
  amount_pending: number
  notes: string | null
  product_id: string | null
  product?: { id: string; name: string } | null
  approval_status?: 'pending' | 'approved' | 'rejected' | null
  created_at: string
  leads: {
    id: string
    name: string
    email: string | null
    phone: string | null
    custom_fields: { company?: string } | null
    assigned_to: string | null
    created_by: string | null
    assignee?: { name: string; email: string } | null
  } | null
}

type UserProfile = {
  id: string
  role: string
  org_id: string | null
}

export default function SubscriptionsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  const supabase = createClient()

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [salesTeam, setSalesTeam] = useState<SalesUser[]>([])
  const [selectedSalesRep, setSelectedSalesRep] = useState<string>('all')
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string>('all')
  const [dealValueOperator, setDealValueOperator] = useState<string>('all')
  const [dealValueAmount, setDealValueAmount] = useState<string>('')
  const [paymentFilter, setPaymentFilter] = useState<string>('all')
  const [daysLeftOperator, setDaysLeftOperator] = useState<string>('all')
  const [daysLeftValue, setDaysLeftValue] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)
  const [phoneSearch, setPhoneSearch] = useState<string>('')
  const [approvalFilter, setApprovalFilter] = useState<'approved' | 'all' | 'pending'>('approved') // Default to approved only
  const [isManager, setIsManager] = useState(false)
  const [canViewTeam, setCanViewTeam] = useState(false)
  const [accessibleUserIds, setAccessibleUserIds] = useState<string[]>([])

  // Hydration fix - only render Radix UI components after mount
  const [mounted, setMounted] = useState(false)

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin'

  useEffect(() => {
    setMounted(true)
    fetchData()
  }, [orgSlug])

  async function fetchData() {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('users')
        .select('id, role, org_id')
        .eq('auth_id', user.id)
        .single()

      if (!profile) return
      setUserProfile(profile)

      // Calculate isAdmin from profile data (not from state which might be stale)
      const currentIsAdmin = profile.role === 'admin' || profile.role === 'super_admin'

      // Get organization
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single()

      if (!orgData) return

      // Check if user is a manager (sales with reportees)
      let managerStatus = false
      let userIds: string[] = [profile.id]

      if (profile.role === 'sales') {
        try {
          const { data: reportees } = await supabase
            .rpc('get_all_reportees', { manager_user_id: profile.id })

          const reporteeIds = reportees?.map((r: { reportee_id: string }) => r.reportee_id) || []
          if (reporteeIds.length > 0) {
            managerStatus = true
            userIds = [profile.id, ...reporteeIds]
          }
        } catch (error) {
          console.error('Error fetching reportees:', error)
        }
      }

      setIsManager(managerStatus)
      setCanViewTeam(currentIsAdmin || managerStatus)
      setAccessibleUserIds(userIds)

      // Fetch sales team for admin/manager filter
      if ((currentIsAdmin || managerStatus) && profile.org_id) {
        let teamQuery = supabase
          .from('users')
          .select('id, name, email')
          .eq('org_id', profile.org_id)
          .eq('role', 'sales')
          .eq('is_approved', true)
          .eq('is_active', true)

        // Managers see only their reportees + self
        if (managerStatus && !currentIsAdmin) {
          teamQuery = teamQuery.in('id', userIds)
        }

        const { data: teamData } = await teamQuery
        setSalesTeam(teamData || [])
      }

      // Fetch products
      const { data: productsData } = await supabase
        .from('products')
        .select('id, name')
        .eq('org_id', orgData.id)
        .eq('is_active', true)
        .order('name')
      setProducts(productsData || [])

      // Fetch subscriptions with lead info and assignee name
      // Note: product_id will only work after running migration 020
      const { data: subsData, error } = await supabase
        .from('customer_subscriptions')
        .select(`
          *,
          leads (
            id,
            name,
            email,
            phone,
            custom_fields,
            assigned_to,
            created_by,
            assignee:users!leads_assigned_to_fkey(name, email)
          )
        `)
        .eq('org_id', orgData.id)
        .order('created_at', { ascending: false })

      // Fetch pending approvals and merge with subscriptions
      let pendingApprovalsData: any[] = []
      try {
        const { data: pendingData, error: pendingError } = await supabase
          .from('subscription_approvals')
          .select('*')
          .eq('org_id', orgData.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })

        if (pendingError) {
          // If table doesn't exist (code 42P01 or PGRST116), just continue without pending approvals
          if (pendingError.code !== '42P01' && pendingError.code !== 'PGRST116' && !pendingError.message?.includes('does not exist')) {
            console.error('Error fetching pending approvals:', pendingError)
          }
        } else {
          pendingApprovalsData = pendingData || []
        }
      } catch (err: any) {
        // Catch any unexpected errors (like table not existing)
        console.warn('Could not fetch pending approvals (table may not exist):', err?.message || err)
        pendingApprovalsData = []
      }

      if (error) {
        console.error('Error fetching subscriptions:', error)
        setSubscriptions([])
      } else {
        // Fetch leads separately for pending approvals
        let pendingLeadsMap: Record<string, any> = {}
        if (pendingApprovalsData && pendingApprovalsData.length > 0) {
          const pendingLeadIds = pendingApprovalsData.map(a => a.lead_id).filter(Boolean) as string[]
          if (pendingLeadIds.length > 0) {
            const { data: pendingLeadsData } = await supabase
              .from('leads')
              .select(`
                id,
                name,
                email,
                phone,
                custom_fields,
                assigned_to,
                created_by,
                assignee:users!leads_assigned_to_fkey(name, email)
              `)
              .in('id', pendingLeadIds)

            if (pendingLeadsData) {
              pendingLeadsData.forEach(lead => {
                pendingLeadsMap[lead.id] = lead
              })
            }
          }
        }

        // Get all lead IDs (from both approved subscriptions and pending approvals)
        const allLeadIds = [
          ...(subsData || []).map(s => s.leads?.id || s.lead_id).filter(Boolean),
          ...pendingApprovalsData.map(a => a.lead_id).filter(Boolean)
        ] as string[]

        // Fetch the most recent product_id for each lead from lead_activities
        let leadProductMap: Record<string, { product_id: string; product_name: string }> = {}
        if (allLeadIds.length > 0) {
          const { data: activitiesWithProducts } = await supabase
            .from('lead_activities')
            .select('lead_id, product_id, products(id, name)')
            .in('lead_id', allLeadIds)
            .not('product_id', 'is', null)
            .order('created_at', { ascending: false })

          // Build map of lead_id -> most recent product
          if (activitiesWithProducts) {
            for (const activity of activitiesWithProducts) {
              if (activity.product_id && !leadProductMap[activity.lead_id]) {
                const productData = (activity as any).products as { id: string; name: string } | null
                if (productData) {
                  leadProductMap[activity.lead_id] = {
                    product_id: activity.product_id,
                    product_name: productData.name
                  }
                }
              }
            }
          }
        }

        // Map approved subscriptions - all existing subscriptions are approved
        let approvedSubs = (subsData || []).map(sub => {
          const leadId = sub.leads?.id || sub.lead_id
          const productInfo = leadId ? leadProductMap[leadId] : null
          return {
            ...sub,
            approval_status: 'approved' as const, // All existing subscriptions are approved
            product_id: productInfo?.product_id || null,
            product: productInfo ? { id: productInfo.product_id, name: productInfo.product_name } : null,
            leads: sub.leads ? {
              ...sub.leads,
              assignee: (sub.leads as unknown as { assignee: { name: string; email: string } | null }).assignee
            } : null
          }
        }) as Subscription[]

        // Map pending approvals as subscriptions
        let pendingSubs: Subscription[] = []
        if (pendingApprovalsData && pendingApprovalsData.length > 0) {
          pendingSubs = pendingApprovalsData.map(approval => {
            const productInfo = approval.lead_id ? leadProductMap[approval.lead_id] : null
            const leadData = approval.lead_id ? pendingLeadsMap[approval.lead_id] : null
            return {
              id: approval.id, // Use approval ID as subscription ID for pending
              org_id: approval.org_id,
              lead_id: approval.lead_id,
              start_date: approval.start_date,
              end_date: approval.end_date,
              validity_days: approval.validity_days,
              status: 'pending' as string, // Status is pending
              deal_value: approval.deal_value,
              amount_credited: approval.amount_credited,
              amount_pending: approval.deal_value - approval.amount_credited,
              notes: approval.notes,
              created_at: approval.created_at,
              approval_status: 'pending' as const,
              product_id: productInfo?.product_id || null,
              product: productInfo ? { id: productInfo.product_id, name: productInfo.product_name } : null,
              leads: leadData ? {
                ...leadData,
                assignee: (leadData as unknown as { assignee: { name: string; email: string } | null }).assignee
              } : null
            }
          }) as Subscription[]
        }

        // Combine approved and pending
        let allSubs = [...approvedSubs, ...pendingSubs]

        // Filter client-side for sales reps
        // Non-manager sales: only their assigned/created leads
        // Managers: their assigned/created leads + reportees' leads
        if (profile.role === 'sales') {
          if (managerStatus) {
            // Manager: show subscriptions for self + reportees
            allSubs = allSubs.filter(sub => {
              const leadAssignedTo = sub.leads?.assigned_to
              const leadCreatedBy = sub.leads?.created_by
              return userIds.includes(leadAssignedTo || '') ||
                leadCreatedBy === profile.id ||
                leadAssignedTo === profile.id
            })
          } else {
            // Non-manager: only their assigned/created leads
            allSubs = allSubs.filter(sub =>
              sub.leads?.assigned_to === profile.id || sub.leads?.created_by === profile.id
            )
          }
        }
        setSubscriptions(allSubs)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Calculate subscription status based on dates
  function getSubscriptionStatus(sub: Subscription): { status: string; color: string; label: string } {
    // If this is a pending approval, show it differently
    if (sub.approval_status === 'pending') {
      return { status: 'pending_approval', color: 'bg-yellow-500', label: 'Pending Approval' }
    }

    if (sub.status === 'paused') {
      return { status: 'paused', color: 'bg-yellow-500', label: 'Paused' }
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const endDate = parseISO(sub.end_date)
    endDate.setHours(0, 0, 0, 0)

    // Check if non-recurring (validity_days >= 36500)
    if (sub.validity_days >= 36500) {
      return { status: 'non_recurring', color: 'bg-gray-500', label: 'Non Recurring' }
    }

    if (endDate >= today) {
      return { status: 'active', color: 'bg-green-500', label: 'Active' }
    } else {
      return { status: 'inactive', color: 'bg-red-500', label: 'Expired' }
    }
  }

  // Calculate days remaining
  function getDaysRemaining(sub: Subscription): { days: number; color: string } {
    // Non-recurring subscription
    if (sub.validity_days >= 36500) {
      return { days: -1, color: 'text-gray-600' } // -1 means non-recurring
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const endDate = parseISO(sub.end_date)
    endDate.setHours(0, 0, 0, 0)

    const days = differenceInDays(endDate, today)

    if (days < 0) return { days: 0, color: 'text-red-600' }
    if (days === 0) return { days: 0, color: 'text-red-600' }
    if (days <= 7) return { days, color: 'text-orange-600' }
    return { days, color: 'text-green-600' }
  }

  // Toggle pause/resume subscription
  async function togglePause(subId: string, currentStatus: string) {
    const newStatus = currentStatus === 'paused' ? 'active' : 'paused'

    const { error } = await supabase
      .from('customer_subscriptions')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', subId)

    if (error) {
      toast.error('Failed to update subscription')
    } else {
      toast.success(`Subscription ${newStatus === 'paused' ? 'paused' : 'resumed'}`)
      fetchData()
    }
  }

  // Filter subscriptions by all criteria
  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter(sub => {
      // Approval status filter (approved / all / pending)
      if (approvalFilter === 'approved') {
        // Exclude pending approvals, but include approved and undefined (old subscriptions without approval_status)
        if (sub.approval_status === 'pending') {
          return false
        }
        // Include if approved or undefined (undefined means it's an old subscription, considered approved)
      } else if (approvalFilter === 'pending') {
        // Only show pending approvals
        if (sub.approval_status !== 'pending') {
          return false
        }
      }
      // If approvalFilter === 'all', show all subscriptions (no filtering)

      // Status filter
      if (filter !== 'all') {
        const status = getSubscriptionStatus(sub)
        if (status.status !== filter) return false
      }
      // Sales rep filter (admin and managers)
      if (canViewTeam && selectedSalesRep !== 'all') {
        if (sub.leads?.assigned_to !== selectedSalesRep) return false
      }

      // Product filter
      if (selectedProduct !== 'all') {
        if (selectedProduct === 'none') {
          if (sub.product_id) return false
        } else {
          if (sub.product_id !== selectedProduct) return false
        }
      }

      // Deal value filter
      if (dealValueOperator !== 'all' && dealValueAmount) {
        const targetAmount = parseFloat(dealValueAmount)
        if (!isNaN(targetAmount)) {
          switch (dealValueOperator) {
            case 'lt': if (!(sub.deal_value < targetAmount)) return false; break
            case 'eq': if (!(sub.deal_value === targetAmount)) return false; break
            case 'gt': if (!(sub.deal_value > targetAmount)) return false; break
          }
        }
      }

      // Payment filter (paid/pending)
      if (paymentFilter !== 'all') {
        if (paymentFilter === 'fully_paid' && sub.amount_pending > 0) return false
        if (paymentFilter === 'pending' && sub.amount_pending <= 0) return false
      }

      // Days left filter
      if (daysLeftOperator !== 'all' && daysLeftValue) {
        const daysInfo = getDaysRemaining(sub)
        if (daysInfo.days === -1) return false // Skip non-recurring

        const targetDays = parseInt(daysLeftValue)
        if (!isNaN(targetDays)) {
          switch (daysLeftOperator) {
            case 'lt': if (!(daysInfo.days < targetDays)) return false; break
            case 'eq': if (!(daysInfo.days === targetDays)) return false; break
            case 'gt': if (!(daysInfo.days > targetDays)) return false; break
          }
        }
      }

      // Date range filter (by start_date)
      if (dateFrom) {
        const subDate = new Date(sub.start_date)
        const fromDate = new Date(dateFrom)
        fromDate.setHours(0, 0, 0, 0)
        if (subDate < fromDate) return false
      }
      if (dateTo) {
        const subDate = new Date(sub.start_date)
        const toDate = new Date(dateTo)
        toDate.setHours(23, 59, 59, 999)
        if (subDate > toDate) return false
      }

      // Phone search filter
      if (phoneSearch) {
        const searchTerm = phoneSearch.replace(/[^\d]/g, '')
        const leadPhone = (sub.leads?.phone || '').replace(/[^\d]/g, '')
        if (!leadPhone.includes(searchTerm)) return false
      }

      return true
    })
  }, [subscriptions, filter, isAdmin, canViewTeam, selectedSalesRep, selectedProduct, dealValueOperator, dealValueAmount, paymentFilter, daysLeftOperator, daysLeftValue, dateFrom, dateTo, phoneSearch, approvalFilter])

  // Check if any filter is active
  const hasActiveFilters = filter !== 'all' || selectedSalesRep !== 'all' ||
    selectedProduct !== 'all' || dealValueOperator !== 'all' ||
    paymentFilter !== 'all' || daysLeftOperator !== 'all' || dateFrom || dateTo || phoneSearch

  // Clear all filters
  const clearAllFilters = () => {
    setFilter('all')
    setSelectedSalesRep('all')
    setSelectedProduct('all')
    setDealValueOperator('all')
    setDealValueAmount('')
    setPaymentFilter('all')
    setDaysLeftOperator('all')
    setDaysLeftValue('')
    setDateFrom('')
    setDateTo('')
    setPhoneSearch('')
  }

  // Calculate stats from filtered subscriptions
  const stats = useMemo(() => {
    const data = filteredSubscriptions

    const totalCount = data.length
    const totalCredited = data.reduce((sum, sub) => sum + (sub.amount_credited || 0), 0)
    const totalPending = data.reduce((sum, sub) => sum + (sub.amount_pending || 0), 0)
    const totalDealValue = data.reduce((sum, sub) => sum + (sub.deal_value || 0), 0)

    let activeCount = 0
    let inactiveCount = 0
    let pausedCount = 0
    let nonRecurringCount = 0

    data.forEach(sub => {
      const status = getSubscriptionStatus(sub)
      switch (status.status) {
        case 'active': activeCount++; break
        case 'inactive': inactiveCount++; break
        case 'paused': pausedCount++; break
        case 'non_recurring': nonRecurringCount++; break
      }
    })

    return {
      totalCount,
      totalCredited,
      totalPending,
      totalDealValue,
      activeCount,
      inactiveCount,
      pausedCount,
      nonRecurringCount
    }
  }, [filteredSubscriptions])

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount)
  }

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const handleRefresh = async () => {
    setIsLoading(true)
    await fetchData()
    setIsLoading(false)
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="Subscriptions"
        description="Manage customer subscriptions"
        onRefresh={handleRefresh}
        isRefreshing={isLoading}
      />

      <div className="flex-1 p-3 sm:p-4 lg:p-6 pb-20 lg:pb-6 space-y-3 sm:space-y-4">
        {/* Toggle for Approval Status Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <Button
              variant={approvalFilter === 'approved' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setApprovalFilter('approved')}
              className="h-8 sm:h-9 text-xs sm:text-sm"
            >
              Approved Only
            </Button>
            <Button
              variant={approvalFilter === 'pending' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setApprovalFilter('pending')}
              className="h-8 sm:h-9 text-xs sm:text-sm"
            >
              Approval Pending
            </Button>
            <Button
              variant={approvalFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setApprovalFilter('all')}
              className="h-8 sm:h-9 text-xs sm:text-sm"
            >
              All Subscriptions
            </Button>
          </div>
          <div className="text-xs sm:text-sm text-muted-foreground">
            Showing {approvalFilter === 'approved' ? 'approved' : approvalFilter === 'pending' ? 'approval pending' : 'all'} subscriptions
          </div>
        </div>

        {/* Stats Summary */}
        <div className="flex flex-col sm:grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-2 sm:gap-3">
          <Card className="p-2 sm:p-3">
            <div className="text-[10px] sm:text-xs text-muted-foreground">Total</div>
            <div className="text-lg sm:text-xl font-bold">{stats.totalCount}</div>
          </Card>
          <Card className="p-2 sm:p-3">
            <div className="text-[10px] sm:text-xs text-muted-foreground">Deal Value</div>
            <div className="text-sm sm:text-lg font-bold text-primary truncate">{formatCurrency(stats.totalDealValue)}</div>
          </Card>
          <Card className="p-2 sm:p-3">
            <div className="text-[10px] sm:text-xs text-muted-foreground">Credited</div>
            <div className="text-sm sm:text-lg font-bold text-green-600 truncate">{formatCurrency(stats.totalCredited)}</div>
          </Card>
          <Card className="p-2 sm:p-3">
            <div className="text-[10px] sm:text-xs text-muted-foreground">Pending</div>
            <div className="text-sm sm:text-lg font-bold text-red-600 truncate">{formatCurrency(stats.totalPending)}</div>
          </Card>
          <Card className="p-2 sm:p-3">
            <div className="text-[10px] sm:text-xs text-muted-foreground">Active</div>
            <div className="text-lg sm:text-xl font-bold text-green-600">{stats.activeCount}</div>
          </Card>
          <Card className="p-2 sm:p-3">
            <div className="text-[10px] sm:text-xs text-muted-foreground">Expired</div>
            <div className="text-lg sm:text-xl font-bold text-red-600">{stats.inactiveCount}</div>
          </Card>
          <Card className="p-2 sm:p-3">
            <div className="text-[10px] sm:text-xs text-muted-foreground">Paused</div>
            <div className="text-lg sm:text-xl font-bold text-yellow-600">{stats.pausedCount}</div>
          </Card>
          <Card className="p-2 sm:p-3">
            <div className="text-[10px] sm:text-xs text-muted-foreground">Non Recurring</div>
            <div className="text-lg sm:text-xl font-bold text-gray-600">{stats.nonRecurringCount}</div>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:gap-4 p-3 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div>
                <CardTitle className="text-sm sm:text-base flex items-center gap-1.5 sm:gap-2">
                  <CreditCard className="h-4 w-4 sm:h-5 sm:w-5" />
                  Customer Subscriptions
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {filteredSubscriptions.length} of {subscriptions.length} subscription{subscriptions.length !== 1 ? 's' : ''}
                </CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto">
                {mounted && (
                  <>
                    {/* Sales Rep Filter - Admin and Managers */}
                    {canViewTeam && salesTeam.length > 0 && (
                      <Select value={selectedSalesRep} onValueChange={setSelectedSalesRep}>
                        <SelectTrigger className="w-full sm:w-[140px] h-8 sm:h-9 text-xs sm:text-sm">
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

                {mounted && (
                  <Select value={filter} onValueChange={setFilter}>
                    <SelectTrigger className="w-full sm:w-[130px] h-8 sm:h-9 text-xs sm:text-sm">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="non_recurring">Non Recurring</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="inactive">Expired</SelectItem>
                    </SelectContent>
                  </Select>
                )}

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
            {showFilters && mounted && (
              <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-4 p-2 sm:p-3 bg-muted/50 rounded-lg">
                {/* Deal Value Filter */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-1">
                  <div className="flex items-center gap-1.5 sm:gap-1">
                    <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                    <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">Deal Value</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Select value={dealValueOperator} onValueChange={setDealValueOperator}>
                      <SelectTrigger className="w-full sm:w-[90px] h-8 sm:h-9 text-xs sm:text-sm">
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Any</SelectItem>
                        <SelectItem value="lt">&lt; Less</SelectItem>
                        <SelectItem value="eq">= Equal</SelectItem>
                        <SelectItem value="gt">&gt; Greater</SelectItem>
                      </SelectContent>
                    </Select>
                    {dealValueOperator !== 'all' && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs sm:text-sm text-muted-foreground">₹</span>
                        <Input
                          type="number"
                          placeholder="0"
                          value={dealValueAmount}
                          onChange={(e) => setDealValueAmount(e.target.value)}
                          className="w-[90px] h-8 sm:h-9 text-xs sm:text-sm"
                          min="0"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Payment Filter */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">Payment:</span>
                  <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                    <SelectTrigger className="w-full sm:w-[130px] h-8 sm:h-9 text-xs sm:text-sm">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="fully_paid">Fully Paid</SelectItem>
                      <SelectItem value="pending">Has Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Days Left Filter */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-1">
                  <div className="flex items-center gap-1.5 sm:gap-1">
                    <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                    <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">Days Left</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Select value={daysLeftOperator} onValueChange={setDaysLeftOperator}>
                      <SelectTrigger className="w-full sm:w-[90px] h-8 sm:h-9 text-xs sm:text-sm">
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Any</SelectItem>
                        <SelectItem value="lt">&lt; Less</SelectItem>
                        <SelectItem value="eq">= Equal</SelectItem>
                        <SelectItem value="gt">&gt; Greater</SelectItem>
                      </SelectContent>
                    </Select>
                    {daysLeftOperator !== 'all' && (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          placeholder="0"
                          value={daysLeftValue}
                          onChange={(e) => setDaysLeftValue(e.target.value)}
                          className="w-[70px] h-8 sm:h-9 text-xs sm:text-sm"
                          min="0"
                        />
                        <span className="text-xs sm:text-sm text-muted-foreground">days</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Date Range Filter */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                    <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">Start Date</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      placeholder="From"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="flex-1 sm:w-[140px] h-8 sm:h-9 text-xs sm:text-sm"
                    />
                    <span className="text-xs sm:text-sm text-muted-foreground">to</span>
                    <Input
                      type="date"
                      placeholder="To"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="flex-1 sm:w-[140px] h-8 sm:h-9 text-xs sm:text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-3 sm:p-6">
            {filteredSubscriptions.length === 0 ? (
              <div className="text-center py-8 sm:py-12 text-muted-foreground">
                <CreditCard className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-4 opacity-50" />
                <p className="text-sm sm:text-lg font-medium">No subscriptions found</p>
                <p className="text-xs sm:text-sm">Win deals to create customer subscriptions</p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-3 px-2 font-medium w-10">#</th>
                        <th className="py-3 px-2 font-medium">Customer</th>
                        <th className="py-3 px-2 font-medium">Product</th>
                        <th className="py-3 px-2 font-medium">Deal Value</th>
                        <th className="py-3 px-2 font-medium">Paid / Pending</th>
                        <th className="py-3 px-2 font-medium">Period</th>
                        <th className="py-3 px-2 font-medium text-center">Approval</th>
                        <th className="py-3 px-2 font-medium text-center">Status</th>
                        <th className="py-3 px-2 font-medium text-center">Days Left</th>
                        {isAdmin && <th className="py-3 px-2 font-medium text-center">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSubscriptions.map((sub, index) => {
                        const statusInfo = getSubscriptionStatus(sub)
                        const daysInfo = getDaysRemaining(sub)

                        return (
                          <tr key={sub.id} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="py-3 px-2">
                              <span className="w-8 h-8 flex items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                                {index + 1}
                              </span>
                            </td>
                            <td className="py-3 px-2">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <Phone className="h-5 w-5 text-primary" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium">{sub.leads?.phone || 'Unknown'}</p>
                                  {sub.leads?.name && sub.leads.name !== sub.leads.phone && (
                                    <p className="text-xs text-muted-foreground truncate">{sub.leads.name}</p>
                                  )}
                                  {sub.leads?.custom_fields?.company && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Building2 className="h-3 w-3" />
                                      <span className="truncate">{sub.leads.custom_fields.company}</span>
                                    </div>
                                  )}
                                  {sub.leads?.email && (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Mail className="h-3 w-3" />
                                      {sub.leads.email}
                                    </span>
                                  )}
                                  {/* Sales Rep Name - Admin Only */}
                                  {isAdmin && sub.leads?.assignee && (
                                    <span className="flex items-center gap-1 text-xs text-primary mt-1">
                                      <UserCircle className="h-3 w-3" />
                                      {sub.leads.assignee.name} ({sub.leads.assignee.email})
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              {sub.product ? (
                                <Badge variant="outline" className="border-purple-500 text-purple-600">
                                  <Package className="h-3 w-3 mr-1" />
                                  {sub.product.name}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </td>
                            <td className="py-3 px-2">
                              <span className="font-semibold">₹{sub.deal_value.toLocaleString()}</span>
                            </td>
                            <td className="py-3 px-2">
                              <div className="text-sm">
                                <span className="text-green-600">₹{sub.amount_credited.toLocaleString()}</span>
                                {' / '}
                                <span className="text-red-600">₹{sub.amount_pending.toLocaleString()}</span>
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              <div className="text-sm">
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3 text-muted-foreground" />
                                  {format(parseISO(sub.start_date), 'dd MMM yyyy')}
                                </div>
                                <div className="text-muted-foreground">
                                  to {sub.validity_days >= 36500 ? 'Non Recurring' : format(parseISO(sub.end_date), 'dd MMM yyyy')}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-2 text-center">
                              {sub.approval_status === 'pending' ? (
                                <Badge variant="outline" className="border-yellow-500 text-yellow-600 bg-yellow-50">
                                  Pending Approval
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-green-500 text-green-600 bg-green-50">
                                  Approved
                                </Badge>
                              )}
                            </td>
                            <td className="py-3 px-2 text-center">
                              <Badge className={statusInfo.color}>
                                {statusInfo.label}
                              </Badge>
                            </td>
                            <td className="py-3 px-2 text-center">
                              <span className={`font-semibold ${daysInfo.color}`}>
                                {daysInfo.days === -1 ? '-' : daysInfo.days}
                              </span>
                            </td>
                            {isAdmin && (
                              <td className="py-3 px-2 text-center">
                                {statusInfo.status !== 'inactive' && statusInfo.status !== 'pending_approval' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => togglePause(sub.id, sub.status)}
                                    title={sub.status === 'paused' ? 'Resume' : 'Pause'}
                                  >
                                    {sub.status === 'paused' ? (
                                      <Play className="h-4 w-4 text-green-600" />
                                    ) : (
                                      <Pause className="h-4 w-4 text-yellow-600" />
                                    )}
                                  </Button>
                                )}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-2 sm:space-y-3">
                  {filteredSubscriptions.map((sub, index) => {
                    const statusInfo = getSubscriptionStatus(sub)
                    const daysInfo = getDaysRemaining(sub)

                    return (
                      <div key={sub.id} className="border rounded-lg p-3 sm:p-4 space-y-2 sm:space-y-3">
                        {/* Header: Serial + Phone (primary) */}
                        <div className="flex items-start gap-2 sm:gap-3">
                          {/* Serial Number */}
                          <span className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs sm:text-sm font-medium shrink-0">
                            {index + 1}
                          </span>
                          <div className="flex-1 min-w-0 space-y-1.5 sm:space-y-2">
                            {/* Phone - Always visible and prominent */}
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />
                              <p className="font-semibold text-base sm:text-lg break-all">{sub.leads?.phone || 'Unknown'}</p>
                            </div>
                            {/* Name */}
                            {sub.leads?.name && sub.leads.name !== sub.leads.phone && (
                              <p className="text-xs sm:text-sm text-muted-foreground break-words">{sub.leads.name}</p>
                            )}
                            {/* Company */}
                            {sub.leads?.custom_fields?.company && (
                              <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
                                <Building2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
                                <span className="break-words">{sub.leads.custom_fields.company}</span>
                              </div>
                            )}
                            {/* Badges - Stack vertically on mobile */}
                            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5 sm:gap-2 pt-1">
                              {sub.approval_status === 'pending' ? (
                                <Badge variant="outline" className="border-yellow-500 text-yellow-600 bg-yellow-50 text-xs w-fit">
                                  Pending Approval
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-green-500 text-green-600 bg-green-50 text-xs w-fit">
                                  Approved
                                </Badge>
                              )}
                              <Badge className={`${statusInfo.color} text-xs w-fit`}>
                                {statusInfo.label}
                              </Badge>
                              {sub.product && (
                                <Badge variant="outline" className="border-purple-500 text-purple-600 text-xs w-fit">
                                  <Package className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                                  {sub.product.name}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Email */}
                        {sub.leads?.email && (
                          <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground">
                            <Mail className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            <span className="truncate break-all">{sub.leads.email}</span>
                          </div>
                        )}

                        {/* Sales Rep Name - Admin Only */}
                        {isAdmin && sub.leads?.assignee && (
                          <div className="flex items-center gap-1 text-xs sm:text-sm text-primary">
                            <UserCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            <span className="break-words">Assigned to: {sub.leads.assignee.name} ({sub.leads.assignee.email})</span>
                          </div>
                        )}

                        {/* Contact Actions */}
                        <ContactActions
                          phone={sub.leads?.phone || null}
                          email={sub.leads?.email || null}
                          name={sub.leads?.name || ''}
                        />

                        {/* Financial Details */}
                        <div className="flex flex-col sm:grid sm:grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
                          <div>
                            <p className="text-muted-foreground text-[10px] sm:text-xs">Deal Value</p>
                            <p className="font-semibold text-sm sm:text-base">₹{sub.deal_value.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[10px] sm:text-xs">Days Left</p>
                            <p className={`font-semibold text-sm sm:text-base ${daysInfo.color}`}>
                              {daysInfo.days === -1 ? '-' : `${daysInfo.days} days`}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[10px] sm:text-xs">Paid</p>
                            <p className="text-green-600 text-sm sm:text-base">₹{sub.amount_credited.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[10px] sm:text-xs">Pending</p>
                            <p className="text-red-600 text-sm sm:text-base">₹{sub.amount_pending.toLocaleString()}</p>
                          </div>
                        </div>

                        {/* Period + Actions */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t text-xs sm:text-sm">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            {format(parseISO(sub.start_date), 'dd MMM')} - {sub.validity_days >= 36500 ? 'Non Recurring' : format(parseISO(sub.end_date), 'dd MMM yyyy')}
                          </div>
                          {/* Only admin can pause/resume subscriptions (not for pending approvals) */}
                          {isAdmin && statusInfo.status !== 'inactive' && statusInfo.status !== 'pending_approval' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => togglePause(sub.id, sub.status)}
                              className="h-7 sm:h-8 text-xs"
                            >
                              {sub.status === 'paused' ? (
                                <>
                                  <Play className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1" />
                                  Resume
                                </>
                              ) : (
                                <>
                                  <Pause className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1" />
                                  Pause
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
