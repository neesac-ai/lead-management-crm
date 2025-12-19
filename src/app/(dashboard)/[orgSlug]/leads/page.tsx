'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LeadDetailDialog } from '@/components/leads/lead-detail-dialog'
import { Target, Plus, Loader2, Phone, Mail, User, UserCircle } from 'lucide-react'
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

const statusColors: Record<string, string> = {
  new: 'bg-blue-500',
  contacted: 'bg-yellow-500',
  qualified: 'bg-green-500',
  not_interested: 'bg-gray-500',
  follow_up_again: 'bg-orange-500',
  demo_booked: 'bg-purple-500',
  demo_completed: 'bg-indigo-500',
  negotiation: 'bg-pink-500',
  deal_won: 'bg-emerald-500',
  deal_lost: 'bg-red-500',
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
    
    // First get leads
    let query = supabase
      .from('leads')
      .select('id, name, email, phone, source, status, custom_fields, created_at, created_by, assigned_to')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })

    // Sales can only see leads assigned to them or created by them
    if (profile.role === 'sales') {
      // Fetch leads assigned to this sales person
      const { data: assignedLeads } = await supabase
        .from('leads')
        .select('id, name, email, phone, source, status, custom_fields, created_at, created_by, assigned_to')
        .eq('org_id', profile.org_id)
        .eq('assigned_to', profile.id)
        .order('created_at', { ascending: false })

      // Fetch leads created by this sales person
      const { data: createdLeads } = await supabase
        .from('leads')
        .select('id, name, email, phone, source, status, custom_fields, created_at, created_by, assigned_to')
        .eq('org_id', profile.org_id)
        .eq('created_by', profile.id)
        .order('created_at', { ascending: false })

      // Combine and deduplicate
      const allLeads = [...(assignedLeads || []), ...(createdLeads || [])]
      const uniqueLeads = allLeads.filter((lead, index, self) => 
        index === self.findIndex(l => l.id === lead.id)
      )

      // Get user names
      const userIds = new Set<string>()
      uniqueLeads.forEach(lead => {
        if (lead.created_by) userIds.add(lead.created_by)
        if (lead.assigned_to) userIds.add(lead.assigned_to)
      })

      let usersMap: Record<string, string> = {}
      if (userIds.size > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, name')
          .in('id', Array.from(userIds))
        
        usersData?.forEach(u => {
          usersMap[u.id] = u.name
        })
      }

      const leadsWithUsers = uniqueLeads.map(lead => ({
        ...lead,
        creator: lead.created_by ? { name: usersMap[lead.created_by] || 'Unknown' } : null,
        assignee: lead.assigned_to ? { name: usersMap[lead.assigned_to] || 'Unknown' } : null,
      }))

      setLeads(leadsWithUsers as Lead[])
      return
    }

    const { data: leadsData, error } = await query
    
    if (error) {
      console.error('Error fetching leads:', error)
      setLeads([])
      return
    }

    // Get user names for created_by and assigned_to
    const userIds = new Set<string>()
    leadsData?.forEach(lead => {
      if (lead.created_by) userIds.add(lead.created_by)
      if (lead.assigned_to) userIds.add(lead.assigned_to)
    })

    let usersMap: Record<string, string> = {}
    if (userIds.size > 0) {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name')
        .in('id', Array.from(userIds))
      
      usersData?.forEach(u => {
        usersMap[u.id] = u.name
      })
    }

    // Map leads with creator/assignee names
    const leadsWithUsers = (leadsData || []).map(lead => ({
      ...lead,
      creator: lead.created_by ? { name: usersMap[lead.created_by] || 'Unknown' } : null,
      assignee: lead.assigned_to ? { name: usersMap[lead.assigned_to] || 'Unknown' } : null,
    }))

    setLeads(leadsWithUsers as Lead[])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orgId || !userProfile) return

    setIsSaving(true)
    const supabase = createClient()

    // For sales, auto-assign to themselves
    const assignTo = userProfile.role === 'sales' ? userProfile.id : null

    const { error } = await supabase
      .from('leads')
      .insert({
        org_id: orgId,
        name: formData.name,
        email: formData.email || null,
        phone: formData.phone || null,
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
      fetchLeads(userProfile)
    }
    setIsSaving(false)
  }

  const isAdmin = userProfile?.role === 'admin'
  const isSales = userProfile?.role === 'sales'

  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title="Leads" 
        description={isAdmin ? "View all leads and assign to sales team" : "Manage your assigned leads"}
      />
      
      <div className="flex-1 p-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>
                {isAdmin ? 'All Leads' : 'My Leads'}
              </CardTitle>
              <CardDescription>
                {isAdmin 
                  ? 'View leads from all sources. Use Lead Assignment to distribute to sales team.'
                  : 'Leads assigned to you. Update status as you work on them.'
                }
              </CardDescription>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Lead
                </Button>
              </DialogTrigger>
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
                        <Label htmlFor="name">Name *</Label>
                        <Input
                          id="name"
                          placeholder="John Doe"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="company">Company</Label>
                        <Input
                          id="company"
                          placeholder="Acme Inc."
                          value={formData.company}
                          onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
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
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          placeholder="+1 234 567 890"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
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
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                          value={formData.status}
                          onValueChange={(value) => setFormData({ ...formData, status: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="contacted">Contacted</SelectItem>
                            <SelectItem value="qualified">Qualified</SelectItem>
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
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : leads.length > 0 ? (
              <div className="space-y-4">
                {leads.map((lead) => (
                  <div 
                    key={lead.id} 
                    className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedLead(lead)
                      setIsDetailOpen(true)
                    }}
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{lead.name}</p>
                        {lead.custom_fields?.company && (
                          <span className="text-sm text-muted-foreground">
                            @ {lead.custom_fields.company}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        {lead.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {lead.email}
                          </span>
                        )}
                        {lead.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {lead.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Creator/Assignee Info */}
                    <div className="text-right text-xs text-muted-foreground">
                      {lead.creator && (
                        <div className="flex items-center gap-1 justify-end">
                          <UserCircle className="h-3 w-3" />
                          <span>Created by {lead.creator.name}</span>
                        </div>
                      )}
                      {lead.assignee && (
                        <div className="flex items-center gap-1 justify-end text-primary">
                          <User className="h-3 w-3" />
                          <span>Assigned to {lead.assignee.name}</span>
                        </div>
                      )}
                      {!lead.assignee && isAdmin && (
                        <span className="text-yellow-600">Unassigned</span>
                      )}
                    </div>
                    <Badge variant="outline">{lead.source}</Badge>
                    <Badge className={statusColors[lead.status] || 'bg-gray-500'}>
                      {lead.status.replace('_', ' ')}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No leads yet</p>
                <p className="text-sm">
                  {isAdmin 
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
        canEditStatus={isSales} // Only sales can edit status
        isAdmin={isAdmin} // Admin can unassign leads
      />
    </div>
  )
}
