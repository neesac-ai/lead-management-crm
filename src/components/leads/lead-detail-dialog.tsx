'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Loader2, 
  Phone, 
  Mail, 
  Building2, 
  Calendar,
  MessageSquare,
  Clock,
  User,
  Video,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

type Lead = {
  id: string
  name: string
  email: string | null
  phone: string | null
  source: string
  status: string
  custom_fields: { company?: string } | null
  created_at: string
  assigned_to?: string | null
  assignee?: { name: string } | null
}

type Activity = {
  id: string
  action_type: string
  comments: string | null
  action_date: string
  next_followup: string | null
  created_at: string
  users: { name: string } | null
}

interface LeadDetailDialogProps {
  lead: Lead | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: () => void
  canEditStatus?: boolean // Only sales can edit status
  isAdmin?: boolean // Admin can unassign leads
}

const statusOptions = [
  { value: 'new', label: 'New', color: 'bg-blue-500' },
  { value: 'contacted', label: 'Contacted', color: 'bg-yellow-500' },
  { value: 'qualified', label: 'Qualified', color: 'bg-green-500' },
  { value: 'not_interested', label: 'Not Interested', color: 'bg-gray-500' },
  { value: 'follow_up_again', label: 'Follow Up Again', color: 'bg-orange-500' },
  { value: 'demo_booked', label: 'Demo Booked', color: 'bg-purple-500' },
  { value: 'demo_completed', label: 'Demo Completed', color: 'bg-indigo-500' },
  { value: 'negotiation', label: 'Negotiation', color: 'bg-pink-500' },
  { value: 'deal_won', label: 'Deal Won', color: 'bg-emerald-500' },
  { value: 'deal_lost', label: 'Deal Lost', color: 'bg-red-500' },
]

