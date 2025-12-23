'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
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
import { Zap, User, Loader2, Clock, Video, Phone, Mail, Building2, UserCircle } from 'lucide-react'
import { ContactActions } from '@/components/leads/contact-actions'
import { formatInTimeZone } from 'date-fns-tz'
import { toast } from 'sonner'

type SalesUser = {
  id: string
  name: string
}

type Demo = {
  id: string
  scheduled_at: string
  status: string
  google_meet_link: string | null
  notes: string | null
  leads: {
    id: string
    name: string
    email: string | null
    phone: string | null
    lead_status: string
    custom_fields: { company?: string } | null
    assigned_to: string | null
    assignee?: { name: string } | null
  }
}

const demoStatusColors: Record<string, string> = {
  scheduled: 'bg-purple-500',
  completed: 'bg-green-500',
  cancelled: 'bg-red-500',
  rescheduled: 'bg-yellow-500',
}

const leadStatusOptions = [
  { value: 'new', label: 'New', color: 'bg-blue-500' },
  { value: 'call_not_picked', label: 'Call Not Picked', color: 'bg-yellow-500' },
  { value: 'not_interested', label: 'Not Interested', color: 'bg-gray-500' },
  { value: 'follow_up_again', label: 'Follow Up Again', color: 'bg-orange-500' },
  { value: 'demo_booked', label: 'Demo Booked', color: 'bg-purple-500' },
  { value: 'demo_completed', label: 'Demo Completed', color: 'bg-indigo-500' },
  { value: 'deal_won', label: 'Deal Won', color: 'bg-emerald-500' },
  { value: 'deal_lost', label: 'Deal Lost', color: 'bg-red-500' },
]

