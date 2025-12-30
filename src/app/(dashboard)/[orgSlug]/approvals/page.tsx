'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Calendar,
  DollarSign,
  Clock,
  User,
  Phone,
  Mail,
  Building2,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'

type Approval = {
  id: string
  org_id: string
  lead_id: string
  subscription_type: string | null
  start_date: string
  end_date: string
  validity_days: number
  deal_value: number
  amount_credited: number
  notes: string | null
  status: string
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  created_at: string
  created_by: string
  leads: {
    name: string
    email: string | null
    phone: string | null
    custom_fields: { company?: string } | null
  } | null
  created_by_user: {
    name: string
    email: string
  } | null
}

export default function ApprovalsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  const supabase = createClient()

  const [approvals, setApprovals] = useState<Approval[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<string>('pending')
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    fetchApprovals()
  }, [orgSlug, filter])

  async function fetchApprovals() {
    try {
      setIsLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('users')
        .select('id, role, org_id')
        .eq('auth_id', user.id)
        .single()

      if (!profile || profile.role !== 'accountant') {
        toast.error('Only accountants can access this page')
        return
      }

      let query = supabase
        .from('subscription_approvals')
        .select(`
          *,
          leads:lead_id (
            name,
            email,
            phone,
            custom_fields
          ),
          created_by_user:created_by (
            name,
            email
          )
        `)
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false })

      if (filter !== 'all') {
        query = query.eq('status', filter)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching approvals:', error)
        toast.error('Failed to load approvals')
        return
      }

      setApprovals((data as Approval[]) || [])
    } catch (error) {
      console.error('Error:', error)
      toast.error('An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleApprove = async (approval: Approval) => {
    setIsProcessing(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Not authenticated')
        return
      }

      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', user.id)
        .single()

      if (!profile) {
        toast.error('User profile not found')
        return
      }

      // Create subscription first
      const { error: createError, data: newSubscription } = await supabase
        .from('customer_subscriptions')
        .insert({
          org_id: approval.org_id,
          lead_id: approval.lead_id,
          start_date: approval.start_date,
          end_date: approval.end_date,
          validity_days: approval.validity_days,
          status: 'active',
          deal_value: approval.deal_value,
          amount_credited: approval.amount_credited,
          notes: approval.notes,
        })
        .select()
        .single()

      if (createError) {
        console.error('Error creating subscription:', createError)
        toast.error('Failed to create subscription')
        return
      }

      // Update approval status after successful subscription creation
      const { error: updateError } = await supabase
        .from('subscription_approvals')
        .update({
          status: 'approved',
          approved_by: profile.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', approval.id)

      if (updateError) {
        console.error('Error updating approval:', updateError)
        // Subscription was created but approval update failed - this is not ideal but subscription exists
        toast.warning('Subscription created but approval status update failed')
      }

      toast.success('Subscription approved and created successfully!')
      fetchApprovals()
    } catch (error) {
      console.error('Error:', error)
      toast.error('An error occurred')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!selectedApproval) return

    setIsProcessing(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Not authenticated')
        return
      }

      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', user.id)
        .single()

      if (!profile) {
        toast.error('User profile not found')
        return
      }

      const { error } = await supabase
        .from('subscription_approvals')
        .update({
          status: 'rejected',
          approved_by: profile.id,
          approved_at: new Date().toISOString(),
          rejection_reason: rejectionReason || null,
        })
        .eq('id', selectedApproval.id)

      if (error) {
        console.error('Error rejecting:', error)
        toast.error('Failed to reject subscription')
        return
      }

      toast.success('Subscription rejected')
      setRejectDialogOpen(false)
      setRejectionReason('')
      setSelectedApproval(null)
      fetchApprovals()
    } catch (error) {
      console.error('Error:', error)
      toast.error('An error occurred')
    } finally {
      setIsProcessing(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const pendingCount = approvals.filter(a => a.status === 'pending').length
  const approvedCount = approvals.filter(a => a.status === 'approved').length
  const rejectedCount = approvals.filter(a => a.status === 'rejected').length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title="Subscription Approvals" 
        description="Review and approve subscription requests"
      />
      
      <div className="flex-1 p-4 lg:p-6 space-y-4">
        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">{pendingCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{approvedCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">{rejectedCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
          >
            All ({approvals.length})
          </Button>
          <Button
            variant={filter === 'pending' ? 'default' : 'outline'}
            onClick={() => setFilter('pending')}
          >
            Pending ({pendingCount})
          </Button>
          <Button
            variant={filter === 'approved' ? 'default' : 'outline'}
            onClick={() => setFilter('approved')}
          >
            Approved ({approvedCount})
          </Button>
          <Button
            variant={filter === 'rejected' ? 'default' : 'outline'}
            onClick={() => setFilter('rejected')}
          >
            Rejected ({rejectedCount})
          </Button>
        </div>

        {/* Approvals List */}
        <div className="grid gap-4">
          {approvals.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No approvals found
              </CardContent>
            </Card>
          ) : (
            approvals.map((approval) => (
              <Card key={approval.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {approval.leads?.name || 'Unknown Lead'}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Created by {approval.created_by_user?.name || 'Unknown'} on{' '}
                        {format(parseISO(approval.created_at), 'MMM d, yyyy h:mm a')}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={
                        approval.status === 'approved'
                          ? 'default'
                          : approval.status === 'rejected'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {approval.status.charAt(0).toUpperCase() + approval.status.slice(1)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Lead Details */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    {approval.leads?.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <span className="truncate">{approval.leads.email}</span>
                      </div>
                    )}
                    {approval.leads?.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span>{approval.leads.phone}</span>
                      </div>
                    )}
                    {approval.leads?.custom_fields?.company && (
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span>{approval.leads.custom_fields.company}</span>
                      </div>
                    )}
                  </div>

                  {/* Subscription Details */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
                    <div>
                      <div className="text-xs text-muted-foreground">Deal Value</div>
                      <div className="text-lg font-semibold">{formatCurrency(approval.deal_value)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Amount Credited</div>
                      <div className="text-lg font-semibold text-green-600">
                        {formatCurrency(approval.amount_credited)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Validity</div>
                      <div className="text-lg font-semibold">
                        {approval.validity_days === 36500 ? 'Non-Recurring' : `${approval.validity_days} days`}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Type</div>
                      <div className="text-lg font-semibold">
                        {approval.subscription_type ? approval.subscription_type.charAt(0).toUpperCase() + approval.subscription_type.slice(1) : 'N/A'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Start Date</div>
                      <div className="font-medium">{format(parseISO(approval.start_date), 'MMM d, yyyy')}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">End Date</div>
                      <div className="font-medium">{format(parseISO(approval.end_date), 'MMM d, yyyy')}</div>
                    </div>
                  </div>

                  {approval.notes && (
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1">Notes</div>
                      <div className="text-sm">{approval.notes}</div>
                    </div>
                  )}

                  {approval.rejection_reason && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="text-xs text-red-600 font-medium mb-1">Rejection Reason</div>
                      <div className="text-sm text-red-700">{approval.rejection_reason}</div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  {approval.status === 'pending' && (
                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={() => handleApprove(approval)}
                        disabled={isProcessing}
                        className="flex-1"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => {
                          setSelectedApproval(approval)
                          setRejectDialogOpen(true)
                        }}
                        disabled={isProcessing}
                        className="flex-1"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Reject
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Subscription</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this subscription request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="rejection-reason">Rejection Reason</Label>
              <Textarea
                id="rejection-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false)
                setRejectionReason('')
                setSelectedApproval(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Rejecting...
                </>
              ) : (
                'Reject'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

