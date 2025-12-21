'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Zap, User, Loader2, Clock, Video, Phone, Mail, Building2 } from 'lucide-react'
import { ContactActions } from '@/components/leads/contact-actions'
import { formatInTimeZone } from 'date-fns-tz'

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
    custom_fields: { company?: string } | null
  }
}

const statusColors: Record<string, string> = {
  scheduled: 'bg-purple-500',
  completed: 'bg-green-500',
  cancelled: 'bg-red-500',
  rescheduled: 'bg-yellow-500',
}

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

  useEffect(() => {
    fetchDemos()
  }, [orgSlug])

  const fetchDemos = async () => {
    const supabase = createClient()
    
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
        
        // Get demos for these leads
        const { data } = await supabase
          .from('demos')
          .select('id, scheduled_at, status, google_meet_link, notes, leads(id, name, email, phone, custom_fields)')
          .in('lead_id', leadIds)
          .order('scheduled_at', { ascending: true })

        setDemos((data || []) as Demo[])
      }
    }
    setIsLoading(false)
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
          <CardHeader>
            <CardTitle>Scheduled Demos</CardTitle>
            <CardDescription>Upcoming demos and meetings with leads</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : demos.length > 0 ? (
              <div className="space-y-3">
                {demos.map((demo) => (
                  <div 
                    key={demo.id} 
                    className={`p-4 rounded-lg border bg-card ${
                      isToday(demo.scheduled_at) && demo.status === 'scheduled' 
                        ? 'border-purple-500/50 bg-purple-500/5' : ''
                    }`}
                  >
                    {/* Top row: Name + Status */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate text-lg">{demo.leads?.name}</p>
                        {demo.leads?.custom_fields?.company && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            <span className="truncate">{demo.leads.custom_fields.company}</span>
                          </div>
                        )}
                      </div>
                      <Badge className={`${statusColors[demo.status] || 'bg-gray-500'} shrink-0`}>
                        {demo.status}
                      </Badge>
                    </div>

                    {/* Contact Details */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-3">
                      {demo.leads?.phone && (
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          <span>{demo.leads.phone}</span>
                        </div>
                      )}
                      {demo.leads?.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          <span className="truncate">{demo.leads.email}</span>
                        </div>
                      )}
                    </div>

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
