'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2, XCircle, Clock, User, Phone, Mail, Building2, DollarSign, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'

type Approval = {
  id: string
  lead_id: string
  subscription_type: string | null
  start_date: string
  end_date: string
  validity_days: number
  deal_value: number
  amount_credited: number
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  leads: {
    id: string
    name: string
    email: string | null
    phone: string | null
    custom_fields: { company?: string } | null
  } | null
}

export default function ApprovalsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  const supabase = createClient()

  const [approvals, setApprovals] = useState<Approval[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [processingId, setProcessingId] = useState<string | null>(null)

  useEffect(() => {
    fetchApprovals()
  }, [orgSlug, filter])

  const handleRefresh = async () => {
    setIsLoading(true)
    await fetchApprovals()
    setIsLoading(false)
  }

  async function fetchApprovals() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('users')
        .select('id, role, org_id')
        .eq('auth_id', user.id)
        .single()

      if (!profile) return

      // Get organization
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single()

      if (!orgData) return

      let query = supabase
        .from('subscription_approvals')
        .select(`
          *,
          leads (
            id,
            name,
            email,
            phone,
            custom_fields
          )
        `)
        .eq('org_id', orgData.id)
        .order('created_at', { ascending: false })

      // Filter by status
      if (filter !== 'all') {
        query = query.eq('status', filter)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching approvals:', error)
        toast.error('Failed to load approvals')
        setApprovals([])
      } else {
        setApprovals((data || []) as Approval[])
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to load approvals')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleApproval(approvalId: string, action: 'approve' | 'reject', rejectionReason?: string) {
    setProcessingId(approvalId)
    try {
      const response = await fetch(`/api/approvals/${approvalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, rejection_reason: rejectionReason }),
      })

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || 'Failed to process approval')
        return
      }

      toast.success(`Subscription ${action === 'approve' ? 'approved' : 'rejected'} successfully`)
      fetchApprovals()
    } catch (error) {
      console.error('Error processing approval:', error)
      toast.error('Failed to process approval')
    } finally {
      setProcessingId(null)
    }
  }

  const pendingCount = approvals.filter(a => a.status === 'pending').length
  const approvedCount = approvals.filter(a => a.status === 'approved').length
  const rejectedCount = approvals.filter(a => a.status === 'rejected').length

  return (
    <div className="min-h-screen bg-background">
      <Header 
        title="Pending Approvals"
        description="Review and approve subscription requests"
        onRefresh={handleRefresh}
        isRefreshing={isLoading}
      />
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Subscription Approvals</h1>
            <p className="text-muted-foreground mt-1">
              Review and approve subscription requests from sales team
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{approvals.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Rejected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{rejectedCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All ({approvals.length})
          </Button>
          <Button
            variant={filter === 'pending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('pending')}
          >
            Pending ({pendingCount})
          </Button>
          <Button
            variant={filter === 'approved' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('approved')}
          >
            Approved ({approvedCount})
          </Button>
          <Button
            variant={filter === 'rejected' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('rejected')}
          >
            Rejected ({rejectedCount})
          </Button>
        </div>

        {/* Approvals List */}
        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : approvals.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Clock className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No approvals found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {filter === 'pending' 
                  ? 'No pending approvals at the moment'
                  : `No ${filter} approvals found`}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {approvals.map((approval) => (
              <Card key={approval.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <p className="font-semibold text-lg">
                          {approval.leads?.name || 'Unknown Lead'}
                        </p>
                        {approval.leads?.custom_fields?.company && (
                          <span className="text-muted-foreground">
                            @ {approval.leads.custom_fields.company}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        {approval.leads?.phone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span>{approval.leads.phone}</span>
                          </div>
                        )}
                        {approval.leads?.email && (
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span>{approval.leads.email}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {approval.status === 'pending' && (
                        <Badge className="bg-yellow-500">
                          <Clock className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      )}
                      {approval.status === 'approved' && (
                        <Badge className="bg-green-500">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Approved
                        </Badge>
                      )}
                      {approval.status === 'rejected' && (
                        <Badge className="bg-red-500">
                          <XCircle className="h-3 w-3 mr-1" />
                          Rejected
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 p-4 bg-muted/50 rounded-lg">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Subscription Type</p>
                      <p className="font-medium">
                        {approval.subscription_type ? approval.subscription_type.charAt(0).toUpperCase() + approval.subscription_type.slice(1) : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Deal Value</p>
                      <p className="font-medium flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
                        {approval.deal_value.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Start Date</p>
                      <p className="font-medium flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {format(parseISO(approval.start_date), 'MMM dd, yyyy')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Validity</p>
                      <p className="font-medium">
                        {approval.validity_days >= 36500 ? 'Non-recurring' : `${approval.validity_days} days`}
                      </p>
                    </div>
                  </div>

                  {approval.status === 'pending' && (
                    <div className="flex gap-2 mt-4">
                      <Button
                        onClick={() => handleApproval(approval.id, 'approve')}
                        disabled={processingId === approval.id}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {processingId === approval.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                        )}
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleApproval(approval.id, 'reject')}
                        disabled={processingId === approval.id}
                      >
                        {processingId === approval.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <XCircle className="h-4 w-4 mr-2" />
                        )}
                        Reject
                      </Button>
                    </div>
                  )}

                  <div className="mt-2 text-xs text-muted-foreground">
                    Created: {format(parseISO(approval.created_at), 'MMM dd, yyyy HH:mm')}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

