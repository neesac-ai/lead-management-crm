'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { 
  CreditCard,
  Building2,
  Calendar,
  Users,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Pause,
  Play,
  Filter,
  X,
  IndianRupee,
} from 'lucide-react'
import { format, addDays, isAfter, isBefore } from 'date-fns'

type OrgSubscription = {
  id: string
  org_id: string
  subscription_type: 'trial' | 'paid'
  validity_days: number
  sales_quota: number | null
  accountant_quota: number | null
  subscription_value: number
  amount_credited: number
  amount_pending: number
  start_date: string
  end_date: string
  status: string
  notes: string | null
  created_at: string
  organizations: { name: string; org_code: string } | null
  // Added for displaying current usage
  salesCount?: number
  accountantCount?: number
}

export default function SuperAdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<OrgSubscription[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)
  
  // Edit dialog
  const [editingSubscription, setEditingSubscription] = useState<OrgSubscription | null>(null)
  const [editForm, setEditForm] = useState({
    subscription_type: 'trial' as 'trial' | 'paid',
    validity_days: '30',
    sales_quota: '5',
    accountant_quota: '1',
    unlimitedSales: false,
    unlimitedAccountant: false,
    subscription_value: '0',
    amount_credited: '0',
    start_date: '',
    status: 'active',
    notes: '',
  })
  const [isSaving, setIsSaving] = useState(false)
  
  // Delete dialog
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    fetchSubscriptions()
  }, [])

  const fetchSubscriptions = async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('org_subscriptions')
      .select(`
        id,
        org_id,
        subscription_type,
        validity_days,
        sales_quota,
        accountant_quota,
        subscription_value,
        amount_credited,
        amount_pending,
        start_date,
        end_date,
        status,
        notes,
        created_at,
        organizations(name, org_code)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      // Table might not exist yet - that's okay
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.log('org_subscriptions table not created yet')
      } else {
        console.error('Error fetching subscriptions:', error)
        toast.error('Failed to fetch subscriptions')
      }
    } else {
      // Fetch user counts for each org
      const subsWithCounts = await Promise.all((data || []).map(async (sub) => {
        const { count: salesCount } = await supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', sub.org_id)
          .eq('role', 'sales')
          .eq('is_approved', true)
          .eq('is_active', true)

        const { count: accountantCount } = await supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', sub.org_id)
          .eq('role', 'accountant')
          .eq('is_approved', true)
          .eq('is_active', true)

        return {
          ...sub,
          salesCount: salesCount || 0,
          accountantCount: accountantCount || 0,
        }
      }))
      
      setSubscriptions(subsWithCounts as OrgSubscription[])
    }
    setIsLoading(false)
  }

  // Compute actual status based on dates
  const getActualStatus = (sub: OrgSubscription): string => {
    if (sub.status === 'paused') return 'paused'
    const today = new Date()
    const endDate = new Date(sub.end_date)
    if (isAfter(today, endDate)) return 'inactive'
    return 'active'
  }

  // Filter subscriptions
  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter(sub => {
      const actualStatus = getActualStatus(sub)
      
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'active' && actualStatus !== 'active') return false
        if (statusFilter === 'inactive' && actualStatus !== 'inactive') return false
        if (statusFilter === 'paused' && actualStatus !== 'paused') return false
      }
      
      // Type filter
      if (typeFilter !== 'all' && sub.subscription_type !== typeFilter) return false
      
      // Date filter
      if (dateFrom) {
        const startDate = new Date(sub.start_date)
        const filterFrom = new Date(dateFrom)
        if (isBefore(startDate, filterFrom)) return false
      }
      
      if (dateTo) {
        const startDate = new Date(sub.start_date)
        const filterTo = new Date(dateTo)
        if (isAfter(startDate, filterTo)) return false
      }
      
      return true
    })
  }, [subscriptions, statusFilter, typeFilter, dateFrom, dateTo])

  // Stats
  const stats = useMemo(() => {
    const total = filteredSubscriptions.length
    const active = filteredSubscriptions.filter(s => getActualStatus(s) === 'active').length
    const inactive = filteredSubscriptions.filter(s => getActualStatus(s) === 'inactive').length
    const paused = filteredSubscriptions.filter(s => getActualStatus(s) === 'paused').length
    const trial = filteredSubscriptions.filter(s => s.subscription_type === 'trial').length
    const paid = filteredSubscriptions.filter(s => s.subscription_type === 'paid').length
    const totalValue = filteredSubscriptions.reduce((sum, s) => sum + (s.subscription_value || 0), 0)
    const totalCredited = filteredSubscriptions.reduce((sum, s) => sum + (s.amount_credited || 0), 0)
    const totalPending = filteredSubscriptions.reduce((sum, s) => sum + (s.amount_pending || 0), 0)
    
    return { total, active, inactive, paused, trial, paid, totalValue, totalCredited, totalPending }
  }, [filteredSubscriptions])

  const openEditDialog = (sub: OrgSubscription) => {
    setEditingSubscription(sub)
    setEditForm({
      subscription_type: sub.subscription_type,
      validity_days: sub.validity_days >= 36500 ? 'lifetime' : sub.validity_days.toString(),
      sales_quota: (sub.sales_quota || 5).toString(),
      accountant_quota: (sub.accountant_quota || 1).toString(),
      unlimitedSales: sub.sales_quota === null,
      unlimitedAccountant: sub.accountant_quota === null,
      subscription_value: sub.subscription_value.toString(),
      amount_credited: sub.amount_credited.toString(),
      start_date: sub.start_date,
      status: sub.status,
      notes: sub.notes || '',
    })
  }

  const calculateEndDate = () => {
    const days = editForm.validity_days === 'lifetime' ? 36500 : parseInt(editForm.validity_days)
    return format(addDays(new Date(editForm.start_date), days), 'yyyy-MM-dd')
  }

  const handleSave = async () => {
    if (!editingSubscription) return
    
    setIsSaving(true)
    const supabase = createClient()
    
    const days = editForm.validity_days === 'lifetime' ? 36500 : parseInt(editForm.validity_days)
    const endDate = format(addDays(new Date(editForm.start_date), days), 'yyyy-MM-dd')
    
    const { error } = await supabase
      .from('org_subscriptions')
      .update({
        subscription_type: editForm.subscription_type,
        validity_days: days,
        sales_quota: editForm.unlimitedSales ? null : parseInt(editForm.sales_quota),
        accountant_quota: editForm.unlimitedAccountant ? null : parseInt(editForm.accountant_quota),
        subscription_value: parseFloat(editForm.subscription_value),
        amount_credited: parseFloat(editForm.amount_credited),
        start_date: editForm.start_date,
        end_date: endDate,
        status: editForm.status,
        notes: editForm.notes || null,
      })
      .eq('id', editingSubscription.id)

    if (error) {
      console.error('Error updating subscription:', error)
      toast.error('Failed to update subscription')
    } else {
      toast.success('Subscription updated')
      setEditingSubscription(null)
      fetchSubscriptions()
    }
    setIsSaving(false)
  }

  const handleTogglePause = async (sub: OrgSubscription) => {
    const supabase = createClient()
    const newStatus = sub.status === 'paused' ? 'active' : 'paused'
    
    const { error } = await supabase
      .from('org_subscriptions')
      .update({ status: newStatus })
      .eq('id', sub.id)

    if (error) {
      console.error('Error toggling pause:', error)
      toast.error('Failed to update subscription')
    } else {
      toast.success(newStatus === 'paused' ? 'Subscription paused' : 'Subscription resumed')
      fetchSubscriptions()
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    
    setIsDeleting(true)
    const supabase = createClient()
    
    const { error } = await supabase
      .from('org_subscriptions')
      .delete()
      .eq('id', deleteId)

    if (error) {
      console.error('Error deleting subscription:', error)
      toast.error('Failed to delete subscription')
    } else {
      toast.success('Subscription deleted')
      fetchSubscriptions()
    }
    setIsDeleting(false)
    setDeleteId(null)
  }

  const clearFilters = () => {
    setStatusFilter('all')
    setTypeFilter('all')
    setDateFrom('')
    setDateTo('')
  }

  const hasActiveFilters = statusFilter !== 'all' || typeFilter !== 'all' || dateFrom || dateTo

  const getStatusBadge = (sub: OrgSubscription) => {
    const status = getActualStatus(sub)
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500">Active</Badge>
      case 'inactive':
        return <Badge variant="destructive">Inactive</Badge>
      case 'paused':
        return <Badge className="bg-yellow-500">Paused</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
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
        title="Organization Subscriptions" 
        description="Manage all organization subscriptions and quotas"
      />
      
      <div className="flex-1 p-4 lg:p-6 space-y-4 lg:space-y-6">
        {/* Stats */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Inactive</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.inactive}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Paused</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.paused}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Trial</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.trial}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{stats.paid}</div>
            </CardContent>
          </Card>
        </div>

        {/* Financial Stats */}
        <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <IndianRupee className="h-4 w-4" />
                Total Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{stats.totalValue.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="bg-green-500/5 border-green-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-700">Amount Credited</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">₹{stats.totalCredited.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="bg-red-500/5 border-red-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-700">Amount Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">₹{stats.totalPending.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-3 items-center">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant={showFilters ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4 mr-2" />
                Date Filter
              </Button>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              )}
            </div>

            {showFilters && (
              <div className="flex flex-wrap gap-3 items-end mt-3 pt-3 border-t">
                <div className="space-y-1">
                  <Label className="text-xs">Start Date From</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-[160px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Start Date To</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-[160px]"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subscriptions List */}
        <Card>
          <CardHeader>
            <CardTitle>All Subscriptions</CardTitle>
            <CardDescription>
              Showing {filteredSubscriptions.length} of {subscriptions.length} subscriptions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredSubscriptions.length > 0 ? (
              <div className="space-y-3">
                {filteredSubscriptions.map((sub) => (
                  <div 
                    key={sub.id} 
                    className="p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5 text-primary" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-semibold truncate">
                            {sub.organizations?.name || 'Unknown Organization'}
                          </p>
                          <Badge variant="outline" className="font-mono text-xs">
                            {sub.organizations?.org_code}
                          </Badge>
                          {getStatusBadge(sub)}
                          <Badge variant={sub.subscription_type === 'paid' ? 'default' : 'secondary'}>
                            {sub.subscription_type}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground mt-2">
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            Sales: <span className={sub.sales_quota !== null && (sub.salesCount || 0) > sub.sales_quota ? 'text-red-600 font-semibold' : ''}>
                              {sub.salesCount || 0}/{sub.sales_quota === null ? '∞' : sub.sales_quota}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            Accountant: <span className={sub.accountant_quota !== null && (sub.accountantCount || 0) > sub.accountant_quota ? 'text-red-600 font-semibold' : ''}>
                              {sub.accountantCount || 0}/{sub.accountant_quota === null ? '∞' : sub.accountant_quota}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {sub.validity_days >= 36500 ? 'Lifetime' : `${sub.validity_days} days`}
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Ends: {format(new Date(sub.end_date), 'MMM d, yyyy')}
                          </div>
                        </div>
                        
                        {sub.subscription_type === 'paid' && (
                          <div className="flex gap-4 text-sm mt-2">
                            <span>Value: <span className="font-medium">₹{sub.subscription_value.toLocaleString()}</span></span>
                            <span className="text-green-600">Credited: ₹{sub.amount_credited.toLocaleString()}</span>
                            <span className="text-red-600">Pending: ₹{sub.amount_pending.toLocaleString()}</span>
                          </div>
                        )}
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(sub)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleTogglePause(sub)}>
                            {sub.status === 'paused' ? (
                              <>
                                <Play className="mr-2 h-4 w-4" />
                                Resume
                              </>
                            ) : (
                              <>
                                <Pause className="mr-2 h-4 w-4" />
                                Pause
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => setDeleteId(sub.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No subscriptions found</p>
                <p className="text-sm">
                  {hasActiveFilters ? 'Try adjusting your filters' : 'Subscriptions will appear here when you approve organizations'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingSubscription} onOpenChange={(open) => !open && setEditingSubscription(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Subscription</DialogTitle>
            <DialogDescription>
              {editingSubscription?.organizations?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Status */}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Subscription Type */}
            <div className="space-y-2">
              <Label>Subscription Type</Label>
              <Select 
                value={editForm.subscription_type} 
                onValueChange={(v) => setEditForm({ 
                  ...editForm, 
                  subscription_type: v as 'trial' | 'paid',
                  validity_days: v === 'trial' ? '7' : '30'
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Validity */}
            <div className="space-y-2">
              <Label>Validity Period</Label>
              <Select value={editForm.validity_days} onValueChange={(v) => setEditForm({ ...editForm, validity_days: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {editForm.subscription_type === 'trial' ? (
                    <>
                      <SelectItem value="7">7 Days</SelectItem>
                      <SelectItem value="14">14 Days</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="30">30 Days</SelectItem>
                      <SelectItem value="60">60 Days</SelectItem>
                      <SelectItem value="90">90 Days</SelectItem>
                      <SelectItem value="180">180 Days (6 Months)</SelectItem>
                      <SelectItem value="365">365 Days (1 Year)</SelectItem>
                      <SelectItem value="lifetime">Lifetime</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Sales Quota */}
            <div className="space-y-2">
              <Label>Sales Rep Quota</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  value={editForm.sales_quota}
                  onChange={(e) => setEditForm({ ...editForm, sales_quota: e.target.value })}
                  disabled={editForm.unlimitedSales}
                  className="w-24"
                  min="0"
                />
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="edit-unlimited-sales"
                    checked={editForm.unlimitedSales}
                    onCheckedChange={(checked) => setEditForm({ ...editForm, unlimitedSales: checked as boolean })}
                  />
                  <Label htmlFor="edit-unlimited-sales" className="text-sm font-normal cursor-pointer">
                    Unlimited
                  </Label>
                </div>
              </div>
            </div>

            {/* Accountant Quota */}
            <div className="space-y-2">
              <Label>Accountant Quota</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  value={editForm.accountant_quota}
                  onChange={(e) => setEditForm({ ...editForm, accountant_quota: e.target.value })}
                  disabled={editForm.unlimitedAccountant}
                  className="w-24"
                  min="0"
                />
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="edit-unlimited-accountant"
                    checked={editForm.unlimitedAccountant}
                    onCheckedChange={(checked) => setEditForm({ ...editForm, unlimitedAccountant: checked as boolean })}
                  />
                  <Label htmlFor="edit-unlimited-accountant" className="text-sm font-normal cursor-pointer">
                    Unlimited
                  </Label>
                </div>
              </div>
            </div>

            {/* Paid Subscription Fields */}
            {editForm.subscription_type === 'paid' && (
              <>
                <div className="border-t pt-4 mt-4">
                  <h4 className="font-medium mb-3">Payment Details</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Subscription Value (₹)</Label>
                      <Input
                        type="number"
                        value={editForm.subscription_value}
                        onChange={(e) => setEditForm({ ...editForm, subscription_value: e.target.value })}
                        min="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Amount Credited (₹)</Label>
                      <Input
                        type="number"
                        value={editForm.amount_credited}
                        onChange={(e) => setEditForm({ ...editForm, amount_credited: e.target.value })}
                        min="0"
                      />
                    </div>
                  </div>

                  <div className="mt-3 p-3 bg-muted rounded-lg">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Amount Pending:</span>
                      <span className="font-medium text-red-600">
                        ₹{Math.max(0, parseFloat(editForm.subscription_value || '0') - parseFloat(editForm.amount_credited || '0')).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={editForm.start_date}
                  onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date (Auto)</Label>
                <Input
                  type="date"
                  value={editForm.start_date ? calculateEndDate() : ''}
                  disabled
                  className="bg-muted"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Optional notes..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSubscription(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this subscription record. The organization will no longer have quota limits until a new subscription is created.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