export function LeadDetailDialog({ lead, open, onOpenChange, onUpdate, canEditStatus = true, isAdmin = false }: LeadDetailDialogProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [isUnassigning, setIsUnassigning] = useState(false)
  const [status, setStatus] = useState('new')
  const [comment, setComment] = useState('')
  const [followupDate, setFollowupDate] = useState('')
  const [demoDate, setDemoDate] = useState('')
  const [demoDuration, setDemoDuration] = useState('30')
  const [demoAttendeeEmail, setDemoAttendeeEmail] = useState('')
  const [activities, setActivities] = useState<Activity[]>([])
  const [isLoadingActivities, setIsLoadingActivities] = useState(false)
  const [currentLead, setCurrentLead] = useState<Lead | null>(lead)
  const [isGoogleConnected, setIsGoogleConnected] = useState<boolean | null>(null)
  const [meetLink, setMeetLink] = useState<string | null>(null)
  const [isCreatingMeet, setIsCreatingMeet] = useState(false)

  const fetchLeadData = async (leadId: string) => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('leads')
      .select('id, name, email, phone, source, status, custom_fields, created_at, assigned_to, assignee:users!assigned_to(name)')
      .eq('id', leadId)
      .single()
    
    if (error) {
      console.error('Error fetching lead:', error)
      return null
    }
    return data as Lead
  }

  const checkGoogleConnection = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('users')
      .select('google_refresh_token')
      .eq('auth_id', user.id)
      .single()

    setIsGoogleConnected(!!profile?.google_refresh_token)
  }

  const connectGoogle = async () => {
    try {
      const response = await fetch('/api/google/auth')
      const data = await response.json()
      if (data.url) {
        // Open in new tab so user doesn't lose their current context
        const popup = window.open(data.url, '_blank', 'noopener,noreferrer')
        if (!popup) {
          toast.error('Please allow popups to connect Google Calendar')
          return
        }
        
        // Poll to check if Google is connected after user completes auth
        toast.info('Complete Google sign-in in the new tab, then return here')
        const checkInterval = setInterval(async () => {
          await checkGoogleConnection()
          if (isGoogleConnected) {
            clearInterval(checkInterval)
            toast.success('Google Calendar connected!')
          }
        }, 2000)
        
        // Stop polling after 2 minutes
        setTimeout(() => clearInterval(checkInterval), 120000)
      } else {
        toast.error('Failed to get Google auth URL')
      }
    } catch {
      toast.error('Failed to connect to Google')
    }
  }

  const createCalendarEvent = async () => {
    if (!lead || !demoDate) return null

    setIsCreatingMeet(true)
    try {
      // Get user's timezone
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      
      const response = await fetch('/api/google/calendar/create-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          leadName: lead.name,
          leadEmail: demoAttendeeEmail || undefined, // Use the editable email field
          demoDate: demoDate,
          duration: parseInt(demoDuration),
          description: comment || undefined,
          timezone: userTimezone, // Send user's timezone for correct scheduling
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.code === 'GOOGLE_NOT_CONNECTED' || data.code === 'TOKEN_EXPIRED') {
          toast.error('Please connect your Google Calendar first')
          setIsGoogleConnected(false)
          return null
        }
        throw new Error(data.error || 'Failed to create calendar event')
      }

      setMeetLink(data.event.meetLink)
      toast.success('Demo scheduled with Google Meet link!')
      return data.event
    } catch (error) {
      console.error('Error creating calendar event:', error)
      toast.error('Failed to create Google Calendar event')
      return null
    } finally {
      setIsCreatingMeet(false)
    }
  }

  const fetchActivities = async (leadId: string) => {
    setIsLoadingActivities(true)
    
    const supabase = createClient()
    const { data, error } = await supabase
      .from('lead_activities')
      .select('id, action_type, comments, action_date, next_followup, created_at, users!user_id(name)')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching activities:', error)
    }
    setActivities((data || []) as Activity[])
    setIsLoadingActivities(false)
  }

  // Sync status and fetch activities when dialog opens or lead changes
  useEffect(() => {
    if (open && lead) {
      console.log('Dialog opened for lead:', lead.id, 'status:', lead.status)
      setCurrentLead(lead)
      setStatus(lead.status)
      setComment('')
      setFollowupDate('')
      setDemoDate('')
      setDemoDuration('30')
      setDemoAttendeeEmail(lead.email || '')
      setMeetLink(null)
      fetchActivities(lead.id)
      checkGoogleConnection()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id])

  const handleUnassign = async () => {
    if (!lead) return
    setIsUnassigning(true)

    const supabase = createClient()
    
    const { error } = await supabase
      .from('leads')
      .update({ assigned_to: null, updated_at: new Date().toISOString() })
      .eq('id', lead.id)

    if (error) {
      toast.error('Failed to unassign lead')
    } else {
      toast.success('Lead unassigned successfully')
      onUpdate()
      onOpenChange(false)
    }
    setIsUnassigning(false)
  }

  const handleUpdateStatus = async () => {
    if (!lead) return
    setIsSaving(true)

    const supabase = createClient()
    
    // Update lead status
    const { error: leadError } = await supabase
      .from('leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', lead.id)

    if (leadError) {
      toast.error('Failed to update status')
      setIsSaving(false)
      return
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('Not authenticated')
      setIsSaving(false)
      return
    }

    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single()

    if (!profile) {
      toast.error('User profile not found')
      setIsSaving(false)
      return
    }

    // Add activity log
    const statusLabel = statusOptions.find(s => s.value === status)?.label || status
    const activityData: {
      lead_id: string
      user_id: string
      action_type: string
      comments: string | null
      next_followup?: string
    } = {
      lead_id: lead.id,
      user_id: profile.id,
      action_type: `Status changed to ${statusLabel}`,
      comments: comment || null,
    }

    if (followupDate) {
      activityData.next_followup = followupDate
    }

    console.log('Creating activity with data:', activityData)
    const { error: activityError, data: activityResult } = await supabase.from('lead_activities').insert(activityData).select()
    if (activityError) {
      console.error('Failed to create activity:', activityError)
      toast.error('Status updated but activity log failed')
    } else {
      console.log('Activity created successfully:', activityResult)
    }

    // If demo_booked, create a demo entry and Google Calendar event
    if (status === 'demo_booked' && demoDate) {
      // Convert datetime-local value to proper ISO string with timezone
      // datetime-local gives "2025-12-21T01:30", we need to treat it as local time
      const localDate = new Date(demoDate)
      const isoWithTimezone = localDate.toISOString() // Converts to UTC properly
      
      // First create the demo entry in database
      const { error: demoError } = await supabase.from('demos').insert({
        lead_id: lead.id,
        scheduled_at: isoWithTimezone,
        status: 'scheduled',
      })

      if (demoError) {
        console.error('Error creating demo entry:', demoError)
      }

      // Then create Google Calendar event with Meet link
      if (isGoogleConnected) {
        await createCalendarEvent()
      } else {
        toast.info('Connect Google Calendar to automatically create Meet links for demos')
      }
    }

    toast.success('Lead updated successfully')
    setComment('')
    setFollowupDate('')
    setDemoDate('')
    setIsSaving(false)
    
    // Refresh lead data and activities
    if (lead) {
      const updatedLead = await fetchLeadData(lead.id)
      if (updatedLead) {
        setCurrentLead(updatedLead)
        setStatus(updatedLead.status) // Update the dropdown to show new status
      }
      fetchActivities(lead.id)
    }
    onUpdate()
  }

  if (!lead || !currentLead) return null

  // Use currentLead (which gets refreshed after save) for display
  const currentStatus = statusOptions.find(s => s.value === currentLead.status)
  const selectedStatus = statusOptions.find(s => s.value === status)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {currentLead.name}
            {currentLead.custom_fields?.company && (
              <span className="text-muted-foreground font-normal text-base">
                @ {currentLead.custom_fields.company}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            View and update lead details
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Details & Actions</TabsTrigger>
            <TabsTrigger value="history">Activity History</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            {/* Lead Info */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{currentLead.email || 'No email'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{currentLead.phone || 'No phone'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span>{currentLead.custom_fields?.company || 'No company'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Added {formatDistanceToNow(new Date(currentLead.created_at), { addSuffix: true })}</span>
              </div>
            </div>

            {/* Current Status */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Current Status:</span>
              <Badge className={currentStatus?.color}>
                {currentStatus?.label}
              </Badge>
            </div>

            {/* Assignment Info & Unassign Button (Admin Only) */}
            {isAdmin && currentLead.assigned_to && (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Assigned to: <strong>{currentLead.assignee?.name || 'Unknown'}</strong>
                  </span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleUnassign}
                  disabled={isUnassigning}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  {isUnassigning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Unassign'
                  )}
                </Button>
              </div>
            )}

            {/* Unassigned Notice for Admin */}
            {isAdmin && !currentLead.assigned_to && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-sm text-yellow-600">
                  This lead is not assigned. Go to Lead Assignment to assign it to a sales person.
                </p>
              </div>
            )}

            {/* Update Status - Only for Sales */}
            {canEditStatus ? (
              <div className="space-y-2">
                <Label>Update Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
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
            ) : (
              <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                <p>Status changes can only be made by the assigned sales person.</p>
              </div>
            )}

            {/* Follow-up Date (shown when status is follow_up_again) */}
            {canEditStatus && status === 'follow_up_again' && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Follow-up Date
                </Label>
                <Input
                  type="datetime-local"
                  value={followupDate}
                  onChange={(e) => setFollowupDate(e.target.value)}
                />
              </div>
            )}

            {/* Demo Date (shown when status is demo_booked) */}
            {canEditStatus && status === 'demo_booked' && (
              <div className="space-y-4 p-4 border rounded-lg bg-purple-500/5 border-purple-500/20">
                <div className="flex items-center gap-2 text-purple-600">
                  <Video className="h-4 w-4" />
                  <span className="font-medium">Schedule Demo with Google Meet</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Demo Date & Time
                    </Label>
                    <Input
                      type="datetime-local"
                      value={demoDate}
                      onChange={(e) => setDemoDate(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Duration</Label>
                    <Select value={demoDuration} onValueChange={setDemoDuration}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="45">45 minutes</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="90">1.5 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Attendee Email */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Attendee Email (for calendar invite)
                  </Label>
                  <Input
                    type="email"
                    placeholder="Enter email to send calendar invite"
                    value={demoAttendeeEmail}
                    onChange={(e) => setDemoAttendeeEmail(e.target.value)}
                  />
                  {currentLead?.email && demoAttendeeEmail !== currentLead.email && (
                    <p className="text-xs text-muted-foreground">
                      Lead&apos;s saved email: {currentLead.email}
                      <button
                        type="button"
                        className="ml-2 text-primary hover:underline"
                        onClick={() => setDemoAttendeeEmail(currentLead.email || '')}
                      >
                        Use this
                      </button>
                    </p>
                  )}
                  {!demoAttendeeEmail && (
                    <p className="text-xs text-yellow-600">
                      No email provided - Meet link will be created but no invite sent
                    </p>
                  )}
                </div>

                {/* Google Calendar Connection Status */}
                {isGoogleConnected === false && (
                  <div className="flex items-center justify-between p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <div className="text-sm text-yellow-600">
                      Connect Google Calendar to create Meet links automatically
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={checkGoogleConnection}
                        className="text-yellow-600 hover:bg-yellow-50"
                      >
                        Refresh
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={connectGoogle}
                        className="border-yellow-500 text-yellow-600 hover:bg-yellow-50"
                      >
                        Connect Google
                      </Button>
                    </div>
                  </div>
                )}

                {isGoogleConnected === true && !meetLink && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    Google Calendar connected - Meet link will be created on save
                  </div>
                )}

                {meetLink && (
                  <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-600">Meet Link Created</span>
                    </div>
                    <a
                      href={meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      Open Meet <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}

                {isCreatingMeet && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating Google Meet link...
                  </div>
                )}
              </div>
            )}

            {/* Comments - Only for Sales */}
            {canEditStatus && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Comments
                </Label>
                <Textarea
                  placeholder="Add notes about this action..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {isLoadingActivities ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : activities.length > 0 ? (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {activities.map((activity) => (
                  <div 
                    key={activity.id} 
                    className="p-3 border rounded-lg bg-card"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{activity.action_type}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    {activity.comments && (
                      <p className="text-sm text-muted-foreground">{activity.comments}</p>
                    )}
                    {activity.next_followup && (
                      <p className="text-xs text-primary mt-1">
                        Follow-up: {new Date(activity.next_followup).toLocaleString()}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      By {activity.users?.name || 'Unknown'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No activity recorded yet</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {canEditStatus && (
            <Button onClick={handleUpdateStatus} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

