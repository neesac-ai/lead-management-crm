'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CalendarDays, User, Loader2, Clock, Phone, Mail, Building2 } from 'lucide-react'
import { ContactActions } from '@/components/leads/contact-actions'
import { formatDistanceToNow } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

type FollowUp = {
  id: string
  next_followup: string
  comments: string | null
  leads: {
    id: string
    name: string
    email: string | null
    phone: string | null
    custom_fields: { company?: string } | null
  }
}

// Get user's timezone
const getUserTimezone = () => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export default function FollowUpsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userTimezone] = useState(getUserTimezone())

  useEffect(() => {
    fetchFollowUps()
  }, [orgSlug])

  const fetchFollowUps = async () => {
    const supabase = createClient()
    
    // Get org ID from slug
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', orgSlug)
      .single()

    if (org) {
      // Get leads with follow_up_again status
      const { data: leads } = await supabase
        .from('leads')
        .select('id')
        .eq('org_id', org.id)
        .eq('status', 'follow_up_again')

      if (leads && leads.length > 0) {
        const leadIds = leads.map(l => l.id)
        
        // Get activities with next_followup for these leads
        const { data } = await supabase
          .from('lead_activities')
          .select('id, next_followup, comments, leads(id, name, email, phone, custom_fields)')
          .in('lead_id', leadIds)
          .not('next_followup', 'is', null)
          .order('next_followup', { ascending: true })

        setFollowUps((data || []) as FollowUp[])
      }
    }
    setIsLoading(false)
  }

  const isOverdue = (date: string) => new Date(date) < new Date()
  const isToday = (date: string) => {
    const d = new Date(date)
    const today = new Date()
    return d.toDateString() === today.toDateString()
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title="Follow-ups" 
        description="Track leads that need follow-up"
      />
      
      <div className="flex-1 p-4 lg:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Scheduled Follow-ups</CardTitle>
            <CardDescription>Leads marked for follow-up will appear here</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : followUps.length > 0 ? (
              <div className="space-y-3">
                {followUps.map((followUp) => (
                  <div 
                    key={followUp.id} 
                    className={`p-4 rounded-lg border bg-card ${
                      isOverdue(followUp.next_followup) ? 'border-red-500/50 bg-red-500/5' : 
                      isToday(followUp.next_followup) ? 'border-yellow-500/50 bg-yellow-500/5' : ''
                    }`}
                  >
                    {/* Top row: Name + Badge */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate text-lg">{followUp.leads?.name}</p>
                        {followUp.leads?.custom_fields?.company && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            <span className="truncate">{followUp.leads.custom_fields.company}</span>
                          </div>
                        )}
                      </div>
                      {isOverdue(followUp.next_followup) ? (
                        <Badge variant="destructive" className="shrink-0">Overdue</Badge>
                      ) : isToday(followUp.next_followup) ? (
                        <Badge className="bg-yellow-500 shrink-0">Today</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(followUp.next_followup), { addSuffix: true })}
                        </span>
                      )}
                    </div>

                    {/* Contact Details */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-3">
                      {followUp.leads?.phone && (
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          <span>{followUp.leads.phone}</span>
                        </div>
                      )}
                      {followUp.leads?.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          <span className="truncate">{followUp.leads.email}</span>
                        </div>
                      )}
                    </div>

                    {/* Contact Actions */}
                    <div className="mb-3">
                      <ContactActions 
                        phone={followUp.leads?.phone || null}
                        email={followUp.leads?.email || null}
                        name={followUp.leads?.name || ''}
                      />
                    </div>
                    
                    {/* Date/Time */}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span>{formatInTimeZone(new Date(followUp.next_followup), userTimezone, 'MMM d, yyyy')}</span>
                      <span className="font-medium text-foreground">
                        {formatInTimeZone(new Date(followUp.next_followup), userTimezone, 'h:mm a')}
                      </span>
                    </div>
                    
                    {/* Comment */}
                    {followUp.comments && (
                      <p className="text-sm text-muted-foreground bg-muted/50 rounded px-3 py-2">
                        {followUp.comments}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No follow-ups scheduled</p>
                <p className="text-sm">Mark leads for follow-up to see them here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
