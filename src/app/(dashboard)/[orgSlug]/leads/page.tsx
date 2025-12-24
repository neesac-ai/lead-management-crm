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
import { Target, Plus, Loader2, Phone, Mail, User, UserCircle, AlertTriangle, Upload, FileSpreadsheet, CheckCircle, AlertCircle, X, UserCheck, Users, Filter, Calendar, Package, Trash2 } from 'lucide-react'
import { differenceInDays } from 'date-fns'
import { toast } from 'sonner'

type Lead = {
  id: string
  name: string
  email: string | null
  phone: string | null
  source: string
  status: string
  custom_fields: { company?: string } | null
  created_at: string
  created_by: string | null
  assigned_to: string | null
  creator: { name: string } | null
  assignee: { name: string } | null
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
  
  // Duplicate detection state
  const [duplicateLead, setDuplicateLead] = useState<DuplicateLead | null>(null)
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false)
  
  // Bulk delete state
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set())
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  
  // Import dialog state
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [selectedDuplicates, setSelectedDuplicates] = useState<Set<string>>(new Set())
  const [importResult, setImportResult] = useState<{ success: number; failed: number; skipped: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    let query = supabase
      .from('leads')
      .select(`
        id, name, email, phone, source, status, custom_fields, created_at, created_by, assigned_to,
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

    // Map leads - relationships already included
    const leadsWithUsers = (leadsData || []).map(lead => ({
      ...lead,
      creator: lead.creator as { name: string } | null,
      assignee: lead.assignee as { name: string } | null,
    }))

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
    
    return true
  })

  // Check if any filter is active
  const hasActiveFilters = statusFilter !== 'all' || selectedTagFilter !== 'all' || 
    selectedSalesRep !== 'all' || selectedProduct !== 'all' || 
    (leadAgeOperator !== 'all' && leadAgeDays) || dateFrom || dateTo

  // Clear all filters
  const clearAllFilters = () => {
    setStatusFilter('all')
    setSelectedTagFilter('all')
    setSelectedSalesRep('all')
    setSelectedProduct('all')
    setLeadAgeOperator('all')
    setLeadAgeDays('')
    setDateFrom('')
    setDateTo('')
  }

  // Bulk delete functions
  const toggleDeleteMode = () => {
    if (isDeleteMode) {
      // Exit delete mode
      setIsDeleteMode(false)
      setSelectedForDelete(new Set())
    } else {
      // Enter delete mode
      setIsDeleteMode(true)
    }
  }

  const toggleLeadSelection = (leadId: string) => {
    setSelectedForDelete(prev => {
      const next = new Set(prev)
      if (next.has(leadId)) {
        next.delete(leadId)
      } else {
        next.add(leadId)
      }
      return next
    })
  }

  const selectAllFiltered = () => {
    if (selectedForDelete.size === filteredLeads.length) {
      setSelectedForDelete(new Set())
    } else {
      setSelectedForDelete(new Set(filteredLeads.map(l => l.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedForDelete.size === 0) return
    
    setIsDeleting(true)
    let successCount = 0
    let failCount = 0

    for (const leadId of selectedForDelete) {
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
        console.error('Error deleting lead:', error)
        failCount++
      }
    }

    setIsDeleting(false)
    setShowBulkDeleteDialog(false)
    setSelectedForDelete(new Set())
    setIsDeleteMode(false)

    if (successCount > 0) {
      toast.success(`${successCount} lead(s) deleted successfully`)
      if (userProfile) fetchLeads(userProfile)
    }
    if (failCount > 0) {
      toast.error(`Failed to delete ${failCount} lead(s)`)
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
                  {isDeleteMode ? (
                    <>
                      <Button variant="ghost" onClick={toggleDeleteMode}>
                        Cancel
                      </Button>
                      <Button 
                        variant="destructive" 
                        onClick={() => setShowBulkDeleteDialog(true)}
                        disabled={selectedForDelete.size === 0}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete ({selectedForDelete.size})
                      </Button>
                    </>
                  ) : (
                    <>
                      {/* Import button - available for both admin and sales */}
                      <Button variant="outline" onClick={() => { resetImportDialog(); setIsImportDialogOpen(true) }}>
                        <Upload className="mr-2 h-4 w-4" />
                        Import
                      </Button>
                      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                          <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Lead
                          </Button>
                        </DialogTrigger>
                      </Dialog>
                    </>
                  )}
                </div>
              </div>
              {/* Delete button - Admin Only - Far Right */}
              {isAdmin && !isDeleteMode && (
                <Button 
                  variant="outline" 
                  onClick={toggleDeleteMode}
                  className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              )}
            </div>
            
            {/* Filters */}
            <div className="space-y-3">
              {/* Primary filters row */}
              <div className="flex flex-wrap items-center gap-2">
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
                    <SelectTrigger className="w-[140px]">
                      <Package className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Product" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Products</SelectItem>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

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
              {showFilters && (
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
                {/* Select All in Delete Mode */}
                {isDeleteMode && (
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border">
                    <Checkbox 
                      checked={selectedForDelete.size === filteredLeads.length && filteredLeads.length > 0}
                      onCheckedChange={selectAllFiltered}
                    />
                    <span className="text-sm font-medium">
                      {selectedForDelete.size === filteredLeads.length 
                        ? `All ${filteredLeads.length} selected` 
                        : `Select all ${filteredLeads.length} leads`}
                    </span>
                  </div>
                )}
                {filteredLeads.map((lead) => (
                  <div 
                    key={lead.id} 
                    className={`p-4 rounded-lg border bg-card transition-colors ${
                      isDeleteMode 
                        ? selectedForDelete.has(lead.id) 
                          ? 'border-red-500 bg-red-50 dark:bg-red-950/20' 
                          : 'hover:bg-muted/50 cursor-pointer'
                        : 'hover:bg-muted/50 cursor-pointer'
                    }`}
                    onClick={() => {
                      if (isDeleteMode) {
                        toggleLeadSelection(lead.id)
                      } else {
                        setSelectedLead(lead)
                        setIsDetailOpen(true)
                      }
                    }}
                  >
                    {/* Top row: Checkbox (delete mode) / Phone (primary) + Status */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        {isDeleteMode && (
                          <Checkbox 
                            checked={selectedForDelete.has(lead.id)}
                            onCheckedChange={() => toggleLeadSelection(lead.id)}
                            className="mt-1"
                          />
                        )}
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
                      <Badge className={`${statusColors[lead.status] || 'bg-gray-500'} shrink-0`}>
                        {getStatusLabel(lead.status)}
                      </Badge>
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
                      <div className="text-right">
                        {lead.assignee ? (
                          <span className="text-primary">→ {lead.assignee.name}</span>
                        ) : isAdmin ? (
                          <span className="text-yellow-600">Unassigned</span>
                        ) : null}
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

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete {selectedForDelete.size} Lead{selectedForDelete.size !== 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>This will permanently delete the selected leads and all associated data including:</p>
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
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete {selectedForDelete.size} Lead{selectedForDelete.size !== 1 ? 's' : ''}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
