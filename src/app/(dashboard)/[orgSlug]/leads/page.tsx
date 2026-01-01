'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LeadDetailDialog } from '@/components/leads/lead-detail-dialog'
import { Target, Plus, Loader2, Phone, Mail, User, UserCircle, AlertTriangle, Upload, FileSpreadsheet, CheckCircle, AlertCircle, X, UserCheck, Users, Filter, Calendar, Package, Trash2, TrendingUp, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { differenceInDays, format, parseISO } from 'date-fns'
import { toast } from 'sonner'

type Lead = {
  id: string
  name: string
  email: string | null
  phone: string | null
  source: string
  status: string
  subscription_type?: string | null
  product_id?: string | null
  custom_fields: { company?: string } | null
  created_at: string
  created_by: string | null
  assigned_to: string | null
  creator: { name: string } | null
  assignee: { name: string } | null
  product?: { id: string; name: string } | null
  approval_status?: 'pending' | 'approved' | 'rejected' | null
  subscription?: {
    id: string
    status: string
    approval_status?: 'pending' | 'approved' | 'rejected' | null
    start_date?: string
    end_date?: string
  } | null
}

type UserProfile = {
  id: string
  role: string
  org_id: string
}

type DuplicateLead = {
  id: string
  name: string
  phone: string | null
  assigned_to: string | null
  assignee_name: string | null
}

type ParsedLead = {
  name: string
  company?: string
  email?: string
  phone?: string
  source?: string
}

type DuplicateInfo = {
  lead: ParsedLead
  existingId: string
  existingName: string
  assignedTo: string | null
  assigneeName: string | null
}

type ImportPreview = {
  newLeads: ParsedLead[]
  duplicates: DuplicateInfo[]
}

type Tag = {
  id: string
  name: string
  color: string
}

type SalesUser = {
  id: string
  name: string
}

type Product = {
  id: string
  name: string
}

const statusColors: Record<string, string> = {
  new: 'bg-blue-500',
  call_not_picked: 'bg-yellow-500',
  not_interested: 'bg-gray-500',
  follow_up_again: 'bg-orange-500',
  demo_booked: 'bg-purple-500',
  demo_completed: 'bg-indigo-500',
  deal_won: 'bg-emerald-500',
  deal_lost: 'bg-red-500',
}

const statusOptions = [
  { value: 'all', label: 'All Statuses' },
  { value: 'new', label: 'New' },
  { value: 'call_not_picked', label: 'Call Not Picked' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'follow_up_again', label: 'Follow Up Again' },
  { value: 'demo_booked', label: 'Meeting Booked' },
  { value: 'demo_completed', label: 'Meeting Completed' },
  { value: 'deal_won', label: 'Deal Won' },
  { value: 'deal_lost', label: 'Deal Lost' },
]

// Helper to get display label for status
const getStatusLabel = (status: string): string => {
  const option = statusOptions.find(o => o.value === status)
  return option?.label || status.replace(/_/g, ' ')
}

export default function LeadsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  
  const [leads, setLeads] = useState<Lead[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    source: 'manual',
    status: 'new',
  })
  
  // Filter state
  const [statusFilter, setStatusFilter] = useState('all')
  const [subscriptionTypeFilter, setSubscriptionTypeFilter] = useState('all')
  const [tags, setTags] = useState<Tag[]>([])
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('all')
  const [leadTags, setLeadTags] = useState<Record<string, string[]>>({}) // leadId -> tagIds
  
  // New filter state
  const [salesTeam, setSalesTeam] = useState<SalesUser[]>([])
  const [selectedSalesRep, setSelectedSalesRep] = useState<string>('all')
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string>('all')
  const [leadAgeOperator, setLeadAgeOperator] = useState<string>('all')
  const [leadAgeDays, setLeadAgeDays] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)
  const [phoneSearch, setPhoneSearch] = useState<string>('')
  
  // Delete confirmation state
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('')
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null)
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false)
  const [isDeletingSingle, setIsDeletingSingle] = useState(false)
  
  // Bulk delete state
  const [selectedLeadsForDelete, setSelectedLeadsForDelete] = useState<Set<string>>(new Set())
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false)
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState<string>('')
  const [isDeletingBulk, setIsDeletingBulk] = useState(false)
  
  // Duplicate detection state
  const [duplicateLead, setDuplicateLead] = useState<DuplicateLead | null>(null)
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false)
  
  
  // Import dialog state
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [selectedDuplicates, setSelectedDuplicates] = useState<Set<string>>(new Set())
  const [importResult, setImportResult] = useState<{ success: number; failed: number; skipped: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Hydration fix - only render Radix UI components after mount
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    fetchUserAndLeads()
  }, [orgSlug])

  const fetchUserAndLeads = async () => {
    const supabase = createClient()
    
    // Get current user profile
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', user.id)
      .single()

    if (profile) {
      setUserProfile(profile as UserProfile)
      setOrgId(profile.org_id)
      await fetchLeads(profile as UserProfile)
    }
    setIsLoading(false)
  }

  const fetchLeads = async (profile: UserProfile) => {
    const supabase = createClient()
    
    // Use a single query with JOIN for users - much faster than N+1 queries
    // Using foreign key relationships defined in Supabase
    // Note: product_id and product relation will only work after running migration 020
    let query = supabase
      .from('leads')
      .select(`
        id, name, email, phone, source, status, subscription_type, custom_fields, created_at, created_by, assigned_to,
        creator:users!leads_created_by_fkey(name),
        assignee:users!leads_assigned_to_fkey(name)
      `)
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })

    // Sales can only see leads assigned to them or created by them - single query with OR
    if (profile.role === 'sales') {
      query = query.or(`assigned_to.eq.${profile.id},created_by.eq.${profile.id}`)
    }

    const { data: leadsData, error } = await query
    
    if (error) {
      console.error('Error fetching leads:', error)
      setLeads([])
      return
    }

    // Get lead IDs to fetch their products from lead_activities
    const leadIds = (leadsData || []).map(l => l.id)
    
    // Fetch the most recent product_id for each lead from lead_activities
    let leadProductMap: Record<string, { product_id: string; product_name: string }> = {}
    if (leadIds.length > 0) {
      const { data: activitiesWithProducts } = await supabase
        .from('lead_activities')
        .select('lead_id, product_id, products(id, name)')
        .in('lead_id', leadIds)
        .not('product_id', 'is', null)
        .order('created_at', { ascending: false })
      
      // Build map of lead_id -> most recent product
      if (activitiesWithProducts) {
        for (const activity of activitiesWithProducts) {
          if (activity.product_id && !leadProductMap[activity.lead_id]) {
            const productData = activity.products as { id: string; name: string } | null
            if (productData) {
              leadProductMap[activity.lead_id] = {
                product_id: activity.product_id,
                product_name: productData.name
              }
            }
          }
        }
      }
    }

    // Fetch subscription data for leads with deal_won status
    const dealWonLeadIds = (leadsData || []).filter(l => l.status === 'deal_won').map(l => l.id)
    let subscriptionMap: Record<string, any> = {}
    let approvalMap: Record<string, any> = {}
    
    if (dealWonLeadIds.length > 0) {
      // Fetch approved subscriptions
      const { data: subscriptionsData } = await supabase
        .from('customer_subscriptions')
        .select('id, lead_id, status, start_date, end_date')
        .in('lead_id', dealWonLeadIds)
      
      if (subscriptionsData) {
        subscriptionsData.forEach(sub => {
          // Calculate actual status based on dates (same logic as subscriptions page)
          let calculatedStatus = sub.status
          
          // If status is 'paused', keep it as paused
          if (sub.status === 'paused') {
            calculatedStatus = 'paused'
          } else if (sub.end_date) {
            // Calculate status based on end_date
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const endDate = new Date(sub.end_date)
            endDate.setHours(0, 0, 0, 0)
            
            if (endDate >= today) {
              calculatedStatus = 'active'
            } else {
              calculatedStatus = 'expired'
            }
          }
          
          subscriptionMap[sub.lead_id] = {
            id: sub.id,
            status: calculatedStatus,
            approval_status: 'approved' as const,
            start_date: sub.start_date,
            end_date: sub.end_date,
          }
        })
      }
      
      // Fetch pending approvals
      try {
        const { data: approvalsData } = await supabase
          .from('subscription_approvals')
          .select('lead_id, status')
          .in('lead_id', dealWonLeadIds)
          .eq('status', 'pending')
        
        if (approvalsData) {
          approvalsData.forEach(approval => {
            if (!subscriptionMap[approval.lead_id]) {
              approvalMap[approval.lead_id] = {
                approval_status: 'pending' as const,
              }
            }
          })
        }
      } catch (err) {
        // Table might not exist, ignore
      }
    }

    // Map leads - relationships already included
    const leadsWithUsers = (leadsData || []).map(lead => {
      const productInfo = leadProductMap[lead.id]
      const subscriptionInfo = subscriptionMap[lead.id] || approvalMap[lead.id] || null
      return {
        ...lead,
        creator: lead.creator as { name: string } | null,
        assignee: lead.assignee as { name: string } | null,
        product_id: productInfo?.product_id || null,
        product: productInfo ? { id: productInfo.product_id, name: productInfo.product_name } : null,
        subscription: subscriptionInfo,
        approval_status: subscriptionInfo?.approval_status || null,
      }
    })

    setLeads(leadsWithUsers as Lead[])

    // Fetch tags for the organization
    const { data: tagsData } = await supabase
      .from('lead_tags')
      .select('id, name, color')
      .eq('org_id', profile.org_id)
      .order('name')
    
    setTags((tagsData || []) as Tag[])

    // Fetch sales team for admin filter
    if (profile.role === 'admin') {
      const { data: teamData } = await supabase
        .from('users')
        .select('id, name')
        .eq('org_id', profile.org_id)
        .eq('role', 'sales')
        .eq('is_approved', true)
        .eq('is_active', true)
      setSalesTeam(teamData || [])
    }

    // Fetch products for the organization
    const { data: productsData } = await supabase
      .from('products')
      .select('id, name')
      .eq('org_id', profile.org_id)
      .eq('is_active', true)
      .order('name')
    
    setProducts((productsData || []) as Product[])

    // Fetch tag assignments for all leads
    if (leadsData && leadsData.length > 0) {
      const leadIds = leadsData.map(l => l.id)
      const { data: assignments } = await supabase
        .from('lead_tag_assignments')
        .select('lead_id, tag_id')
        .in('lead_id', leadIds)
      
      // Group by lead_id
      const tagsByLead: Record<string, string[]> = {}
      assignments?.forEach(a => {
        if (!tagsByLead[a.lead_id]) {
          tagsByLead[a.lead_id] = []
        }
        tagsByLead[a.lead_id].push(a.tag_id)
      })
      setLeadTags(tagsByLead)
    }
  }

  // Normalize phone number for comparison
  const normalizePhone = (phone: string): string => {
    const cleaned = phone.replace(/[^\d+]/g, '')
    if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
      return '+91' + cleaned
    }
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
      return '+' + cleaned
    }
    if (!cleaned.startsWith('+') && cleaned.length > 10) {
      return '+' + cleaned
    }
    return cleaned
  }

  // Check for duplicate phone number - optimized with single query
  const checkDuplicate = async (phone: string): Promise<DuplicateLead | null> => {
    if (!phone || !orgId) return null
    
    const supabase = createClient()
    const normalizedPhone = normalizePhone(phone)
    
    // Search for leads with matching phone using ILIKE for flexibility
    // Also join with users to get assignee name in single query
    const { data: matches } = await supabase
      .from('leads')
      .select(`
        id, name, phone, assigned_to,
        assignee:users!leads_assigned_to_fkey(name)
      `)
      .eq('org_id', orgId)
      .or(`phone.ilike.%${phone.replace(/[^\d]/g, '').slice(-10)}%`)
      .limit(5)
    
    // Find exact match with normalized phone
    const match = matches?.find(lead => {
      if (!lead.phone) return false
      return normalizePhone(lead.phone) === normalizedPhone
    })
    
    if (!match) return null
    
    return {
      id: match.id,
      name: match.name,
      phone: match.phone,
      assigned_to: match.assigned_to,
      assignee_name: (match.assignee as { name: string } | null)?.name || null,
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orgId || !userProfile) return

    // First check for duplicates
    setIsCheckingDuplicate(true)
    const duplicate = await checkDuplicate(formData.phone)
    setIsCheckingDuplicate(false)
    
    if (duplicate) {
      setDuplicateLead(duplicate)
      
      // For sales rep - just show message and skip
      if (userProfile.role === 'sales') {
        if (duplicate.assigned_to) {
          toast.error(`Lead already assigned to ${duplicate.assignee_name || 'another rep'}. Skipped.`)
        } else {
          toast.error('Lead already exists in the system. Skipped.')
        }
        return
      }
      
      // For admin - show dialog with options
      setShowDuplicateDialog(true)
      return
    }
    
    // No duplicate - proceed with adding
    await addLead()
  }
  
  const addLead = async (forceAdd = false) => {
    if (!orgId || !userProfile) return

    setIsSaving(true)
    const supabase = createClient()

    // For sales, auto-assign to themselves
    const assignTo = userProfile.role === 'sales' ? userProfile.id : null

    const { error } = await supabase
      .from('leads')
      .insert({
        org_id: orgId,
        name: formData.name || formData.phone, // Use phone as name if name not provided
        email: formData.email || null,
        phone: formData.phone,
        source: formData.source,
        status: formData.status,
        custom_fields: { company: formData.company || null },
        created_by: userProfile.id,
        assigned_to: assignTo,
      })

    if (error) {
      toast.error('Failed to add lead')
      console.error(error)
    } else {
      toast.success('Lead added successfully')
      setFormData({ name: '', company: '', email: '', phone: '', source: 'manual', status: 'new' })
      setIsDialogOpen(false)
      setShowDuplicateDialog(false)
      setDuplicateLead(null)
      fetchLeads(userProfile)
    }
    setIsSaving(false)
  }
  
  const handleDuplicateAction = async (action: 'ignore' | 'add_anyway' | 'view_existing') => {
    if (action === 'ignore') {
      setShowDuplicateDialog(false)
      setDuplicateLead(null)
      toast.info('Lead skipped')
    } else if (action === 'add_anyway') {
      await addLead(true)
    } else if (action === 'view_existing' && duplicateLead) {
      // Find and open the existing lead
      const existing = leads.find(l => l.id === duplicateLead.id)
      if (existing) {
        setSelectedLead(existing)
        setIsDetailOpen(true)
      }
      setShowDuplicateDialog(false)
      setDuplicateLead(null)
    }
  }

  const isAdmin = userProfile?.role === 'admin'
  const isSales = userProfile?.role === 'sales'

  // Calculate lead age in days
  const getLeadAge = (createdAt: string): number => {
    return differenceInDays(new Date(), new Date(createdAt))
  }

  // Filter leads based on all filters
  const filteredLeads = leads.filter(lead => {
    // Status filter
    if (statusFilter !== 'all' && lead.status !== statusFilter) return false
    
    // Subscription type filter
    if (subscriptionTypeFilter !== 'all') {
      if (subscriptionTypeFilter === 'not_set') {
        if (lead.subscription_type) return false
      } else {
        if (lead.subscription_type !== subscriptionTypeFilter) return false
      }
    }
    
    // Product filter
    if (selectedProduct !== 'all') {
      if (selectedProduct === 'none') {
        if (lead.product_id) return false
      } else {
        if (lead.product_id !== selectedProduct) return false
      }
    }
    
    // Tag filter
    if (selectedTagFilter !== 'all') {
      const leadTagIds = leadTags[lead.id] || []
      if (!leadTagIds.includes(selectedTagFilter)) return false
    }
    
    // Sales rep filter (admin only)
    if (isAdmin && selectedSalesRep !== 'all') {
      if (selectedSalesRep === 'unassigned') {
        if (lead.assigned_to !== null) return false
      } else {
        if (lead.assigned_to !== selectedSalesRep) return false
      }
    }
    
    // Lead age filter
    if (leadAgeOperator !== 'all' && leadAgeDays) {
      const age = getLeadAge(lead.created_at)
      const targetDays = parseInt(leadAgeDays)
      if (isNaN(targetDays)) return true
      
      switch (leadAgeOperator) {
        case 'lt': if (!(age < targetDays)) return false; break
        case 'eq': if (!(age === targetDays)) return false; break
        case 'gt': if (!(age > targetDays)) return false; break
      }
    }
    
    // Date range filter
    if (dateFrom) {
      const leadDate = new Date(lead.created_at)
      const fromDate = new Date(dateFrom)
      fromDate.setHours(0, 0, 0, 0)
      if (leadDate < fromDate) return false
    }
    if (dateTo) {
      const leadDate = new Date(lead.created_at)
      const toDate = new Date(dateTo)
      toDate.setHours(23, 59, 59, 999)
      if (leadDate > toDate) return false
    }
    
    // Phone search filter
    if (phoneSearch) {
      const searchTerm = phoneSearch.replace(/[^\d]/g, '') // Remove non-digits
      const leadPhone = (lead.phone || '').replace(/[^\d]/g, '')
      if (!leadPhone.includes(searchTerm)) return false
    }
    
    return true
  })

  // Check if any filter is active
  const hasActiveFilters = statusFilter !== 'all' || subscriptionTypeFilter !== 'all' || 
    selectedProduct !== 'all' || selectedTagFilter !== 'all' || 
    selectedSalesRep !== 'all' || 
    (leadAgeOperator !== 'all' && leadAgeDays) || dateFrom || dateTo || phoneSearch

  // Clear all filters
  const clearAllFilters = () => {
    setStatusFilter('all')
    setSubscriptionTypeFilter('all')
    setSelectedProduct('all')
    setSelectedTagFilter('all')
    setSelectedSalesRep('all')
    setLeadAgeOperator('all')
    setLeadAgeDays('')
    setDateFrom('')
    setDateTo('')
    setPhoneSearch('')
  }


  // Single lead delete with confirmation
  const handleSingleLeadDelete = async () => {
    if (!leadToDelete || deleteConfirmText.toLowerCase() !== 'delete') {
      toast.error('Please type "delete" to confirm')
      return
    }
    
    setIsDeletingSingle(true)
    try {
      const response = await fetch(`/api/leads/${leadToDelete.id}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        toast.success('Lead deleted successfully')
        if (userProfile) fetchLeads(userProfile)
      } else {
        toast.error('Failed to delete lead')
      }
    } catch (error) {
      console.error('Error deleting lead:', error)
      toast.error('Failed to delete lead')
    }
    
    setIsDeletingSingle(false)
    setShowDeleteConfirmDialog(false)
    setLeadToDelete(null)
    setDeleteConfirmText('')
  }

  const openDeleteConfirmDialog = (lead: Lead) => {
    setLeadToDelete(lead)
    setDeleteConfirmText('')
    setShowDeleteConfirmDialog(true)
  }

  const handleSelectLeadForDelete = (leadId: string) => {
    setSelectedLeadsForDelete(prev => {
      const newSet = new Set(prev)
      if (newSet.has(leadId)) {
        newSet.delete(leadId)
      } else {
        newSet.add(leadId)
      }
      return newSet
    })
  }

  const handleSelectAllForDelete = () => {
    if (selectedLeadsForDelete.size === filteredLeads.length) {
      setSelectedLeadsForDelete(new Set())
    } else {
      setSelectedLeadsForDelete(new Set(filteredLeads.map(l => l.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (bulkDeleteConfirmText.toLowerCase() !== 'delete') {
      toast.error('Please type "delete" to confirm')
      return
    }

    if (selectedLeadsForDelete.size === 0) {
      toast.error('No leads selected')
      return
    }

    setIsDeletingBulk(true)
    try {
      const leadIds = Array.from(selectedLeadsForDelete)
      let successCount = 0
      let failCount = 0

      for (const leadId of leadIds) {
        try {
          const response = await fetch(`/api/leads/${leadId}`, {
            method: 'DELETE',
          })

          if (response.ok) {
            successCount++
          } else {
            failCount++
          }
        } catch (error) {
          console.error(`Error deleting lead ${leadId}:`, error)
          failCount++
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully deleted ${successCount} lead(s)${failCount > 0 ? `. ${failCount} failed.` : ''}`)
        setSelectedLeadsForDelete(new Set())
        setBulkDeleteConfirmText('')
        setShowBulkDeleteDialog(false)
        if (userProfile) {
          fetchLeads(userProfile)
        }
      } else {
        toast.error('Failed to delete leads')
      }
    } catch (error) {
      console.error('Bulk delete error:', error)
      toast.error('Failed to delete leads')
    } finally {
      setIsDeletingBulk(false)
    }
  }

  // Import functions
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const parseCSV = (text: string): ParsedLead[] => {
    const lines = text.split('\n').filter(line => line.trim())
    if (lines.length < 2) return []

    const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''))
    const nameIndex = headers.findIndex(h => h.includes('name') && !h.includes('company'))
    const companyIndex = headers.findIndex(h => h.includes('company') || h.includes('organization'))
    const emailIndex = headers.findIndex(h => h.includes('email'))
    const phoneIndex = headers.findIndex(h => h.includes('phone') || h.includes('mobile'))
    const sourceIndex = headers.findIndex(h => h.includes('source'))

    if (nameIndex === -1) {
      toast.error('CSV must have a "name" column')
      return []
    }

    const parsedLeads: ParsedLead[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''))
      const name = values[nameIndex]
      
      if (name) {
        parsedLeads.push({
          name,
          company: companyIndex >= 0 ? values[companyIndex] : undefined,
          email: emailIndex >= 0 ? values[emailIndex] : undefined,
          phone: phoneIndex >= 0 ? values[phoneIndex] : undefined,
          source: sourceIndex >= 0 ? values[sourceIndex] : undefined,
        })
      }
    }

    return parsedLeads
  }

  const processFile = async (file: File) => {
    if (!orgId || !userProfile) {
      toast.error('Organization not found')
      return
    }

    const validTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    if (!validTypes.includes(file.type) && !file.name.endsWith('.csv') && !file.name.endsWith('.xlsx')) {
      toast.error('Please upload a CSV or Excel file')
      return
    }

    setIsImporting(true)
    setImportResult(null)
    setImportPreview(null)

    try {
      const text = await file.text()
      const parsedLeads = parseCSV(text)

      if (parsedLeads.length === 0) {
        toast.error('No valid leads found in file')
        setIsImporting(false)
        return
      }

      const supabase = createClient()
      
      // Fetch existing leads to check for duplicates
      const { data: existingLeads } = await supabase
        .from('leads')
        .select('id, name, phone, assigned_to')
        .eq('org_id', orgId)
      
      // Get user names for assigned leads
      const assignedUserIds = new Set(existingLeads?.filter(l => l.assigned_to).map(l => l.assigned_to) || [])
      let userNames: Record<string, string> = {}
      if (assignedUserIds.size > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, name')
          .in('id', Array.from(assignedUserIds))
        users?.forEach(u => { userNames[u.id] = u.name })
      }

      // Build phone lookup map
      const phoneToExisting = new Map<string, { id: string; name: string; assigned_to: string | null }>()
      existingLeads?.forEach(lead => {
        if (lead.phone) {
          phoneToExisting.set(normalizePhone(lead.phone), {
            id: lead.id,
            name: lead.name,
            assigned_to: lead.assigned_to,
          })
        }
      })

      // Categorize leads
      const newLeads: ParsedLead[] = []
      const duplicates: DuplicateInfo[] = []

      for (const lead of parsedLeads) {
        if (lead.phone) {
          const normalized = normalizePhone(lead.phone)
          const existing = phoneToExisting.get(normalized)
          if (existing) {
            duplicates.push({
              lead,
              existingId: existing.id,
              existingName: existing.name,
              assignedTo: existing.assigned_to,
              assigneeName: existing.assigned_to ? userNames[existing.assigned_to] || null : null,
            })
            continue
          }
        }
        newLeads.push(lead)
      }

      // For admin - show preview if there are duplicates
      if (isAdmin && duplicates.length > 0) {
        setImportPreview({ newLeads, duplicates })
        setIsImporting(false)
        return
      }

      // For sales or no duplicates - import directly
      await importLeadsFromFile(newLeads, duplicates.length)
    } catch (error) {
      console.error('Import error:', error)
      toast.error('Failed to process file')
    }

    setIsImporting(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const importLeadsFromFile = async (leadsToImport: ParsedLead[], skippedCount: number = 0) => {
    if (!orgId || !userProfile) return

    setIsImporting(true)
    const supabase = createClient()
    let success = 0
    let failed = 0

    // For sales, auto-assign to themselves
    const assignTo = userProfile.role === 'sales' ? userProfile.id : null

    for (const lead of leadsToImport) {
      const { error } = await supabase
        .from('leads')
        .insert({
          org_id: orgId,
          name: lead.name,
          email: lead.email || null,
          phone: lead.phone || null,
          source: lead.source || 'import',
          status: 'new',
          custom_fields: { company: lead.company || null },
          created_by: userProfile.id,
          assigned_to: assignTo,
        })

      if (error) {
        failed++
        console.error('Failed to import lead:', lead.name, error)
      } else {
        success++
      }
    }

    setImportResult({ success, failed, skipped: skippedCount })
    setImportPreview(null)
    setSelectedDuplicates(new Set())
    
    if (success > 0) {
      toast.success(`Imported ${success} leads successfully`)
      fetchLeads(userProfile)
    }
    if (skippedCount > 0) {
      toast.info(`${skippedCount} duplicate leads skipped`)
    }
    if (failed > 0) {
      toast.error(`Failed to import ${failed} leads`)
    }

    setIsImporting(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleImportWithDuplicates = async () => {
    if (!importPreview) return
    
    // Get selected duplicates to add anyway
    const leadsToImport = [
      ...importPreview.newLeads,
      ...importPreview.duplicates
        .filter(d => selectedDuplicates.has(d.existingId))
        .map(d => d.lead)
    ]
    
    const skipped = importPreview.duplicates.length - selectedDuplicates.size
    await importLeadsFromFile(leadsToImport, skipped)
  }

  const toggleDuplicateSelection = (id: string) => {
    setSelectedDuplicates(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const resetImportDialog = () => {
    setImportPreview(null)
    setSelectedDuplicates(new Set())
    setImportResult(null)
    setIsImporting(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title="Leads" 
        description={isAdmin ? "View all leads and assign to sales team" : "Manage your assigned leads"}
      />
      
      <div className="flex-1 p-4 lg:p-6">
        <Card>
          <CardHeader className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4 w-full">
              <div className="flex items-center gap-4">
                <div>
                  <CardTitle>
                    {isAdmin ? 'All Leads' : 'My Leads'}
                  </CardTitle>
                  <CardDescription>
                    {filteredLeads.length} of {leads.length} leads
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {/* Import button - available for both admin and sales */}
                  <Button variant="outline" onClick={() => { resetImportDialog(); setIsImportDialogOpen(true) }}>
                    <Upload className="mr-2 h-4 w-4" />
                    Import
                  </Button>
                  {mounted && (
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="mr-2 h-4 w-4" />
                          Add Lead
                        </Button>
                      </DialogTrigger>
                    </Dialog>
                  )}
                </div>
              </div>
            </div>
            
            {/* Filters */}
            <div className="space-y-3">
              {/* Primary filters row */}
              <div className="flex flex-wrap items-center gap-2">
                {mounted && (
                  <>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              {option.value !== 'all' && (
                                <div className={`w-2 h-2 rounded-full ${statusColors[option.value] || 'bg-gray-500'}`} />
                              )}
                              {option.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Subscription Type Filter */}
                    <Select value={subscriptionTypeFilter} onValueChange={setSubscriptionTypeFilter}>
                      <SelectTrigger className="w-[180px]">
                        <TrendingUp className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Subscription" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Subscriptions</SelectItem>
                        <SelectItem value="trial">Trial</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="not_set">Not Specified</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Sales Rep Filter - Admin Only */}
                    {isAdmin && salesTeam.length > 0 && (
                      <Select value={selectedSalesRep} onValueChange={setSelectedSalesRep}>
                        <SelectTrigger className="w-[150px]">
                          <SelectValue placeholder="Sales Rep" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Reps</SelectItem>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {salesTeam.map((rep) => (
                            <SelectItem key={rep.id} value={rep.id}>{rep.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Product Filter */}
                    {products.length > 0 && (
                      <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                        <SelectTrigger className="w-[150px]">
                          <Package className="h-4 w-4 mr-2" />
                          <SelectValue placeholder="Product" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Products</SelectItem>
                          <SelectItem value="none">No Product</SelectItem>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </>
                )}

                {/* Phone Search */}
                <div className="relative">
                  <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search by phone..."
                    value={phoneSearch}
                    onChange={(e) => setPhoneSearch(e.target.value)}
                    className="w-[160px] pl-8 h-9"
                  />
                </div>

                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                  className={showFilters ? 'bg-primary/10' : ''}
                >
                  <Filter className="h-4 w-4 mr-1" />
                  More
                </Button>

                {hasActiveFilters && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={clearAllFilters}
                  >
                    Clear all
                  </Button>
                )}
              </div>

              {/* Extended filters row */}
              {showFilters && mounted && (
                <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  {/* Tag Filter */}
                  {tags.length > 0 && (
                    <Select value={selectedTagFilter} onValueChange={setSelectedTagFilter}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Tag" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Tags</SelectItem>
                        {tags.map((tag) => (
                          <SelectItem key={tag.id} value={tag.id}>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                              {tag.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Lead Age Filter */}
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">Lead age</span>
                    <Select value={leadAgeOperator} onValueChange={setLeadAgeOperator}>
                      <SelectTrigger className="w-[90px]">
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Any</SelectItem>
                        <SelectItem value="lt">&lt; Less than</SelectItem>
                        <SelectItem value="eq">= Equal to</SelectItem>
                        <SelectItem value="gt">&gt; Greater than</SelectItem>
                      </SelectContent>
                    </Select>
                    {leadAgeOperator !== 'all' && (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          placeholder="0"
                          value={leadAgeDays}
                          onChange={(e) => setLeadAgeDays(e.target.value)}
                          className="w-[70px] h-9"
                          min="0"
                        />
                        <span className="text-sm text-muted-foreground">days</span>
                      </div>
                    )}
                  </div>

                  {/* Date Range Filter */}
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <Input
                      type="date"
                      placeholder="From"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-[140px] h-9"
                    />
                    <span className="text-muted-foreground">to</span>
                    <Input
                      type="date"
                      placeholder="To"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-[140px] h-9"
                    />
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredLeads.length > 0 ? (
              <div className="space-y-3">
                {/* Bulk Delete Header - Admin Only */}
                {isAdmin && selectedLeadsForDelete.size > 0 && (
                  <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-red-700 dark:text-red-400">
                        {selectedLeadsForDelete.size} lead(s) selected
                      </span>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setShowBulkDeleteDialog(true)
                        setBulkDeleteConfirmText('')
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Selected
                    </Button>
                  </div>
                )}
                
                {filteredLeads.map((lead, index) => (
                  <div 
                    key={lead.id} 
                    className="p-4 rounded-lg border bg-card transition-colors hover:bg-muted/50 cursor-pointer"
                    onClick={() => {
                      setSelectedLead(lead)
                      setIsDetailOpen(true)
                    }}
                  >
                    {/* Top row: Checkbox (Admin) + Serial + Phone (primary) + Status + Delete */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        {/* Checkbox for bulk delete - Admin only */}
                        {isAdmin && (
                          <Checkbox
                            checked={selectedLeadsForDelete.has(lead.id)}
                            onCheckedChange={(checked) => {
                              handleSelectLeadForDelete(lead.id)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1"
                          />
                        )}
                        {/* Serial Number */}
                        <span className="w-8 h-8 flex items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium shrink-0">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-primary shrink-0" />
                            <p className="font-semibold text-base truncate">{lead.phone}</p>
                            </div>
                          {lead.name && lead.name !== lead.phone && (
                            <p className="text-sm text-muted-foreground truncate mt-0.5">
                              {lead.name}
                            </p>
                          )}
                          {lead.custom_fields?.company && (
                            <p className="text-xs text-muted-foreground truncate">
                              {lead.custom_fields.company}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <Badge className={`${statusColors[lead.status] || 'bg-gray-500'}`}>
                          {getStatusLabel(lead.status)}
                        </Badge>
                        {/* Subscription status for deal won leads */}
                        {lead.status === 'deal_won' && lead.subscription && (
                          <>
                            {lead.subscription.approval_status === 'pending' ? (
                              <Badge variant="outline" className="border-yellow-500 text-yellow-600 bg-yellow-50">
                                <Clock className="h-3 w-3 mr-1" />
                                Pending Approval
                              </Badge>
                            ) : lead.subscription.approval_status === 'approved' ? (
                              <Badge variant="outline" className="border-green-500 text-green-600 bg-green-50">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Approved
                              </Badge>
                            ) : null}
                            {lead.subscription.status && (
                              <Badge variant="outline" className={
                                lead.subscription.status === 'active' ? 'border-green-500 text-green-600' :
                                lead.subscription.status === 'paused' ? 'border-yellow-500 text-yellow-600' :
                                lead.subscription.status === 'expired' ? 'border-red-500 text-red-600' :
                                'border-gray-500 text-gray-600'
                              }>
                                {lead.subscription.status.charAt(0).toUpperCase() + lead.subscription.status.slice(1)}
                              </Badge>
                            )}
                          </>
                        )}
                        {lead.subscription_type && (
                          <Badge variant="outline" className={lead.subscription_type === 'trial' ? 'border-blue-500 text-blue-600' : 'border-green-500 text-green-600'}>
                            {lead.subscription_type === 'trial' ? 'Trial' : 'Paid'}
                          </Badge>
                        )}
                        {lead.product && (
                          <Badge variant="outline" className="border-purple-500 text-purple-600">
                            <Package className="h-3 w-3 mr-1" />
                            {lead.product.name}
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    {/* Tags */}
                    {leadTags[lead.id] && leadTags[lead.id].length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {leadTags[lead.id].map(tagId => {
                          const tag = tags.find(t => t.id === tagId)
                          if (!tag) return null
                          return (
                            <Badge 
                              key={tagId} 
                              variant="outline" 
                              className="text-xs"
                              style={{ borderColor: tag.color, color: tag.color }}
                            >
                              {tag.name}
                            </Badge>
                          )
                        })}
                      </div>
                    )}
                    
                    {/* Subscription Details for Deal Won */}
                    {lead.status === 'deal_won' && lead.subscription && (
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2 p-2 bg-muted/50 rounded-md">
                        {lead.subscription.approval_status && (
                          <span className="flex items-center gap-1">
                            <span className="font-medium">Approval:</span>
                            <span className={
                              lead.subscription.approval_status === 'pending' ? 'text-yellow-600' :
                              lead.subscription.approval_status === 'approved' ? 'text-green-600' :
                              'text-red-600'
                            }>
                              {lead.subscription.approval_status === 'pending' ? 'Pending' :
                               lead.subscription.approval_status === 'approved' ? 'Approved' :
                               'Rejected'}
                            </span>
                          </span>
                        )}
                        {lead.subscription.status && (
                          <span className="flex items-center gap-1">
                            <span className="font-medium">Status:</span>
                            <span className={
                              lead.subscription.status === 'active' ? 'text-green-600' :
                              lead.subscription.status === 'paused' ? 'text-yellow-600' :
                              lead.subscription.status === 'expired' ? 'text-red-600' :
                              'text-gray-600'
                            }>
                              {lead.subscription.status.charAt(0).toUpperCase() + lead.subscription.status.slice(1)}
                            </span>
                          </span>
                        )}
                        {lead.subscription.start_date && lead.subscription.end_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(parseISO(lead.subscription.start_date), 'MMM dd')} - {format(parseISO(lead.subscription.end_date), 'MMM dd, yyyy')}
                          </span>
                        )}
                      </div>
                    )}
                    
                    {/* Email */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-2">
                      {lead.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" />
                          <span className="truncate max-w-[200px]">{lead.email}</span>
                        </span>
                      )}
                    </div>
                    
                    {/* Bottom row: Source + Age + Assignment */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{lead.source}</Badge>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {getLeadAge(lead.created_at)}d
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          {lead.assignee ? (
                            <span className="text-primary">→ {lead.assignee.name}</span>
                          ) : isAdmin ? (
                            <span className="text-yellow-600">Unassigned</span>
                          ) : null}
                        </div>
                        {/* Delete button - Admin only */}
                        {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-100"
                            onClick={(e) => {
                              e.stopPropagation()
                              openDeleteConfirmDialog(lead)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">
                  {leads.length > 0 ? 'No leads match filters' : 'No leads yet'}
                </p>
                <p className="text-sm">
                  {leads.length > 0 
                    ? 'Try adjusting your filters'
                    : isAdmin 
                      ? 'Import leads or add them manually to get started'
                      : 'No leads assigned to you yet. Check with your admin.'
                  }
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lead Detail Dialog */}
      <LeadDetailDialog
        lead={selectedLead}
        open={isDetailOpen}
        onOpenChange={(open) => {
          setIsDetailOpen(open)
          if (!open && userProfile) {
            // Refresh leads when dialog closes
            fetchLeads(userProfile)
          }
        }}
        onUpdate={() => {
          // Refresh the selected lead in-place for immediate UI update
          if (selectedLead && userProfile) {
            fetchLeads(userProfile).then(() => {
              // Force re-render by updating selectedLead
              setSelectedLead(prev => prev ? { ...prev } : null)
            })
          }
        }}
        canEditStatus={isSales || isAdmin} // Sales and Admin can edit status
        isAdmin={isAdmin} // Admin can unassign leads
      />

      {/* Dialogs - only render after mount to prevent hydration issues */}
      {mounted && (
        <>
      {/* Duplicate Lead Dialog (Admin Only) */}
      <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Duplicate Lead Found
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>A lead with this phone number already exists:</p>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-medium">{duplicateLead?.name}</p>
                  <p className="text-sm text-muted-foreground">{duplicateLead?.phone}</p>
                  {duplicateLead?.assigned_to ? (
                    <p className="text-sm text-primary mt-1">
                      Assigned to: {duplicateLead.assignee_name}
                    </p>
                  ) : (
                    <p className="text-sm text-amber-600 mt-1">Unassigned</p>
                  )}
                </div>
                <p className="text-sm">What would you like to do?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => handleDuplicateAction('ignore')}>
              Skip / Ignore
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => handleDuplicateAction('view_existing')}
            >
              View Existing Lead
            </Button>
            <AlertDialogAction onClick={() => handleDuplicateAction('add_anyway')}>
              Add Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Lead Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Add New Lead</DialogTitle>
              <DialogDescription>
                Enter the lead details below
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone *</Label>
                  <Input
                    id="phone"
                    placeholder="+91 98765 43210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input
                    id="company"
                    placeholder="Acme Inc."
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="john@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Select
                    value={formData.source}
                    onValueChange={(value) => setFormData({ ...formData, source: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="website">Website</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="linkedin">LinkedIn</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="referral">Referral</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Add Lead'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Leads Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={(open) => { if (!open) resetImportDialog(); setIsImportDialogOpen(open) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Leads</DialogTitle>
            <DialogDescription>
              Import leads from CSV or Excel files
            </DialogDescription>
          </DialogHeader>
          
          <div 
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
            }`}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
          >
            {isImporting ? (
              <>
                <Loader2 className="h-10 w-10 mx-auto mb-4 text-primary animate-spin" />
                <p className="font-medium mb-2">Processing file...</p>
                <p className="text-sm text-muted-foreground">
                  Please wait while we import your leads
                </p>
              </>
            ) : importPreview ? (
              <div className="text-left">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <h3 className="font-medium">Import Preview</h3>
                </div>
                
                {/* Summary */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="h-4 w-4" />
                      <span className="font-medium">{importPreview.newLeads.length} New</span>
                    </div>
                    <p className="text-xs text-green-600 mt-1">Ready to import</p>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="flex items-center gap-2 text-amber-700">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">{importPreview.duplicates.length} Duplicates</span>
                    </div>
                    <p className="text-xs text-amber-600 mt-1">Phone exists</p>
                  </div>
                </div>

                {/* Duplicates List */}
                {importPreview.duplicates.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Select duplicates to add anyway
                    </h4>
                    <div className="max-h-[150px] overflow-y-auto space-y-2 border rounded-lg p-2">
                      {importPreview.duplicates.map((dup, idx) => (
                        <div 
                          key={idx}
                          className={`p-2 rounded-lg border ${
                            selectedDuplicates.has(dup.existingId) 
                              ? 'bg-primary/5 border-primary' 
                              : 'bg-muted/50'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <Checkbox
                              checked={selectedDuplicates.has(dup.existingId)}
                              onCheckedChange={() => toggleDuplicateSelection(dup.existingId)}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium truncate">{dup.lead.name}</span>
                                <Badge variant="outline" className="text-xs shrink-0">
                                  {dup.lead.phone}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Existing: {dup.existingName}
                                {dup.assignedTo && (
                                  <span className="ml-2">
                                    → <UserCheck className="inline h-3 w-3" /> {dup.assigneeName}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {selectedDuplicates.size} selected, {importPreview.duplicates.length - selectedDuplicates.size} will be skipped
                    </p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 justify-end">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={resetImportDialog}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleImportWithDuplicates}>
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Import {importPreview.newLeads.length + selectedDuplicates.size}
                  </Button>
                </div>
              </div>
            ) : importResult ? (
              <>
                <CheckCircle className="h-10 w-10 mx-auto mb-4 text-green-500" />
                <p className="font-medium mb-2">Import Complete</p>
                <div className="text-sm text-muted-foreground mb-4 space-y-1">
                  <p className="text-green-600">{importResult.success} leads imported</p>
                  {importResult.skipped > 0 && (
                    <p className="text-amber-600">{importResult.skipped} duplicates skipped</p>
                  )}
                  {importResult.failed > 0 && (
                    <p className="text-red-600">{importResult.failed} failed</p>
                  )}
                </div>
                <Button size="sm" onClick={resetImportDialog}>
                  Import More
                </Button>
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                <p className="font-medium mb-2">Drop your file here</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Supports CSV and XLSX files
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" />
                  Choose File
                </Button>
              </>
            )}
          </div>

          <div className="p-3 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-medium flex items-center gap-2 mb-1">
              <AlertCircle className="h-4 w-4" />
              CSV Format
            </h4>
            <p className="text-xs text-muted-foreground">
              Columns: name (required), company, email, phone, source
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Single Lead Delete Confirmation Dialog - Type 'delete' to confirm */}
      <Dialog open={showDeleteConfirmDialog} onOpenChange={(open) => {
        setShowDeleteConfirmDialog(open)
        if (!open) {
          setLeadToDelete(null)
          setDeleteConfirmText('')
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Delete Lead Permanently
            </DialogTitle>
            <DialogDescription asChild>
              <div>
                {leadToDelete && (
                  <div className="my-3 p-3 bg-muted rounded-lg">
                    <p className="font-medium">{leadToDelete.name}</p>
                    <p className="text-sm text-muted-foreground">{leadToDelete.phone}</p>
                    {leadToDelete.email && <p className="text-sm text-muted-foreground">{leadToDelete.email}</p>}
                  </div>
                )}
                <p className="text-sm">This will permanently delete this lead and all associated data including:</p>
                <ul className="list-disc list-inside mt-2 text-sm text-muted-foreground">
                  <li>All activities and notes</li>
                  <li>Scheduled demos/meetings</li>
                  <li>Call recordings</li>
                  <li>Subscriptions</li>
                </ul>
                <p className="mt-3 font-medium text-red-600">This action cannot be undone!</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="delete-confirm" className="text-sm font-medium">
                Type <span className="font-bold text-red-600">delete</span> to confirm:
              </Label>
              <Input
                id="delete-confirm"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type 'delete' here"
                className="border-red-200 focus-visible:ring-red-500"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteConfirmDialog(false)
                setLeadToDelete(null)
                setDeleteConfirmText('')
              }}
              disabled={isDeletingSingle}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleSingleLeadDelete}
              disabled={isDeletingSingle || deleteConfirmText.toLowerCase() !== 'delete'}
            >
              {isDeletingSingle ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Lead
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedLeadsForDelete.size} Lead(s) Permanently</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <div className="text-sm mb-4">This will permanently delete {selectedLeadsForDelete.size} lead(s) and all associated data including:</div>
                <ul className="list-disc list-inside text-sm space-y-1 mb-4">
                  <li>All activities and notes</li>
                  <li>All meetings/demos</li>
                  <li>All call recordings</li>
                  <li>All subscriptions</li>
                </ul>
                <div className="text-sm font-medium text-red-600 dark:text-red-400 mb-4">
                  This action cannot be undone.
                </div>
                <div className="mt-4">
                  <Label htmlFor="bulk-delete-confirm" className="text-sm">
                    Type <strong>"delete"</strong> to confirm:
                  </Label>
                  <Input
                    id="bulk-delete-confirm"
                    value={bulkDeleteConfirmText}
                    onChange={(e) => setBulkDeleteConfirmText(e.target.value)}
                    placeholder="delete"
                    className="mt-2"
                    autoFocus
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setBulkDeleteConfirmText('')
                setShowBulkDeleteDialog(false)
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeletingBulk || bulkDeleteConfirmText.toLowerCase() !== 'delete'}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeletingBulk ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete {selectedLeadsForDelete.size} Lead(s)
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </>
      )}
    </div>
  )
}
