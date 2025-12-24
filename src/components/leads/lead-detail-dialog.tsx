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
  Loader2, 
  Mail, 
  Building2, 
  Calendar,
  MessageSquare,
  Clock,
  User,
  Video,
  ExternalLink,
  Package,
  CheckCircle2,
  Phone,
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import { ContactActions } from './contact-actions'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { Product } from '@/types/database.types'

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

// All status options for display
const statusOptions = [
  { value: 'new', label: 'New', color: 'bg-blue-500' },
  { value: 'call_not_picked', label: 'Call Not Picked', color: 'bg-yellow-500' },
  { value: 'not_interested', label: 'Not Interested', color: 'bg-gray-500' },
  { value: 'follow_up_again', label: 'Follow Up Again', color: 'bg-orange-500' },
  { value: 'demo_booked', label: 'Meeting Booked', color: 'bg-purple-500' },
  { value: 'demo_completed', label: 'Meeting Completed', color: 'bg-indigo-500' },
  { value: 'deal_won', label: 'Deal Won', color: 'bg-emerald-500' },
  { value: 'deal_lost', label: 'Deal Lost', color: 'bg-red-500' },
]

// Status options available for selection (excludes 'new' - leads start as new automatically)
const selectableStatusOptions = statusOptions.filter(s => s.value !== 'new')

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
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProductId, setSelectedProductId] = useState<string>('na')
  const [initialStatus, setInitialStatus] = useState<string>('')
  const [initialProductId, setInitialProductId] = useState<string>('na')
  
  // Deal Won fields
  const [dealValue, setDealValue] = useState<string>('')
  const [validity, setValidity] = useState<string>('30')
  const [subscriptionStartDate, setSubscriptionStartDate] = useState<string>('')
  const [amountCredited, setAmountCredited] = useState<string>('')
  const [existingSubscriptionId, setExistingSubscriptionId] = useState<string | null>(null)
  
  // Call recordings
  type CallRecording = {
    id: string
    phone_number: string
    duration_seconds: number | null
    recording_date: string
    summary: string | null
    sentiment: 'positive' | 'neutral' | 'negative' | null
    processing_status: string
    drive_file_url: string | null
  }
  const [callRecordings, setCallRecordings] = useState<CallRecording[]>([])
  const [isLoadingCalls, setIsLoadingCalls] = useState(false)
  
  // Delete state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  
  // Hydration fix for Radix UI
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Calculate end date and pending amount
  const calculateEndDate = (startDate: string, validityDays: string): string => {
    if (!startDate || validityDays === 'lifetime') return ''
    const start = new Date(startDate)
    start.setDate(start.getDate() + parseInt(validityDays))
    return start.toISOString().split('T')[0]
  }
  
  const subscriptionEndDate = validity === 'non_recurring' 
    ? 'Non Recurring' 
    : calculateEndDate(subscriptionStartDate, validity)
  
  const amountPending = dealValue && amountCredited 
    ? Math.max(0, parseFloat(dealValue) - parseFloat(amountCredited || '0'))
    : parseFloat(dealValue || '0')

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
      .select('google_refresh_token, org_id')
      .eq('auth_id', user.id)
      .single()

    setIsGoogleConnected(!!profile?.google_refresh_token)

    // Fetch products for the org - only needed columns
    if (profile?.org_id) {
      const { data: productsData } = await supabase
        .from('products')
        .select('id, name, description')
        .eq('org_id', profile.org_id)
        .eq('is_active', true)
        .order('name')
      
      setProducts((productsData || []) as Product[])
    }
  }

  const fetchLastProduct = async (leadId: string) => {
    const supabase = createClient()
    // Get the most recent activity with a product for this lead
    const { data } = await supabase
      .from('lead_activities')
      .select('product_id')
      .eq('lead_id', leadId)
      .not('product_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (data?.product_id) {
      setSelectedProductId(data.product_id)
      setInitialProductId(data.product_id)
    } else {
      setSelectedProductId('na')
      setInitialProductId('na')
    }
  }

  // Fetch existing subscription for a deal won lead - only needed columns
  const fetchExistingSubscription = async (leadId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('customer_subscriptions')
      .select('id, deal_value, validity_days, start_date, amount_credited')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (data) {
      setExistingSubscriptionId(data.id)
      setDealValue(data.deal_value?.toString() || '')
      setValidity(data.validity_days >= 36500 ? 'non_recurring' : data.validity_days.toString())
      setSubscriptionStartDate(data.start_date || '')
      setAmountCredited(data.amount_credited?.toString() || '0')
    } else {
      setExistingSubscriptionId(null)
    }
  }

  // Fetch call recordings for this lead
  const fetchCallRecordings = async (leadId: string) => {
    setIsLoadingCalls(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('call_recordings')
      .select('id, phone_number, duration_seconds, recording_date, summary, sentiment, processing_status, drive_file_url')
      .eq('lead_id', leadId)
      .order('recording_date', { ascending: false })
      .limit(10)
    
    if (error) {
      console.error('Error fetching call recordings:', error)
    } else {
      setCallRecordings(data || [])
    }
    setIsLoadingCalls(false)
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
      toast.success('Meeting scheduled with Google Meet link!')
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
      setInitialStatus(lead.status)
      setComment('')
      setFollowupDate('')
      setDemoDate('')
      setDemoDuration('30')
      setDemoAttendeeEmail(lead.email || '')
      setMeetLink(null)
      // Reset deal won fields
      setDealValue('')
      setValidity('30')
      setSubscriptionStartDate('')
      setAmountCredited('')
      setExistingSubscriptionId(null)
      
      fetchActivities(lead.id)
      fetchCallRecordings(lead.id)
      checkGoogleConnection()
      // Fetch last product used for this lead
      fetchLastProduct(lead.id)
      
      // If status is deal_won, fetch existing subscription data
      if (lead.status === 'deal_won') {
        fetchExistingSubscription(lead.id)
      }
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
    const productName = selectedProductId && selectedProductId !== 'na' 
      ? products.find(p => p.id === selectedProductId)?.name 
      : null
    
    // Build activity data - only include product_id if products table exists
    // Note: action_type is VARCHAR(50), so keep it short. Put extra info in comments.
    const commentParts: string[] = []
    if (comment) commentParts.push(comment)
    if (productName) commentParts.push(`Product: ${productName}`)
    
    // Add meeting/follow-up date info to comments
    if (status === 'demo_booked' && demoDate) {
      const meetingDateTime = new Date(demoDate)
      commentParts.push(`Meeting: ${meetingDateTime.toLocaleDateString()} ${meetingDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
      commentParts.push(`Duration: ${demoDuration} min`)
    }
    if (status === 'follow_up_again' && followupDate) {
      const followUpDateTime = new Date(followupDate)
      commentParts.push(`Follow-up: ${followUpDateTime.toLocaleDateString()} ${followUpDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
    }
    
    const activityData: Record<string, unknown> = {
      lead_id: lead.id,
      user_id: profile.id,
      action_type: `Status: ${statusLabel}`.substring(0, 50), // Ensure max 50 chars
      comments: commentParts.length > 0 ? commentParts.join(' | ') : null,
    }

    // Only add product_id if a product was selected (and products table/column exists)
    if (selectedProductId && selectedProductId !== 'na' && products.length > 0) {
      activityData.product_id = selectedProductId
    }

    if (followupDate) {
      activityData.next_followup = followupDate
    }

    console.log('Creating activity with data:', activityData)
    const { error: activityError, data: activityResult } = await supabase.from('lead_activities').insert(activityData).select()
    if (activityError) {
      console.error('Failed to create activity:', JSON.stringify(activityError, null, 2))
      console.error('Activity error message:', activityError.message)
      console.error('Activity error details:', activityError.details)
      console.error('Activity error hint:', activityError.hint)
      toast.error(`Activity log failed: ${activityError.message || 'Unknown error'}`)
    } else {
      console.log('Activity created successfully:', activityResult)
    }

    // If demo_booked (Meeting Booked), create a meeting entry and Google Calendar event
    if (status === 'demo_booked' && demoDate) {
      // datetime-local gives "2025-12-25T10:00" - convert to ISO with proper timezone
      // Create a Date object which interprets the datetime-local as local browser time
      const localDate = new Date(demoDate)
      // Store as ISO string (UTC) - this is the correct way to store timestamps
      const scheduledAtISO = localDate.toISOString()
      
      console.log('Storing meeting - input:', demoDate, 'as ISO:', scheduledAtISO)
      
      // First create the demo entry in database
      const { error: demoError } = await supabase.from('demos').insert({
        lead_id: lead.id,
        scheduled_at: scheduledAtISO,
        status: 'scheduled',
      })

      if (demoError) {
        console.error('Error creating demo entry:', demoError)
        toast.error(`Failed to create meeting entry: ${demoError.message}`)
      }

      // Then create Google Calendar event with Meet link
      if (isGoogleConnected) {
        await createCalendarEvent()
      } else {
        toast.info('Connect Google Calendar to automatically create Meet links for demos')
      }
    }

    // If deal_won, create or update subscription entry
    if (status === 'deal_won') {
      if (!dealValue || !subscriptionStartDate) {
        toast.error('Please fill in deal value and start date')
        setIsSaving(false)
        return
      }

      const validityDays = validity === 'non_recurring' ? 36500 : parseInt(validity) // 100 years for non-recurring
      const endDateValue = validity === 'non_recurring' 
        ? new Date(new Date(subscriptionStartDate).getTime() + 36500 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : calculateEndDate(subscriptionStartDate, validity)

      if (existingSubscriptionId) {
        // Update existing subscription
        const { error: subError } = await supabase
          .from('customer_subscriptions')
          .update({
            start_date: subscriptionStartDate,
            end_date: endDateValue,
            validity_days: validityDays,
            deal_value: parseFloat(dealValue),
            amount_credited: parseFloat(amountCredited || '0'),
            notes: validity === 'non_recurring' ? 'Non-recurring subscription' : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingSubscriptionId)

        if (subError) {
          console.error('Failed to update subscription:', subError)
          toast.error('Failed to update subscription')
        } else {
          toast.success('Subscription updated successfully!')
        }
      } else {
        // Get org_id from lead for new subscription
        const { data: leadData } = await supabase
          .from('leads')
          .select('org_id')
          .eq('id', lead.id)
          .single()

        if (leadData?.org_id) {
          const { error: subError } = await supabase
            .from('customer_subscriptions')
            .insert({
              org_id: leadData.org_id,
              lead_id: lead.id,
              start_date: subscriptionStartDate,
              end_date: endDateValue,
              validity_days: validityDays,
              status: 'active',
              deal_value: parseFloat(dealValue),
              amount_credited: parseFloat(amountCredited || '0'),
              // amount_pending is auto-calculated by the database (deal_value - amount_credited)
              notes: validity === 'non_recurring' ? 'Non-recurring subscription' : null,
            })

          if (subError) {
            console.error('Failed to create subscription:', subError)
            toast.error('Lead updated but subscription creation failed')
          } else {
            toast.success('Subscription created successfully!')
          }
        }
      }
    }

    setComment('')
    setFollowupDate('')
    setDemoDate('')
    setSelectedProductId('na')
    setDealValue('')
    setValidity('30')
    setSubscriptionStartDate('')
    setAmountCredited('')
    setIsSaving(false)
    
    // Refresh the leads list
    onUpdate()
    
    // Close the dialog after successful save
    onOpenChange(false)
  }

  const handleDeleteLead = async () => {
    if (!lead) return
    
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || 'Failed to delete lead')
        return
      }

      toast.success('Lead deleted successfully')
      onUpdate()
      onOpenChange(false)
    } catch (error) {
      console.error('Delete error:', error)
      toast.error('Failed to delete lead')
    } finally {
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  if (!lead || !currentLead) return null

  // Use currentLead (which gets refreshed after save) for display
  const currentStatus = statusOptions.find(s => s.value === currentLead.status)
  const selectedStatus = statusOptions.find(s => s.value === status)
  
  // Check if there are unsaved changes
  const hasChanges = status !== initialStatus || 
                     selectedProductId !== initialProductId || 
                     comment.trim() !== '' ||
                     followupDate !== '' ||
                     demoDate !== '' ||
                     (status === 'deal_won' && dealValue !== '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="calls">Calls</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            {/* Lead Info */}
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{currentLead.email || 'No email'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{currentLead.custom_fields?.company || 'No company'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm col-span-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>Added {formatDistanceToNow(new Date(currentLead.created_at), { addSuffix: true })}</span>
                </div>
              </div>
              
              {/* Quick Contact Actions */}
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Quick Actions</p>
                <ContactActions 
                  phone={currentLead.phone} 
                  email={currentLead.email}
                  name={currentLead.name}
                />
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
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Update Status</Label>
                  {mounted ? (
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectableStatusOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${option.color}`} />
                              {option.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="h-10 rounded-md border bg-muted animate-pulse" />
                  )}
                </div>

                {/* Product Selection */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Product Discussed
                  </Label>
                  {mounted ? (
                    <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="na">
                          <span className="text-muted-foreground">N/A - No product</span>
                        </SelectItem>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                  ) : (
                    <div className="h-10 rounded-md border bg-muted animate-pulse" />
                  )}
                  <p className="text-xs text-muted-foreground">
                    Select N/A if no specific product was discussed
                  </p>
                </div>
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

            {/* Meeting Date (shown when status is demo_booked/Meeting Booked) */}
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
                      Meeting Date & Time
                    </Label>
                    <Input
                      type="datetime-local"
                      value={demoDate}
                      onChange={(e) => setDemoDate(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Duration</Label>
                    {mounted ? (
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
                    ) : (
                      <div className="h-10 rounded-md border bg-muted animate-pulse" />
                    )}
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

            {/* Deal Won Fields */}
            {canEditStatus && status === 'deal_won' && (
              <div className="space-y-4 p-4 border rounded-lg bg-green-500/5 border-green-500/20">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">Deal Won - Create Subscription</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Deal Value (₹) *</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 50000"
                      value={dealValue}
                      onChange={(e) => setDealValue(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Validity *</Label>
                    {mounted ? (
                      <Select value={validity} onValueChange={setValidity}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 Days</SelectItem>
                          <SelectItem value="60">60 Days</SelectItem>
                          <SelectItem value="90">90 Days</SelectItem>
                          <SelectItem value="180">180 Days</SelectItem>
                          <SelectItem value="365">365 Days (1 Year)</SelectItem>
                          <SelectItem value="non_recurring">Non Recurring</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="h-10 rounded-md border bg-muted animate-pulse" />
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Start Date *</Label>
                    <Input
                      type="date"
                      value={subscriptionStartDate}
                      onChange={(e) => setSubscriptionStartDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="text"
                      value={subscriptionEndDate}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Amount Credited (₹)</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 25000"
                      value={amountCredited}
                      onChange={(e) => setAmountCredited(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Amount Pending (₹)</Label>
                    <Input
                      type="text"
                      value={`₹${amountPending.toLocaleString()}`}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                </div>
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

          <TabsContent value="calls" className="mt-4">
            {isLoadingCalls ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : callRecordings.length > 0 ? (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {callRecordings.map((call) => {
                  const formatDuration = (seconds: number | null) => {
                    if (!seconds) return '--:--'
                    const mins = Math.floor(seconds / 60)
                    const secs = seconds % 60
                    return `${mins}:${secs.toString().padStart(2, '0')}`
                  }
                  
                  const getSentimentIcon = () => {
                    switch (call.sentiment) {
                      case 'positive': return <TrendingUp className="w-4 h-4 text-green-500" />
                      case 'negative': return <TrendingDown className="w-4 h-4 text-red-500" />
                      default: return <Minus className="w-4 h-4 text-yellow-500" />
                    }
                  }
                  
                  return (
                    <div 
                      key={call.id} 
                      className="p-3 border rounded-lg bg-card"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-sm">
                            {new Date(call.recording_date).toLocaleDateString()}
                          </span>
                          {call.processing_status === 'completed' && getSentimentIcon()}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {formatDuration(call.duration_seconds)}
                          </span>
                          {call.drive_file_url && (
                            <a 
                              href={call.drive_file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                      {call.summary ? (
                        <p className="text-sm text-muted-foreground line-clamp-2">{call.summary}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">
                          {call.processing_status === 'pending' ? 'Pending analysis' : 
                           call.processing_status === 'processing' ? 'Analyzing...' : 
                           call.processing_status === 'failed' ? 'Analysis failed' : 'No summary'}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No call recordings found</p>
                <p className="text-xs mt-1">Sync call recordings from Google Drive</p>
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

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <div className="flex gap-2 flex-1">
            {isAdmin && (
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {canEditStatus && (
              <Button 
                onClick={handleUpdateStatus} 
                disabled={isSaving || !hasChanges}
                variant={hasChanges ? 'default' : 'secondary'}
              >
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
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete Lead?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>This will permanently delete <strong>{currentLead?.name}</strong> and all associated data including:</p>
                <ul className="list-disc list-inside mt-2 text-sm text-muted-foreground">
                  <li>All activities and notes</li>
                  <li>Scheduled demos/meetings</li>
                  <li>Call recordings</li>
                  <li>Subscriptions</li>
                </ul>
                <p className="mt-2 text-red-600 font-medium">This action cannot be undone!</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteLead}
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Lead'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}