// Get user's timezone
const getUserTimezone = () => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export default function DemosPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  
  const [demos, setDemos] = useState<Demo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userTimezone] = useState(getUserTimezone())
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [salesTeam, setSalesTeam] = useState<SalesUser[]>([])
  const [selectedSalesRep, setSelectedSalesRep] = useState<string>('all')

  useEffect(() => {
    fetchDemos()
  }, [orgSlug])

  const fetchDemos = async () => {
    const supabase = createClient()
    
    // Get current user role
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (authUser) {
      const { data: profile } = await supabase
        .from('users')
        .select('role, org_id')
        .eq('auth_id', authUser.id)
        .single()
      
      if (profile) {
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
          setSalesTeam(teamData || [])
        }
      }
    }
    
    // Get org ID from slug
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', orgSlug)
      .single()

    if (org) {
      // Get leads for this org
      const { data: leads } = await supabase
        .from('leads')
        .select('id')
        .eq('org_id', org.id)

      if (leads && leads.length > 0) {
        const leadIds = leads.map(l => l.id)
        
        // Get demos for these leads with lead status and assignee info
        const { data } = await supabase
          .from('demos')
          .select(`
            id, scheduled_at, status, google_meet_link, notes, 
            leads(id, name, email, phone, status, custom_fields, assigned_to, assignee:users!leads_assigned_to_fkey(name))
          `)
          .in('lead_id', leadIds)
          .order('scheduled_at', { ascending: true })

        // Map the lead status field
        const demosWithStatus = (data || []).map(demo => ({
          ...demo,
          leads: demo.leads ? {
            ...demo.leads,
            lead_status: (demo.leads as unknown as { status: string }).status,
            assignee: (demo.leads as unknown as { assignee: { name: string } | null }).assignee
          } : null
        }))

        setDemos(demosWithStatus as Demo[])
      }
    }
    setIsLoading(false)
  }

  // Filter demos by selected sales rep
  const filteredDemos = useMemo(() => {
    if (!isAdmin || selectedSalesRep === 'all') return demos
    return demos.filter(d => d.leads?.assigned_to === selectedSalesRep)
  }, [demos, isAdmin, selectedSalesRep])

  const handleLeadStatusChange = async (leadId: string, newStatus: string) => {
    setUpdatingStatus(leadId)
    const supabase = createClient()

    const { error } = await supabase
      .from('leads')
      .update({ status: newStatus })
      .eq('id', leadId)

    if (error) {
      toast.error('Failed to update status')
      console.error(error)
    } else {
      toast.success('Status updated')
      fetchDemos()
    }
    setUpdatingStatus(null)
  }

  const isUpcoming = (date: string) => new Date(date) > new Date()
  const isToday = (date: string) => {
    const d = new Date(date)
    const today = new Date()
    return d.toDateString() === today.toDateString()
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title="Demos" 
        description="Manage scheduled demos and meetings"
      />
      
      <div className="flex-1 p-4 lg:p-6">
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Scheduled Demos</CardTitle>
              <CardDescription>Upcoming demos and meetings with leads</CardDescription>
            </div>
            {/* Sales Rep Filter - Admin Only */}
            {isAdmin && salesTeam.length > 0 && (
              <Select value={selectedSalesRep} onValueChange={setSelectedSalesRep}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by rep" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sales Reps</SelectItem>
                  {salesTeam.map((rep) => (
                    <SelectItem key={rep.id} value={rep.id}>{rep.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredDemos.length > 0 ? (
              <div className="space-y-3">
                {filteredDemos.map((demo) => (
                  <div 
                    key={demo.id} 
                    className={`p-4 rounded-lg border bg-card ${
                      isToday(demo.scheduled_at) && demo.status === 'scheduled' 
                        ? 'border-purple-500/50 bg-purple-500/5' : ''
                    }`}
                  >
                    {/* Top row: Phone (primary) + Demo Status */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-primary shrink-0" />
                          <p className="font-semibold truncate text-lg">{demo.leads?.phone}</p>
                        </div>
                        {demo.leads?.name && demo.leads.name !== demo.leads.phone && (
                          <p className="text-sm text-muted-foreground truncate mt-0.5">
                            {demo.leads.name}
                          </p>
                        )}
                        {demo.leads?.custom_fields?.company && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            <span className="truncate">{demo.leads.custom_fields.company}</span>
                          </div>
                        )}
                      </div>
                      <Badge className={`${demoStatusColors[demo.status] || 'bg-gray-500'} shrink-0`}>
                        {demo.status}
                      </Badge>
                    </div>

                    {/* Email */}
                    {demo.leads?.email && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">{demo.leads.email}</span>
                      </div>
                    )}

                    {/* Sales Rep Name - Admin Only */}
                    {isAdmin && demo.leads?.assignee && (
                      <div className="flex items-center gap-1 text-sm text-primary mb-3">
                        <UserCircle className="h-3 w-3" />
                        <span>Assigned to: {demo.leads.assignee.name}</span>
                      </div>
                    )}

                    {/* Contact Actions */}
                    <div className="mb-3">
                      <ContactActions 
                        phone={demo.leads?.phone || null}
                        email={demo.leads?.email || null}
                        name={demo.leads?.name || ''}
                      />
                    </div>
                    
                    {/* Date/Time */}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span>{formatInTimeZone(new Date(demo.scheduled_at), userTimezone, 'MMM d, yyyy')}</span>
                      <span className="font-medium text-foreground">
                        {formatInTimeZone(new Date(demo.scheduled_at), userTimezone, 'h:mm a')}
                      </span>
                    </div>

                    {/* Lead Status Change */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm text-muted-foreground">Lead Status:</span>
                      <Select
                        value={demo.leads?.lead_status || 'demo_booked'}
                        onValueChange={(value) => handleLeadStatusChange(demo.leads?.id, value)}
                        disabled={updatingStatus === demo.leads?.id}
                      >
                        <SelectTrigger className="w-[180px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {leadStatusOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${option.color}`} />
                                {option.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Join button */}
                    {demo.google_meet_link && (
                      <a 
                        href={demo.google_meet_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90"
                      >
                        <Video className="h-4 w-4" />
                        Join Google Meet
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Zap className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No demos scheduled</p>
                <p className="text-sm">Book a demo from a lead to see it here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
