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
  CreditCard, 
  Loader2, 
  Calendar, 
  Clock,
  Pause,
  Play,
  User,
  Phone,
  Mail,
  Building2
} from 'lucide-react'
import { ContactActions } from '@/components/leads/contact-actions'
import { toast } from 'sonner'
import { differenceInDays, format, parseISO } from 'date-fns'

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

      // Fetch subscriptions with lead info
      const { data: subsData, error } = await supabase
        .from('customer_subscriptions')
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

      if (error) {
        console.error('Error fetching subscriptions:', error)
      } else {
        setSubscriptions(subsData || [])
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
    
    // Check if lifetime (validity_days >= 36500)
    if (sub.validity_days >= 36500) {
      return { status: 'active', color: 'bg-green-500', label: 'Lifetime' }
    }
    
    if (endDate >= today) {
      return { status: 'active', color: 'bg-green-500', label: 'Active' }
    } else {
      return { status: 'inactive', color: 'bg-red-500', label: 'Expired' }
    }
  }

  // Calculate days remaining
  function getDaysRemaining(sub: Subscription): { days: number; color: string } {
    // Lifetime subscription
    if (sub.validity_days >= 36500) {
      return { days: -1, color: 'text-green-600' } // -1 means lifetime
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

  // Filter subscriptions
  const filteredSubscriptions = subscriptions.filter(sub => {
    if (filter === 'all') return true
    const status = getSubscriptionStatus(sub)
    return status.status === filter
  })

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
      
      <div className="flex-1 p-4 lg:p-6">
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Customer Subscriptions
              </CardTitle>
              <CardDescription>
                {subscriptions.length} total subscription{subscriptions.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="inactive">Expired</SelectItem>
              </SelectContent>
            </Select>
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
                        <th className="py-3 px-2 font-medium text-center">Actions</th>
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
                                  to {sub.validity_days >= 36500 ? 'Lifetime' : format(parseISO(sub.end_date), 'dd MMM yyyy')}
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
                                {daysInfo.days === -1 ? '∞' : daysInfo.days}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-center">
                              {(isAdmin || userProfile?.role === 'sales') && statusInfo.status !== 'inactive' && (
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
                              {daysInfo.days === -1 ? 'Lifetime' : `${daysInfo.days} days`}
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
                            {format(parseISO(sub.start_date), 'dd MMM')} - {sub.validity_days >= 36500 ? 'Lifetime' : format(parseISO(sub.end_date), 'dd MMM yyyy')}
                          </div>
                          {(isAdmin || userProfile?.role === 'sales') && statusInfo.status !== 'inactive' && (
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
