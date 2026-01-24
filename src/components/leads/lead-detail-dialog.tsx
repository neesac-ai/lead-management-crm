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
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react'
import { ContactActions } from './contact-actions'
// Location tracking (lead-linked check-ins/history) removed - team member tracking only
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { Product } from '@/types/database.types'
import { getLeadStatuses, getStatusOptions } from '@/lib/lead-statuses'

type Lead = {
  id: string
  name: string
  email: string | null
  phone: string | null
  source: string
  status: string
  subscription_type?: string | null
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

export function LeadDetailDialog({ lead, open, onOpenChange, onUpdate, canEditStatus = true, isAdmin = false }: LeadDetailDialogProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [statusOptions, setStatusOptions] = useState<Array<{ value: string; label: string; color: string }>>([])
  const [selectableStatusOptions, setSelectableStatusOptions] = useState<Array<{ value: string; label: string; color: string }>>([])
  const [isUnassigning, setIsUnassigning] = useState(false)
  const [status, setStatus] = useState('new')
  const [subscriptionType, setSubscriptionType] = useState<string>('')
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
  // Note: Call recordings (Google Drive sync) removed - using native call tracking only

  // Call logs (from native tracking)
  type CallLog = {
    id: string
    phone_number: string
    call_direction: string
    call_status: string
    call_started_at: string
    call_ended_at: string | null
    duration_seconds: number
    talk_time_seconds: number | null
    ring_duration_seconds: number | null
    users?: { name: string; email: string } | null
  }
  const [callLogs, setCallLogs] = useState<CallLog[]>([])
  const [isLoadingCallLogs, setIsLoadingCallLogs] = useState(false)

  // Note: Lead-linked location history removed (team member tracking only)

  // Delete state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [editFormData, setEditFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    source: 'manual',
  })

  // Hydration fix for Radix UI
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Fetch lead statuses
  useEffect(() => {
    const loadStatuses = async () => {
      const statuses = await getLeadStatuses()
      const allOptions = statuses.map(s => ({
        value: s.status_value,
        label: s.label,
        color: s.color,
      }))
      setStatusOptions(allOptions)
      setSelectableStatusOptions(allOptions.filter(s => s.value !== 'new'))
    }
    if (open) {
      loadStatuses()
    }

    // Listen for status updates
    const handleStatusUpdate = () => {
      if (open) {
        loadStatuses()
      }
    }
    window.addEventListener('lead-statuses-updated', handleStatusUpdate)

    return () => {
      window.removeEventListener('lead-statuses-updated', handleStatusUpdate)
    }
  }, [open])

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
      .select('id, name, email, phone, source, status, subscription_type, custom_fields, created_at, assigned_to')
      .eq('id', leadId)
      .single()

    if (error) {
      console.error('Error fetching lead:', error)
      return null
    }

    // Fetch assignee name separately if needed
    let assignee = null
    if (data.assigned_to) {
      const { data: assigneeData } = await supabase
        .from('users')
        .select('name')
        .eq('id', data.assigned_to)
        .single()
      assignee = assigneeData ? { name: assigneeData.name } : null
    }

    return {
      ...data,
      assignee,
    } as Lead
  }

  const refreshLeadData = async () => {
    if (!lead?.id) return
    const updatedLead = await fetchLeadData(lead.id)
    if (updatedLead) {
      setCurrentLead(updatedLead)
    }
    // Refresh call logs
    await fetchCallLogs(lead.id)
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

  // Note: fetchCallRecordings removed - using native call tracking only

  const fetchCallLogs = async (leadId: string) => {
    setIsLoadingCallLogs(true)
    try {
      const response = await fetch(`/api/calls/${leadId}`)
      if (response.ok) {
        const data = await response.json()
        setCallLogs(data.call_logs || [])
      } else {
        console.error('Error fetching call logs:', response.statusText)
        setCallLogs([])
      }
    } catch (error) {
      console.error('Error fetching call logs:', error)
      setCallLogs([])
    } finally {
      setIsLoadingCallLogs(false)
    }
  }

  const fetchLocationHistory = async (leadId: string) => {
    setIsLoadingLocations(true)
    try {
      const response = await fetch(`/api/locations/${leadId}`)
      if (response.ok) {
        const data = await response.json()
        setLocationHistory(data.locations || [])
      } else {
        console.error('Error fetching location history:', response.statusText)
        setLocationHistory([])
      }
    } catch (error) {
      console.error('Error fetching location history:', error)
      setLocationHistory([])
    } finally {
      setIsLoadingLocations(false)
    }
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
    console.log('[LEAD DIALOG] fetchActivities called for leadId:', leadId)

    const supabase = createClient()
    // First fetch activities without foreign key relationship
    console.log('[LEAD DIALOG] Querying lead_activities table...')
    const { data: activitiesData, error } = await supabase
      .from('lead_activities')
      .select('id, action_type, comments, action_date, next_followup, created_at, user_id')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[LEAD DIALOG] ❌ ERROR fetching activities:', error)
      console.error('[LEAD DIALOG] Error code:', error.code)
      console.error('[LEAD DIALOG] Error message:', error.message)
      console.error('[LEAD DIALOG] Error details:', JSON.stringify(error, null, 2))
      setActivities([])
      setIsLoadingActivities(false)
      return
    }

    console.log('[LEAD DIALOG] ✅ Activities fetched:', activitiesData?.length || 0)

    // Fetch user names separately
    const userIds = new Set<string>()
    activitiesData?.forEach(activity => {
      if (activity.user_id) userIds.add(activity.user_id)
    })

    let userMap: Record<string, { name: string }> = {}
    if (userIds.size > 0) {
      console.log('[LEAD DIALOG] Querying users table for', userIds.size, 'user IDs...')
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, name')
        .in('id', Array.from(userIds))

      if (usersError) {
        console.error('[LEAD DIALOG] ❌ ERROR fetching users:', usersError)
      } else {
        console.log('[LEAD DIALOG] ✅ Users fetched:', usersData?.length || 0)
      }

      if (usersData) {
        usersData.forEach(user => {
          userMap[user.id] = { name: user.name }
        })
      }
    }

    // Map activities with user data
    const activitiesWithUsers = (activitiesData || []).map(activity => ({
      ...activity,
      users: activity.user_id ? (userMap[activity.user_id] || null) : null,
    }))

    console.log('[LEAD DIALOG] ✅ Setting activities:', activitiesWithUsers.length)
    setActivities(activitiesWithUsers as Activity[])
    setIsLoadingActivities(false)
  }

  // Sync status and fetch activities when dialog opens or lead changes
  useEffect(() => {
    if (open && lead) {
      console.log('Dialog opened for lead:', lead.id, 'status:', lead.status)
      setCurrentLead(lead)
      setStatus(lead.status)
      setInitialStatus(lead.status)
      setSubscriptionType(lead.subscription_type || '')
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

      // Initialize edit form data
      setEditFormData({
        name: lead.name || '',
        email: lead.email || '',
        phone: lead.phone || '',
        company: lead.custom_fields?.company || '',
        source: lead.source || 'manual',
      })
      setIsEditMode(false)

      fetchActivities(lead.id)
      fetchCallLogs(lead.id)
      checkGoogleConnection()
      // Fetch last product used for this lead
      fetchLastProduct(lead.id)

      // Note: Removed fetchExistingSubscription to allow multiple subscriptions per lead
      // Users can now create multiple subscriptions for the same lead
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id])

  // Listen for call logged events to refresh call logs
  useEffect(() => {
    const handleCallLogged = (event: CustomEvent<{ leadId: string }>) => {
      if (lead?.id && event.detail.leadId === lead.id) {
        console.log('[LEAD_DETAIL] Refreshing call logs after call logged event')
        fetchCallLogs(lead.id)
      }
    }

    window.addEventListener('callLogged', handleCallLogged as EventListener)

    // Also refresh call logs when dialog opens (in case event was missed)
    if (open && lead?.id) {
      console.log('[LEAD_DETAIL] Dialog opened, fetching call logs for lead:', lead.id)
      fetchCallLogs(lead.id)
    }

    return () => {
      window.removeEventListener('callLogged', handleCallLogged as EventListener)
    }
  }, [lead?.id, open])

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

    // Validate Deal Won requires subscription type
    if (status === 'deal_won' && !subscriptionType) {
      toast.error('Please select a subscription type (Trial or Paid)')
      return
    }

    if (status === 'deal_won' && !dealValue) {
      toast.error('Please enter the deal value')
      return
    }

    setIsSaving(true)

    const supabase = createClient()

    // Build update data - only include subscription_type if it's a valid value
    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString()
    }

    // Only include subscription_type if it's trial or paid (valid values)
    if (subscriptionType === 'trial' || subscriptionType === 'paid') {
      updateData.subscription_type = subscriptionType
    }

    console.log('Updating lead with data:', updateData)

    const { error: leadError, data: updateResult } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', lead.id)
      .select()

    console.log('Update result:', updateResult, 'Error:', leadError)

    if (leadError) {
      console.error('Failed to update lead:', JSON.stringify(leadError, null, 2))
      toast.error(`Failed to update status: ${leadError.message || 'Unknown error'}`)
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
    if (subscriptionType && subscriptionType !== lead.subscription_type) {
      commentParts.push(`Subscription: ${subscriptionType.charAt(0).toUpperCase() + subscriptionType.slice(1)}`)
    }

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

      // Always create a new subscription (allow multiple subscriptions per lead)
      // Get org_id from lead for new subscription
      const { data: leadData } = await supabase
        .from('leads')
        .select('org_id')
        .eq('id', lead.id)
        .single()

      if (leadData?.org_id) {
        // Always create a new approval entry (allow multiple subscriptions per lead)
        // Include product_id if a product was selected
        const approvalData: Record<string, unknown> = {
          org_id: leadData.org_id,
          lead_id: lead.id,
          subscription_type: subscriptionType,
          start_date: subscriptionStartDate,
          end_date: endDateValue,
          validity_days: validityDays,
          deal_value: parseFloat(dealValue),
          amount_credited: parseFloat(amountCredited || '0'),
          notes: validity === 'non_recurring' ? 'Non-recurring subscription' : null,
          status: 'pending',
          created_by: profile.id,
        }

        // Add product_id if a product was selected (and not 'na')
        if (selectedProductId && selectedProductId !== 'na') {
          approvalData.product_id = selectedProductId
        }

        const { error: approvalError } = await supabase
          .from('subscription_approvals')
          .insert(approvalData)

        if (approvalError) {
          console.error('Failed to create approval:', approvalError)
          toast.error('Lead updated but approval creation failed')
        } else {
          toast.success('Subscription approval request created! Waiting for accountant approval.')
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
    (status === 'deal_won' && dealValue !== '' && subscriptionType !== '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full sm:max-w-2xl sm:max-h-[90vh] p-4 sm:p-6">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {isEditMode ? 'Edit Lead' : currentLead.name}
              {!isEditMode && currentLead.custom_fields?.company && (
                <span className="text-muted-foreground font-normal text-base">
                  @ {currentLead.custom_fields.company}
                </span>
              )}
            </DialogTitle>
            {(isAdmin || canEditStatus) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (isEditMode) {
                    // Cancel edit - reset form
                    setEditFormData({
                      name: currentLead.name || '',
                      email: currentLead.email || '',
                      phone: currentLead.phone || '',
                      company: currentLead.custom_fields?.company || '',
                      source: currentLead.source || 'manual',
                    })
                  }
                  setIsEditMode(!isEditMode)
                }}
              >
                {isEditMode ? 'Cancel' : 'Edit'}
              </Button>
            )}
          </div>
          <DialogDescription>
            {isEditMode ? 'Edit lead information' : 'View and update lead details'}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="mt-4">
          <TabsList className="grid w-full grid-cols-3 h-auto py-2 sm:py-1">
            <TabsTrigger value="details" className="text-xs sm:text-sm px-2 sm:px-4">Details</TabsTrigger>
            <TabsTrigger value="calls" className="text-xs sm:text-sm px-2 sm:px-4">Calls</TabsTrigger>
            <TabsTrigger value="history" className="text-xs sm:text-sm px-2 sm:px-4">History</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            {/* Edit Mode - Lead Info Form */}
            {isEditMode ? (
              <div className="space-y-4 p-4 border rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-phone">Phone *</Label>
                    <Input
                      id="edit-phone"
                      type="tel"
                      value={editFormData.phone}
                      onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                      placeholder="+91 98765 43210"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Name</Label>
                    <Input
                      id="edit-name"
                      value={editFormData.name}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      placeholder="John Doe"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-company">Company</Label>
                    <Input
                      id="edit-company"
                      value={editFormData.company}
                      onChange={(e) => setEditFormData({ ...editFormData, company: e.target.value })}
                      placeholder="Acme Inc."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-email">Email</Label>
                    <Input
                      id="edit-email"
                      type="email"
                      value={editFormData.email}
                      onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                      placeholder="john@example.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-source">Source</Label>
                  {mounted ? (
                    <Select value={editFormData.source} onValueChange={(value) => setEditFormData({ ...editFormData, source: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="linkedin">LinkedIn</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="google">Google Ads</SelectItem>
                        <SelectItem value="website">Website</SelectItem>
                        <SelectItem value="referral">Referral</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="h-10 rounded-md border bg-muted animate-pulse" />
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={async () => {
                      if (!editFormData.phone.trim()) {
                        toast.error('Phone number is required')
                        return
                      }

                      setIsSavingEdit(true)
                      try {
                        const response = await fetch(`/api/leads/${lead.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            name: editFormData.name.trim(),
                            email: editFormData.email.trim() || null,
                            phone: editFormData.phone.trim() || null,
                            source: editFormData.source,
                            custom_fields: {
                              company: editFormData.company.trim() || undefined,
                            },
                          }),
                        })

                        if (!response.ok) {
                          // Try to parse error response, but handle cases where response might not be JSON
                          let errorMessage = 'Failed to update lead'
                          try {
                            const contentType = response.headers.get('content-type')
                            if (contentType && contentType.includes('application/json')) {
                              const data = await response.json()
                              errorMessage = data.error || data.message || errorMessage
                            } else {
                              const text = await response.text()
                              errorMessage = text || errorMessage
                            }
                          } catch (parseError) {
                            // If parsing fails, use status text or default message
                            errorMessage = response.statusText || errorMessage
                          }
                          throw new Error(errorMessage)
                        }

                        const data = await response.json()
                        toast.success('Lead updated successfully')

                        // Refresh lead data to get the latest from database
                        await refreshLeadData()

                        setIsEditMode(false)
                        onUpdate()
                      } catch (error) {
                        console.error('Error updating lead:', error)
                        toast.error(error instanceof Error ? error.message : 'Failed to update lead')
                      } finally {
                        setIsSavingEdit(false)
                      }
                    }}
                    disabled={isSavingEdit || !editFormData.phone.trim()}
                  >
                    {isSavingEdit ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditFormData({
                        name: currentLead.name || '',
                        email: currentLead.email || '',
                        phone: currentLead.phone || '',
                        company: currentLead.custom_fields?.company || '',
                        source: currentLead.source || 'manual',
                      })
                      setIsEditMode(false)
                    }}
                    disabled={isSavingEdit}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              /* View Mode - Lead Info Display */
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
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{currentLead.phone || 'No phone'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Source:</span>
                    <Badge variant="outline">{currentLead.source || 'manual'}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm col-span-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Added {formatDistanceToNow(new Date(currentLead.created_at), { addSuffix: true })}</span>
                  </div>
                </div>

                {/* Quick Contact Actions */}
                <div className="pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">Quick Actions</p>
                  <div className="space-y-2">
                    <ContactActions
                      phone={currentLead.phone}
                      email={currentLead.email}
                      name={currentLead.name}
                      leadId={currentLead.id}
                    />
                    {/* Lead-linked check-in removed (team member tracking only) */}
                  </div>
                </div>
              </div>
            )}

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

                {/* Subscription Type Selection - Required for Deal Won */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Subscription Type *
                    </Label>
                    {mounted ? (
                      <Select
                        value={subscriptionType || ''}
                        onValueChange={(value) => {
                          setSubscriptionType(value)
                          // Reset validity when subscription type changes
                          if (value === 'trial') {
                            setValidity('7')
                          } else if (value === 'paid') {
                            setValidity('30')
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="trial">Trial</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="h-10 rounded-md border bg-muted animate-pulse" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Validity *</Label>
                    {mounted ? (
                      <Select value={validity} onValueChange={setValidity} disabled={!subscriptionType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select validity" />
                        </SelectTrigger>
                        <SelectContent>
                          {subscriptionType === 'trial' ? (
                            <>
                              <SelectItem value="7">7 Days</SelectItem>
                              <SelectItem value="14">14 Days</SelectItem>
                            </>
                          ) : subscriptionType === 'paid' ? (
                            <>
                              <SelectItem value="30">30 Days</SelectItem>
                              <SelectItem value="60">60 Days</SelectItem>
                              <SelectItem value="90">90 Days</SelectItem>
                              <SelectItem value="180">180 Days</SelectItem>
                              <SelectItem value="365">365 Days (1 Year)</SelectItem>
                              <SelectItem value="non_recurring">Non Recurring</SelectItem>
                            </>
                          ) : (
                            <SelectItem value="placeholder" disabled>Select subscription type first</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="h-10 rounded-md border bg-muted animate-pulse" />
                    )}
                  </div>
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
                    <Label>Amount Credited (₹)</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 25000"
                      value={amountCredited}
                      onChange={(e) => setAmountCredited(e.target.value)}
                    />
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

                <div className="space-y-2">
                  <Label>Amount Pending (₹)</Label>
                  <Input
                    type="text"
                    value={`₹${amountPending.toLocaleString()}`}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Auto-calculated: Deal Value - Amount Credited
                  </p>
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

          <TabsContent value="calls" className="mt-4 space-y-4 sm:space-y-6">
            {/* Call Logs (Native Tracking) */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold mb-2 sm:mb-3 flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Call Tracking
              </h3>
              {isLoadingCallLogs ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : callLogs.length > 0 ? (
                <div className="space-y-2 sm:space-y-3 max-h-[300px] overflow-y-auto">
                  {callLogs.map((log) => {
                    const formatDuration = (seconds: number) => {
                      const mins = Math.floor(seconds / 60)
                      const secs = seconds % 60
                      return `${mins}:${secs.toString().padStart(2, '0')}`
                    }

                    const getDirectionIcon = () => {
                      return log.call_direction === 'outgoing' ? (
                        <ArrowUpRight className="w-4 h-4 text-green-500" />
                      ) : (
                        <ArrowDownLeft className="w-4 h-4 text-blue-500" />
                      )
                    }

                    const getStatusColor = () => {
                      switch (log.call_status) {
                        case 'completed': return 'bg-green-500/10 text-green-600 border-green-500/20'
                        case 'missed': return 'bg-orange-500/10 text-orange-600 border-orange-500/20'
                        case 'rejected': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                        case 'failed': return 'bg-red-500/10 text-red-600 border-red-500/20'
                        case 'busy': return 'bg-purple-500/10 text-purple-600 border-purple-500/20'
                        case 'blocked': return 'bg-gray-500/10 text-gray-600 border-gray-500/20'
                        default: return 'bg-gray-500/10 text-gray-600 border-gray-500/20'
                      }
                    }

                    const getStatusLabel = () => {
                      switch (log.call_status) {
                        case 'completed': return 'Completed'
                        case 'missed': return 'Not Picked'
                        case 'rejected': return 'Rejected'
                        case 'failed': return 'Failed'
                        case 'busy': return 'Busy'
                        case 'blocked': return 'Blocked'
                        default: return log.call_status
                      }
                    }

                    return (
                      <div
                        key={log.id}
                        className="p-3 sm:p-4 border rounded-lg bg-card space-y-1"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getDirectionIcon()}
                            <span className="font-medium text-sm">{log.phone_number}</span>
                            <Badge variant="outline" className={`text-xs ${getStatusColor()}`}>
                              {getStatusLabel()}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDuration(log.duration_seconds)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {new Date(log.call_started_at).toLocaleString()}
                          </span>
                          {log.users && (
                            <span>By {log.users.name}</span>
                          )}
                        </div>
                        {log.talk_time_seconds && log.talk_time_seconds > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Talk time: {formatDuration(log.talk_time_seconds)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground border rounded-lg bg-muted/30">
                  <Phone className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">No call logs tracked yet</p>
                  <p className="text-xs mt-1">Calls made from the app will appear here</p>
                </div>
              )}
            </div>

          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-4 sm:space-y-6">
            {/* Activity History */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold mb-2 sm:mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Activity History
              </h3>
              {isLoadingActivities ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : activities.length > 0 ? (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
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
                <div className="text-center py-4 text-muted-foreground border rounded-lg bg-muted/30">
                  <Clock className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">No activity recorded yet</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
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
    </Dialog>
  )
}

