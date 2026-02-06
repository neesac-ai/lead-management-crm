'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { 
  MoreHorizontal, 
  CheckCircle, 
  XCircle, 
  Ban, 
  Trash2,
  Loader2,
  Copy,
  CreditCard,
} from 'lucide-react'
import { format, addDays } from 'date-fns'

interface OrgActionsProps {
  orgId: string
  orgName: string
  orgCode: string
  status: string
}

type ExistingSubscription = {
  id: string
  subscription_type: 'trial' | 'paid'
  validity_days: number
  sales_quota: number | null
  accountant_quota: number | null
  subscription_value: number
  amount_credited: number
  start_date: string
  end_date: string
  status: string
  notes: string | null
}

export function OrgActions({ orgId, orgName, orgCode, status }: OrgActionsProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showApprovalDialog, setShowApprovalDialog] = useState(false)
  const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false)
  const [existingSubscription, setExistingSubscription] = useState<ExistingSubscription | null>(null)
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(false)
  
  // Subscription form state
  const [subscriptionType, setSubscriptionType] = useState<'trial' | 'paid'>('trial')
  const [validityDays, setValidityDays] = useState<string>('7')
  const [salesQuota, setSalesQuota] = useState<string>('5')
  const [accountantQuota, setAccountantQuota] = useState<string>('1')
  const [unlimitedSales, setUnlimitedSales] = useState(false)
  const [unlimitedAccountant, setUnlimitedAccountant] = useState(false)
  const [subscriptionValue, setSubscriptionValue] = useState<string>('0')
  const [amountCredited, setAmountCredited] = useState<string>('0')
  const [startDate, setStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('active')
  const [notes, setNotes] = useState<string>('')

  const copyOrgCode = () => {
    navigator.clipboard.writeText(orgCode)
    toast.success('Organization code copied!')
  }

  const calculateEndDate = () => {
    const days = validityDays === 'lifetime' ? 36500 : parseInt(validityDays)
    return format(addDays(new Date(startDate), days), 'yyyy-MM-dd')
  }

  const calculatePending = () => {
    const value = parseFloat(subscriptionValue) || 0
    const credited = parseFloat(amountCredited) || 0
    return Math.max(0, value - credited)
  }

  // Load existing subscription when opening the dialog
  const openSubscriptionDialog = async () => {
    setIsLoadingSubscription(true)
    setShowSubscriptionDialog(true)
    
    const supabase = createClient()
    const { data, error } = await supabase
      .from('org_subscriptions')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (data && !error) {
      setExistingSubscription(data as ExistingSubscription)
      // Populate form with existing data
      setSubscriptionType(data.subscription_type)
      // Map validity days - for trial it should be 3, 7 or 14, for paid other options
      let validityValue = data.validity_days.toString()
      if (data.validity_days >= 36500) {
        validityValue = 'lifetime'
      } else if (data.subscription_type === 'trial' && ![3, 7, 14].includes(data.validity_days)) {
        validityValue = '7' // Default to 7 if invalid trial validity
      }
      setValidityDays(validityValue)
      setSalesQuota((data.sales_quota || 5).toString())
      setAccountantQuota((data.accountant_quota || 1).toString())
      setUnlimitedSales(data.sales_quota === null)
      setUnlimitedAccountant(data.accountant_quota === null)
      setSubscriptionValue(data.subscription_value?.toString() || '0')
      setAmountCredited(data.amount_credited?.toString() || '0')
      setStartDate(data.start_date)
      setSubscriptionStatus(data.status)
      setNotes(data.notes || '')
    } else {
      // Reset to defaults for new subscription
      setExistingSubscription(null)
      setSubscriptionType('trial')
      setValidityDays('7')
      setSalesQuota('5')
      setAccountantQuota('1')
      setUnlimitedSales(false)
      setUnlimitedAccountant(false)
      setSubscriptionValue('0')
      setAmountCredited('0')
      setStartDate(format(new Date(), 'yyyy-MM-dd'))
      setSubscriptionStatus('active')
      setNotes('')
    }
    
    setIsLoadingSubscription(false)
  }

  const handleSaveSubscription = async () => {
    setIsLoading(true)
    try {
      const days = validityDays === 'lifetime' ? 36500 : parseInt(validityDays)
      
      const subscriptionData = {
        org_id: orgId,
        subscription_type: subscriptionType,
        validity_days: days,
        sales_quota: unlimitedSales ? null : parseInt(salesQuota),
        accountant_quota: unlimitedAccountant ? null : parseInt(accountantQuota),
        subscription_value: subscriptionType === 'paid' ? parseFloat(subscriptionValue) : 0,
        amount_credited: subscriptionType === 'paid' ? parseFloat(amountCredited) : 0,
        start_date: startDate,
        end_date: calculateEndDate(),
        status: subscriptionStatus,
        notes: notes || null,
      }

      const response = await fetch('/api/super-admin/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscriptionData),
      })

      const data = await response.json()

      if (!response.ok) {
        console.error('Error saving subscription:', data.error)
        toast.error(data.error || 'Failed to save subscription')
        return
      }

      toast.success(existingSubscription ? 'Subscription updated!' : 'Subscription created!')
      setShowSubscriptionDialog(false)
      router.refresh()
    } catch (error) {
      console.error('Subscription error:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleApproveWithSubscription = async () => {
    setIsLoading(true)
    try {
      const days = validityDays === 'lifetime' ? 36500 : parseInt(validityDays)
      
      const subscriptionData = {
        subscription_type: subscriptionType,
        validity_days: days,
        sales_quota: unlimitedSales ? null : parseInt(salesQuota),
        accountant_quota: unlimitedAccountant ? null : parseInt(accountantQuota),
        subscription_value: subscriptionType === 'paid' ? parseFloat(subscriptionValue) : 0,
        amount_credited: subscriptionType === 'paid' ? parseFloat(amountCredited) : 0,
        start_date: startDate,
        end_date: calculateEndDate(),
      }

      const response = await fetch(`/api/super-admin/organizations/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'approve',
          subscription: subscriptionData
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Action failed')
        return
      }

      toast.success('Organization approved with subscription!')
      setShowApprovalDialog(false)
      router.refresh()
    } catch (error) {
      console.error('Action error:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAction = async (action: 'reject' | 'suspend') => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/super-admin/organizations/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Action failed')
        return
      }

      toast.success(data.message)
      router.refresh()
    } catch (error) {
      console.error('Action error:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReactivate = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/super-admin/organizations/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Action failed')
        return
      }

      toast.success('Organization reactivated!')
      router.refresh()
    } catch (error) {
      console.error('Action error:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/super-admin/organizations/${orgId}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Delete failed')
        return
      }

      toast.success('Organization deleted')
      router.refresh()
    } catch (error) {
      console.error('Delete error:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
      setShowDeleteDialog(false)
    }
  }

  if (isLoading) {
    return (
      <Button variant="ghost" size="icon" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    )
  }

  // Subscription form JSX (shared between approval and edit dialogs)
  const SubscriptionForm = () => (
    <div className="space-y-4 py-4">
      {/* Status (only for edit mode) */}
      {existingSubscription && (
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={subscriptionStatus} onValueChange={setSubscriptionStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Subscription Type */}
      <div className="space-y-2">
        <Label>Subscription Type</Label>
        <Select 
          value={subscriptionType} 
          onValueChange={(v) => {
            setSubscriptionType(v as 'trial' | 'paid')
            // Reset validity to appropriate default when type changes
            setValidityDays(v === 'trial' ? '7' : '30')
          }}
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
        <Select value={validityDays} onValueChange={setValidityDays}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {subscriptionType === 'trial' ? (
              <>
                <SelectItem value="3">3 Days</SelectItem>
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
            value={salesQuota}
            onChange={(e) => setSalesQuota(e.target.value)}
            disabled={unlimitedSales}
            className="w-24"
            min="0"
          />
          <div className="flex items-center gap-2">
            <Checkbox 
              id="unlimited-sales"
              checked={unlimitedSales}
              onCheckedChange={(checked) => setUnlimitedSales(checked as boolean)}
            />
            <Label htmlFor="unlimited-sales" className="text-sm font-normal cursor-pointer">
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
            value={accountantQuota}
            onChange={(e) => setAccountantQuota(e.target.value)}
            disabled={unlimitedAccountant}
            className="w-24"
            min="0"
          />
          <div className="flex items-center gap-2">
            <Checkbox 
              id="unlimited-accountant"
              checked={unlimitedAccountant}
              onCheckedChange={(checked) => setUnlimitedAccountant(checked as boolean)}
            />
            <Label htmlFor="unlimited-accountant" className="text-sm font-normal cursor-pointer">
              Unlimited
            </Label>
          </div>
        </div>
      </div>

      {/* Paid Subscription Fields */}
      {subscriptionType === 'paid' && (
        <>
          <div className="border-t pt-4 mt-4">
            <h4 className="font-medium mb-3">Payment Details</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Subscription Value (₹)</Label>
                <Input
                  type="number"
                  value={subscriptionValue}
                  onChange={(e) => setSubscriptionValue(e.target.value)}
                  min="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Amount Credited (₹)</Label>
                <Input
                  type="number"
                  value={amountCredited}
                  onChange={(e) => setAmountCredited(e.target.value)}
                  min="0"
                />
              </div>
            </div>

            <div className="mt-3 p-3 bg-muted rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount Pending:</span>
                <span className="font-medium text-red-600">₹{calculatePending().toLocaleString()}</span>
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
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>End Date (Auto)</Label>
          <Input
            type="date"
            value={calculateEndDate()}
            disabled
            className="bg-muted"
          />
        </div>
      </div>

      {/* Notes (only for edit mode) */}
      {showSubscriptionDialog && (
        <div className="space-y-2">
          <Label>Notes</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes..."
          />
        </div>
      )}

      {/* Summary */}
      <div className="border-t pt-4 mt-4">
        <h4 className="font-medium mb-2">Summary</h4>
        <div className="text-sm space-y-1 text-muted-foreground">
          <p>Type: <span className="text-foreground capitalize">{subscriptionType}</span></p>
          <p>Validity: <span className="text-foreground">{validityDays === 'lifetime' ? 'Lifetime' : `${validityDays} days`}</span></p>
          <p>Sales Reps: <span className="text-foreground">{unlimitedSales ? 'Unlimited' : salesQuota}</span></p>
          <p>Accountants: <span className="text-foreground">{unlimitedAccountant ? 'Unlimited' : accountantQuota}</span></p>
          {subscriptionType === 'paid' && (
            <p>Value: <span className="text-foreground">₹{parseFloat(subscriptionValue || '0').toLocaleString()}</span></p>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={copyOrgCode}>
            <Copy className="mr-2 h-4 w-4" />
            Copy Org Code
          </DropdownMenuItem>
          
          {/* Manage Subscription - for active organizations */}
          {status === 'active' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={openSubscriptionDialog}>
                <CreditCard className="mr-2 h-4 w-4" />
                Manage Subscription
              </DropdownMenuItem>
            </>
          )}
          
          <DropdownMenuSeparator />
          {status === 'pending' && (
            <>
              <DropdownMenuItem 
                onClick={() => setShowApprovalDialog(true)}
                className="text-green-600"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Approve
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleAction('reject')}
                className="text-red-600"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </DropdownMenuItem>
            </>
          )}
          {status === 'active' && (
            <DropdownMenuItem 
              onClick={() => handleAction('suspend')}
              className="text-yellow-600"
            >
              <Ban className="mr-2 h-4 w-4" />
              Suspend
            </DropdownMenuItem>
          )}
          {status === 'suspended' && (
            <DropdownMenuItem 
              onClick={handleReactivate}
              className="text-green-600"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Reactivate
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={() => setShowDeleteDialog(true)}
            className="text-red-600"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Approval Dialog with Subscription */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Approve Organization</DialogTitle>
            <DialogDescription>
              Configure subscription for <strong>{orgName}</strong>
            </DialogDescription>
          </DialogHeader>
          
          <SubscriptionForm />

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApprovalDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleApproveWithSubscription} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Approve & Create Subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit/Create Subscription Dialog */}
      <Dialog open={showSubscriptionDialog} onOpenChange={setShowSubscriptionDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {existingSubscription ? 'Edit Subscription' : 'Create Subscription'}
            </DialogTitle>
            <DialogDescription>
              {existingSubscription 
                ? `Update subscription for ${orgName}`
                : `Create a new subscription for ${orgName}`
              }
            </DialogDescription>
          </DialogHeader>
          
          {isLoadingSubscription ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <SubscriptionForm />
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubscriptionDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSubscription} disabled={isLoading || isLoadingSubscription}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {existingSubscription ? 'Save Changes' : 'Create Subscription'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{orgName}</strong> and all its users, 
              leads, and data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
