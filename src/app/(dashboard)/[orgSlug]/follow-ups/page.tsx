'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CalendarDays, User, Loader2, Clock } from 'lucide-react'
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
      
      <div className="flex-1 p-6">
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
              <div className="space-y-4">
                {followUps.map((followUp) => (
                  <div 
                    key={followUp.id} 
                    className={`flex items-center gap-4 p-4 rounded-lg border bg-card ${
                      isOverdue(followUp.next_followup) ? 'border-red-500/50 bg-red-500/5' : 
                      isToday(followUp.next_followup) ? 'border-yellow-500/50 bg-yellow-500/5' : ''
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{followUp.leads?.name}</p>
                        {followUp.leads?.custom_fields?.company && (
                          <span className="text-sm text-muted-foreground">
                            @ {followUp.leads.custom_fields.company}
                          </span>
                        )}
                      </div>
                      {followUp.comments && (
                        <p className="text-sm text-muted-foreground truncate">{followUp.comments}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {formatInTimeZone(new Date(followUp.next_followup), userTimezone, 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                      {isOverdue(followUp.next_followup) ? (
                        <Badge variant="destructive" className="mt-1">Overdue</Badge>
                      ) : isToday(followUp.next_followup) ? (
                        <Badge className="bg-yellow-500 mt-1">Today</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(followUp.next_followup), { addSuffix: true })}
                        </span>
                      )}
                    </div>
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
