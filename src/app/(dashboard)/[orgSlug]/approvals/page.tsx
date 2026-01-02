'use client'

import { useEffect, useState } from 'react'
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
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
  DollarSign,
  User,
  Mail,
  Phone,
  Building2,
  Clock,
  FileText
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

type Approval = {
  id: string
  lead_id: string
  subscription_type: 'trial' | 'paid' | null
  start_date: string
  end_date: string
  validity_days: number
  deal_value: number
  amount_credited: number
  notes: string | null
  rejection_reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  leads: {
    id: string
    name: string
    email: string | null
    phone: string | null
    custom_fields: { company?: string } | null
    assigned_to: string | null
    assignee?: { name: string } | null
  } | null
  created_by_user?: { name: string; email: string } | null
}

export default function ApprovalsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  const supabase = createClient()

  const [approvals, setApprovals] = useState<Approval[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState<string>('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)

  useEffect(() => {
    fetchApprovals()
  }, [statusFilter, orgSlug])

  async function fetchApprovals() {
    try {
      setIsLoading(true)

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('users')
        .select('id, role, org_id')
        .eq('auth_id', user.id)
        .single()

      if (!profile?.org_id) return

      // Build query
      let query = supabase
        .from('subscription_approvals')
        .select(`
          id,
          lead_id,
          subscription_type,
          start_date,
          end_date,
          validity_days,
          deal_value,
          amount_credited,
          notes,
          rejection_reason,
          status,
          created_at,
          leads (
            id,
            name,
            email,
            phone,
            custom_fields,
            assigned_to,
            assignee:users!leads_assigned_to_fkey (
              name
            )
          ),
          created_by_user:users!subscription_approvals_created_by_fkey (
            name,
            email
          )
        `)
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false })

      // Apply status filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
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
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleApprove(approvalId: string) {
    try {
      setProcessingId(approvalId)

      const response = await fetch(`/api/approvals/${approvalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Failed to approve subscription')
        return
      }

      toast.success('Subscription approved successfully')
      fetchApprovals()
    } catch (error) {
      console.error('Error approving:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setProcessingId(null)
    }
  }

  async function handleReject(approvalId: string) {
    if (!rejectionReason.trim()) {
      toast.error('Please provide a rejection reason')
      return
    }

    try {
      setProcessingId(approvalId)

      const response = await fetch(`/api/approvals/${approvalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          rejection_reason: rejectionReason.trim()
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Failed to reject subscription')
        return
      }

      toast.success('Subscription rejected')
      setRejectionReason('')
      setRejectingId(null)
      fetchApprovals()
    } catch (error) {
      console.error('Error rejecting:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setProcessingId(null)
    }
  }

  const pendingApprovals = approvals.filter(a => a.status === 'pending')
  const approvedApprovals = approvals.filter(a => a.status === 'approved')
  const rejectedApprovals = approvals.filter(a => a.status === 'rejected')

  return (
    <div className="flex flex-col h-screen">
      <Header onRefresh={fetchApprovals} />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Subscription Approvals</h1>
            <p className="text-muted-foreground mt-1">
              Review and approve subscription requests from the sales team
            </p>
          </div>

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{pendingApprovals.length}</div>
                <p className="text-xs text-muted-foreground">Awaiting review</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Approved</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{approvedApprovals.length}</div>
                <p className="text-xs text-muted-foreground">Subscriptions created</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Rejected</CardTitle>
                <XCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{rejectedApprovals.length}</div>
                <p className="text-xs text-muted-foreground">Declined requests</p>
              </CardContent>
            </Card>
          </div>

          {/* Filter */}
          <div className="flex items-center gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Approvals</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Approvals List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : approvals.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                <p className="text-muted-foreground">
                  {statusFilter === 'pending'
                    ? 'No pending approvals'
                    : `No ${statusFilter} approvals`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {approvals.map((approval) => (
                <Card key={approval.id} className={approval.status === 'pending' ? 'border-yellow-500' : ''}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <CardTitle className="text-lg">
                            {approval.leads?.name || 'Unknown Lead'}
                          </CardTitle>
                          <Badge variant={approval.subscription_type === 'paid' ? 'default' : 'secondary'}>
                            {approval.subscription_type || 'N/A'}
                          </Badge>
                          <Badge
                            variant={
                              approval.status === 'approved' ? 'default' :
                              approval.status === 'rejected' ? 'destructive' :
                              'outline'
                            }
                          >
                            {approval.status}
                          </Badge>
                        </div>
                        <CardDescription>
                          Created by {approval.created_by_user?.name || 'Unknown'} • {format(parseISO(approval.created_at), 'MMM d, yyyy h:mm a')}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                      {/* Lead Info */}
                      <div className="space-y-3">
                        <h4 className="font-semibold text-sm">Lead Information</h4>
                        <div className="space-y-2 text-sm">
                          {approval.leads?.email && (
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4 text-muted-foreground" />
                              <span>{approval.leads.email}</span>
                            </div>
                          )}
                          {approval.leads?.phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-muted-foreground" />
                              <span>{approval.leads.phone}</span>
                            </div>
                          )}
                          {approval.leads?.custom_fields?.company && (
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span>{approval.leads.custom_fields.company}</span>
                            </div>
                          )}
                          {approval.leads?.assignee && (
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span>Assigned to: {approval.leads.assignee.name}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Subscription Details */}
                      <div className="space-y-3">
                        <h4 className="font-semibold text-sm">Subscription Details</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span>
                              {format(parseISO(approval.start_date), 'MMM d, yyyy')} - {format(parseISO(approval.end_date), 'MMM d, yyyy')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span>Validity: {approval.validity_days} days</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            <span>Deal Value: ₹{approval.deal_value.toLocaleString()}</span>
                          </div>
                          {approval.amount_credited > 0 && (
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-muted-foreground" />
                              <span>Amount Credited: ₹{approval.amount_credited.toLocaleString()}</span>
                            </div>
                          )}
                          {approval.notes && (
                            <div className="mt-2 p-2 bg-muted rounded text-xs">
                              <strong>Notes:</strong> {approval.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    {approval.status === 'pending' && (
                      <div className="mt-6 pt-4 border-t space-y-4">
                        {rejectingId === approval.id ? (
                          <div className="space-y-2">
                            <Label htmlFor="rejection-reason">Rejection Reason *</Label>
                            <Textarea
                              id="rejection-reason"
                              placeholder="Enter reason for rejection..."
                              value={rejectionReason}
                              onChange={(e) => setRejectionReason(e.target.value)}
                              rows={3}
                            />
                            <div className="flex gap-2">
                              <Button
                                onClick={() => handleReject(approval.id)}
                                variant="destructive"
                                disabled={processingId === approval.id || !rejectionReason.trim()}
                              >
                                {processingId === approval.id ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Rejecting...
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Confirm Reject
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setRejectingId(null)
                                  setRejectionReason('')
                                }}
                                disabled={processingId === approval.id}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleApprove(approval.id)}
                              disabled={processingId === approval.id}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              {processingId === approval.id ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Approving...
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                  Approve
                                </>
                              )}
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => setRejectingId(approval.id)}
                              disabled={processingId === approval.id}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {approval.status === 'rejected' && approval.rejection_reason && (
                      <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                        <strong>Rejection Reason:</strong> {approval.rejection_reason}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

