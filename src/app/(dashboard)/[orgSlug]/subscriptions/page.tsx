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
  DollarSign
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

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin'

  useEffect(() => {
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

      if (error) {
        console.error('Error fetching subscriptions:', error)
        setSubscriptions([])
      } else {
        // Filter client-side for sales reps (only their assigned/created leads)
        let filteredSubs = (subsData || []).map(sub => ({
          ...sub,
          leads: sub.leads ? {
            ...sub.leads,
            assignee: (sub.leads as unknown as { assignee: { name: string } | null }).assignee
          } : null
        })) as Subscription[]
        
        if (profile.role === 'sales') {
          filteredSubs = filteredSubs.filter(sub => 
            sub.leads?.assigned_to === profile.id || sub.leads?.created_by === profile.id
          )
        }
        setSubscriptions(filteredSubs)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Calculate subscription status based on dates
  function getSubscriptionStatus(sub: Subscription): { status: string; color: string; label: string } {
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
      // Status filter
      if (filter !== 'all') {
        const status = getSubscriptionStatus(sub)
        if (status.status !== filter) return false
      }
      // Sales rep filter (admin only)
      if (isAdmin && selectedSalesRep !== 'all') {
        if (sub.leads?.assigned_to !== selectedSalesRep) return false
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
      
      return true
    })
  }, [subscriptions, filter, isAdmin, selectedSalesRep, dealValueOperator, dealValueAmount, paymentFilter, daysLeftOperator, daysLeftValue, dateFrom, dateTo])

  // Check if any filter is active
  const hasActiveFilters = filter !== 'all' || selectedSalesRep !== 'all' || 
    selectedProduct !== 'all' || dealValueOperator !== 'all' || 
    paymentFilter !== 'all' || daysLeftOperator !== 'all' || dateFrom || dateTo

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
                    <SelectTrigger className="w-[130px]">
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
                        <th className="py-3 px-2 font-medium">Customer</th>
                        <th className="py-3 px-2 font-medium">Deal Value</th>
                        <th className="py-3 px-2 font-medium">Paid / Pending</th>
                        <th className="py-3 px-2 font-medium">Period</th>
                        <th className="py-3 px-2 font-medium text-center">Status</th>
                        <th className="py-3 px-2 font-medium text-center">Days Left</th>
                        {isAdmin && <th className="py-3 px-2 font-medium text-center">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSubscriptions.map((sub) => {
                        const statusInfo = getSubscriptionStatus(sub)
                        const daysInfo = getDaysRemaining(sub)
                        
                        return (
                          <tr key={sub.id} className="border-b last:border-0 hover:bg-muted/50">
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
                                {statusInfo.status !== 'inactive' && (
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
                  {filteredSubscriptions.map((sub) => {
                    const statusInfo = getSubscriptionStatus(sub)
                    const daysInfo = getDaysRemaining(sub)
                    
                    return (
                      <div key={sub.id} className="border rounded-lg p-4 space-y-3">
                        {/* Header: Phone (primary) + Status */}
                        <div className="flex items-start justify-between gap-2">
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
                          <Badge className={`${statusInfo.color} shrink-0`}>
                            {statusInfo.label}
                          </Badge>
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
                          {/* Only admin can pause/resume subscriptions */}
                          {isAdmin && statusInfo.status !== 'inactive' && (
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
