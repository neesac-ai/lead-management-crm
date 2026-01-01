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
    assignee?: { name: string } | null
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
  const [showApprovedOnly, setShowApprovedOnly] = useState<boolean>(true) // Default to approved only
  
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

      // Get organization
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single()

      if (!orgData) return

      // Fetch sales team for admin filter
      if ((profile.role === 'admin' || profile.role === 'super_admin') && profile.org_id) {
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
            assignee:users!leads_assigned_to_fkey(name)
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
                assignee:users!leads_assigned_to_fkey(name)
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
              assignee: (sub.leads as unknown as { assignee: { name: string } | null }).assignee
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
                assignee: (leadData as unknown as { assignee: { name: string } | null }).assignee
              } : null
            }
          }) as Subscription[]
        }

        // Combine approved and pending
        let allSubs = [...approvedSubs, ...pendingSubs]
        
        // Filter client-side for sales reps (only their assigned/created leads)
        if (profile.role === 'sales') {
          allSubs = allSubs.filter(sub => 
            sub.leads?.assigned_to === profile.id || sub.leads?.created_by === profile.id
          )
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
      // Approval status filter (approved only vs all)
      // If showApprovedOnly is true, only show approved (or undefined for backward compatibility with old subscriptions)
      if (showApprovedOnly) {
        // Exclude pending approvals, but include approved and undefined (old subscriptions without approval_status)
        if (sub.approval_status === 'pending') {
          return false
        }
        // Include if approved or undefined (undefined means it's an old subscription, considered approved)
      }
      
      // Status filter
      if (filter !== 'all') {
        const status = getSubscriptionStatus(sub)
        if (status.status !== filter) return false
      }
      // Sales rep filter (admin only)
      if (isAdmin && selectedSalesRep !== 'all') {
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
  }, [subscriptions, filter, isAdmin, selectedSalesRep, selectedProduct, dealValueOperator, dealValueAmount, paymentFilter, daysLeftOperator, daysLeftValue, dateFrom, dateTo, phoneSearch, showApprovedOnly])

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

  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title="Subscriptions" 
        description="Manage customer subscriptions"
      />
      
      <div className="flex-1 p-4 lg:p-6 space-y-4">
        {/* Toggle for Approved Only vs All */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant={showApprovedOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowApprovedOnly(true)}
            >
              Approved Only
            </Button>
            <Button
              variant={!showApprovedOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowApprovedOnly(false)}
            >
              All Subscriptions
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">
            Showing {showApprovedOnly ? 'approved' : 'all'} subscriptions
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-xl font-bold">{stats.totalCount}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Deal Value</div>
            <div className="text-lg font-bold text-primary">{formatCurrency(stats.totalDealValue)}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Credited</div>
            <div className="text-lg font-bold text-green-600">{formatCurrency(stats.totalCredited)}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Pending</div>
            <div className="text-lg font-bold text-red-600">{formatCurrency(stats.totalPending)}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Active</div>
            <div className="text-xl font-bold text-green-600">{stats.activeCount}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Expired</div>
            <div className="text-xl font-bold text-red-600">{stats.inactiveCount}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Paused</div>
            <div className="text-xl font-bold text-yellow-600">{stats.pausedCount}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Non Recurring</div>
            <div className="text-xl font-bold text-gray-600">{stats.nonRecurringCount}</div>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Customer Subscriptions
                </CardTitle>
                <CardDescription>
                  {filteredSubscriptions.length} of {subscriptions.length} subscription{subscriptions.length !== 1 ? 's' : ''}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {mounted && (
                  <>
                    {/* Sales Rep Filter - Admin Only */}
                    {isAdmin && salesTeam.length > 0 && (
                      <Select value={selectedSalesRep} onValueChange={setSelectedSalesRep}>
                        <SelectTrigger className="w-[140px]">
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
                        <SelectTrigger className="w-[150px]">
                          <Package className="h-4 w-4 mr-2" />
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
                <div className="relative">
                  <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search by phone..."
                    value={phoneSearch}
                    onChange={(e) => setPhoneSearch(e.target.value)}
                    className="w-[160px] pl-8 h-9"
                  />
                </div>

                {mounted && (
                  <Select value={filter} onValueChange={setFilter}>
                    <SelectTrigger className="w-[130px]">
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
            {showFilters && mounted && (
              <div className="flex flex-wrap items-center gap-4 p-3 bg-muted/50 rounded-lg">
                {/* Deal Value Filter */}
                <div className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Deal Value</span>
                  <Select value={dealValueOperator} onValueChange={setDealValueOperator}>
                    <SelectTrigger className="w-[90px]">
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
                      <span className="text-muted-foreground">₹</span>
                      <Input
                        type="number"
                        placeholder="0"
                        value={dealValueAmount}
                        onChange={(e) => setDealValueAmount(e.target.value)}
                        className="w-[90px] h-9"
                        min="0"
                      />
                    </div>
                  )}
                </div>

                {/* Payment Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Payment:</span>
                  <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                    <SelectTrigger className="w-[130px]">
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
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Days Left</span>
                  <Select value={daysLeftOperator} onValueChange={setDaysLeftOperator}>
                    <SelectTrigger className="w-[90px]">
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
                        className="w-[70px] h-9"
                        min="0"
                      />
                      <span className="text-sm text-muted-foreground">days</span>
                    </div>
                  )}
                </div>

                {/* Date Range Filter */}
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Start Date</span>
                  <Input
                    type="date"
                    placeholder="From"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-[140px] h-9"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="date"
                    placeholder="To"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-[140px] h-9"
                  />
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {filteredSubscriptions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No subscriptions found</p>
                <p className="text-sm">Win deals to create customer subscriptions</p>
              </div>
            ) : (
              <div className="space-y-4">
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
                                      {sub.leads.assignee.name}
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
                <div className="md:hidden space-y-3">
                  {filteredSubscriptions.map((sub, index) => {
                    const statusInfo = getSubscriptionStatus(sub)
                    const daysInfo = getDaysRemaining(sub)
                    
                    return (
                      <div key={sub.id} className="border rounded-lg p-4 space-y-3">
                        {/* Header: Serial + Phone (primary) + Status */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            {/* Serial Number */}
                            <span className="w-8 h-8 flex items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium shrink-0">
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-primary shrink-0" />
                                <p className="font-semibold text-lg truncate">{sub.leads?.phone || 'Unknown'}</p>
                              </div>
                            {sub.leads?.name && sub.leads.name !== sub.leads.phone && (
                              <p className="text-sm text-muted-foreground truncate mt-0.5">{sub.leads.name}</p>
                            )}
                            {sub.leads?.custom_fields?.company && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Building2 className="h-3 w-3" />
                                <span className="truncate">{sub.leads.custom_fields.company}</span>
                              </div>
                            )}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 shrink-0">
                            {sub.approval_status === 'pending' ? (
                              <Badge variant="outline" className="border-yellow-500 text-yellow-600 bg-yellow-50">
                                Pending Approval
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-green-500 text-green-600 bg-green-50">
                                Approved
                              </Badge>
                            )}
                            <Badge className={statusInfo.color}>
                              {statusInfo.label}
                            </Badge>
                            {sub.product && (
                              <Badge variant="outline" className="border-purple-500 text-purple-600">
                                <Package className="h-3 w-3 mr-1" />
                                {sub.product.name}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Email */}
                        {sub.leads?.email && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            <span className="truncate">{sub.leads.email}</span>
                          </div>
                        )}

                        {/* Sales Rep Name - Admin Only */}
                        {isAdmin && sub.leads?.assignee && (
                          <div className="flex items-center gap-1 text-sm text-primary">
                            <UserCircle className="h-3 w-3" />
                            <span>Assigned to: {sub.leads.assignee.name}</span>
                          </div>
                        )}

                        {/* Contact Actions */}
                        <ContactActions 
                          phone={sub.leads?.phone || null}
                          email={sub.leads?.email || null}
                          name={sub.leads?.name || ''}
                        />

                        {/* Financial Details */}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Deal Value</p>
                            <p className="font-semibold">₹{sub.deal_value.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Days Left</p>
                            <p className={`font-semibold ${daysInfo.color}`}>
                              {daysInfo.days === -1 ? '-' : `${daysInfo.days} days`}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Paid</p>
                            <p className="text-green-600">₹{sub.amount_credited.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Pending</p>
                            <p className="text-red-600">₹{sub.amount_pending.toLocaleString()}</p>
                          </div>
                        </div>

                        {/* Period + Actions */}
                        <div className="flex items-center justify-between pt-2 border-t text-sm">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {format(parseISO(sub.start_date), 'dd MMM')} - {sub.validity_days >= 36500 ? 'Non Recurring' : format(parseISO(sub.end_date), 'dd MMM yyyy')}
                          </div>
                          {/* Only admin can pause/resume subscriptions (not for pending approvals) */}
                          {isAdmin && statusInfo.status !== 'inactive' && statusInfo.status !== 'pending_approval' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => togglePause(sub.id, sub.status)}
                            >
                              {sub.status === 'paused' ? (
                                <>
                                  <Play className="h-3 w-3 mr-1" />
                                  Resume
                                </>
                              ) : (
                                <>
                                  <Pause className="h-3 w-3 mr-1" />
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
