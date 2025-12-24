'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UserPlus, User, Loader2, Users, Target } from 'lucide-react'
import { toast } from 'sonner'

type Lead = {
  id: string
  name: string
  email: string | null
  status: string
  assigned_to: string | null
  created_by: string | null
  custom_fields: { company?: string } | null
  created_at: string
  // For leads from deactivated members
  previous_owner?: string
}

type SalesPerson = {
  id: string
  name: string
  email: string
  lead_allocation_percent: number
  is_active: boolean
}

export default function AssignmentPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  
  const [unassignedLeads, setUnassignedLeads] = useState<Lead[]>([])
  const [salesTeam, setSalesTeam] = useState<SalesPerson[]>([])
  const [selectedLeads, setSelectedLeads] = useState<string[]>([])
  const [selectedSales, setSelectedSales] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isAssigning, setIsAssigning] = useState(false)
  const [orgId, setOrgId] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [orgSlug])

  const fetchData = async () => {
    const supabase = createClient()
    
    // Get org ID
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', orgSlug)
      .single()

    if (!org) {
      setIsLoading(false)
      return
    }
    
    setOrgId(org.id)

    // Fetch unassigned leads
    const { data: leads } = await supabase
      .from('leads')
      .select('id, name, email, status, assigned_to, created_by, custom_fields, created_at')
      .eq('org_id', org.id)
      .is('assigned_to', null)
      .order('created_at', { ascending: false })

    setUnassignedLeads((leads || []) as Lead[])

    // Fetch active sales team members only
    const { data: sales } = await supabase
      .from('users')
      .select('id, name, email, lead_allocation_percent, is_active')
      .eq('org_id', org.id)
      .eq('role', 'sales')
      .eq('is_approved', true)
      .eq('is_active', true)

    setSalesTeam((sales || []) as SalesPerson[])
    setIsLoading(false)
  }

  const handleSelectAll = () => {
    if (selectedLeads.length === unassignedLeads.length) {
      setSelectedLeads([])
    } else {
      setSelectedLeads(unassignedLeads.map(l => l.id))
    }
  }

  const handleSelectLead = (leadId: string) => {
    if (selectedLeads.includes(leadId)) {
      setSelectedLeads(selectedLeads.filter(id => id !== leadId))
    } else {
      setSelectedLeads([...selectedLeads, leadId])
    }
  }

  const handleAssign = async () => {
    if (!selectedSales || selectedLeads.length === 0) {
      toast.error('Select leads and a sales person')
      return
    }

    setIsAssigning(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('leads')
      .update({ assigned_to: selectedSales, updated_at: new Date().toISOString() })
      .in('id', selectedLeads)

    if (error) {
      toast.error('Failed to assign leads')
      console.error(error)
    } else {
      toast.success(`${selectedLeads.length} lead(s) assigned successfully`)
      setSelectedLeads([])
      setSelectedSales('')
      fetchData()
    }
    setIsAssigning(false)
  }

  const handleAutoAssign = async () => {
    if (salesTeam.length === 0) {
      toast.error('No sales team members available')
      return
    }

    if (unassignedLeads.length === 0) {
      toast.error('No unassigned leads')
      return
    }

    // Check if allocation percentages are set
    const totalPercent = salesTeam.reduce((sum, s) => sum + (s.lead_allocation_percent || 0), 0)
    
    setIsAssigning(true)
    const supabase = createClient()

    if (totalPercent === 100) {
      // Distribute based on percentages
      let assignedCount = 0
      for (const sales of salesTeam) {
        const count = Math.round((sales.lead_allocation_percent / 100) * unassignedLeads.length)
        const leadsToAssign = unassignedLeads.slice(assignedCount, assignedCount + count)
        
        if (leadsToAssign.length > 0) {
          await supabase
            .from('leads')
            .update({ assigned_to: sales.id, updated_at: new Date().toISOString() })
            .in('id', leadsToAssign.map(l => l.id))
        }
        assignedCount += count
      }
      
      // Assign remaining to first sales person
      if (assignedCount < unassignedLeads.length) {
        const remaining = unassignedLeads.slice(assignedCount)
        await supabase
          .from('leads')
          .update({ assigned_to: salesTeam[0].id, updated_at: new Date().toISOString() })
          .in('id', remaining.map(l => l.id))
      }
    } else {
      // Equal distribution (round-robin)
      for (let i = 0; i < unassignedLeads.length; i++) {
        const salesIndex = i % salesTeam.length
        await supabase
          .from('leads')
          .update({ assigned_to: salesTeam[salesIndex].id, updated_at: new Date().toISOString() })
          .eq('id', unassignedLeads[i].id)
      }
    }

    toast.success(`${unassignedLeads.length} leads auto-assigned`)
    fetchData()
    setIsAssigning(false)
  }

  const updateAllocation = async (userId: string, percent: number) => {
    const supabase = createClient()
    await supabase
      .from('users')
      .update({ lead_allocation_percent: percent })
      .eq('id', userId)
    
    setSalesTeam(salesTeam.map(s => 
      s.id === userId ? { ...s, lead_allocation_percent: percent } : s
    ))
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title="Lead Assignment" 
        description="Assign leads to your sales team"
      />
      
      <div className="flex-1 p-4 lg:p-6 space-y-4 lg:space-y-6">
        {/* Sales Team Allocation */}
        <Card>
          <CardHeader className="px-4 lg:px-6">
            <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
              <Users className="h-5 w-5" />
              Sales Team Allocation
            </CardTitle>
            <CardDescription>
              Set % allocation for auto-assignment
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 lg:px-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : salesTeam.length > 0 ? (
              <div className="space-y-3">
                {salesTeam.map((sales) => (
                  <div key={sales.id} className="flex items-center gap-3 p-3 border rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{sales.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{sales.email}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={sales.lead_allocation_percent || 0}
                        onChange={(e) => updateAllocation(sales.id, parseInt(e.target.value) || 0)}
                        className="w-14 px-2 py-1 border rounded text-center text-sm"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm font-medium">Total:</span>
                  <span className={`text-sm font-bold ${
                    salesTeam.reduce((sum, s) => sum + (s.lead_allocation_percent || 0), 0) === 100
                      ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {salesTeam.reduce((sum, s) => sum + (s.lead_allocation_percent || 0), 0)}%
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No approved sales team members</p>
                <p className="text-sm">Approve sales registrations in the Team page first</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Unassigned Leads */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 lg:px-6">
            <div>
              <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                <Target className="h-5 w-5" />
                Unassigned ({unassignedLeads.length})
              </CardTitle>
              <CardDescription>
                Assign leads to sales team
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleAutoAssign}
              disabled={isAssigning || unassignedLeads.length === 0 || salesTeam.length === 0}
              className="w-full sm:w-auto"
            >
              {isAssigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Auto-Assign All
            </Button>
          </CardHeader>
          <CardContent className="px-4 lg:px-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : unassignedLeads.length > 0 ? (
              <>
                {/* Manual Assignment Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4 p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      checked={selectedLeads.length === unassignedLeads.length}
                      onCheckedChange={handleSelectAll}
                    />
                    <span className="text-sm font-medium">
                      {selectedLeads.length} selected
                    </span>
                  </div>
                  <div className="flex flex-1 items-center gap-2">
                    <Select value={selectedSales} onValueChange={setSelectedSales}>
                      <SelectTrigger className="flex-1 sm:w-[180px]">
                        <SelectValue placeholder="Select person" />
                      </SelectTrigger>
                      <SelectContent>
                        {salesTeam.map((sales) => (
                          <SelectItem key={sales.id} value={sales.id}>
                            {sales.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button 
                      size="sm"
                      onClick={handleAssign}
                      disabled={isAssigning || selectedLeads.length === 0 || !selectedSales}
                    >
                      {isAssigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                      <span className="hidden sm:inline ml-2">Assign</span>
                    </Button>
                  </div>
                </div>

                {/* Leads List */}
                <div className="space-y-2">
                  {unassignedLeads.map((lead) => (
                    <div 
                      key={lead.id} 
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedLeads.includes(lead.id) ? 'bg-primary/10 border-primary' : ''
                      }`}
                      onClick={() => handleSelectLead(lead.id)}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox 
                          checked={selectedLeads.includes(lead.id)}
                          onCheckedChange={() => handleSelectLead(lead.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium truncate">{lead.name}</p>
                              {lead.custom_fields?.company && (
                                <p className="text-sm text-muted-foreground truncate">
                                  {lead.custom_fields.company}
                                </p>
                              )}
                            </div>
                            <Badge variant="outline" className="shrink-0">{lead.status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 truncate">{lead.email || 'No email'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <UserPlus className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">All leads are assigned</p>
                <p className="text-sm">New unassigned leads will appear here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
