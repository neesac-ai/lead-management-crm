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
  custom_fields: { company?: string } | null
}

type SalesPerson = {
  id: string
  name: string
  email: string
  lead_allocation_percent: number
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
      .select('id, name, email, status, assigned_to, custom_fields')
      .eq('org_id', org.id)
      .is('assigned_to', null)
      .order('created_at', { ascending: false })

    setUnassignedLeads((leads || []) as Lead[])

    // Fetch sales team members
    const { data: sales } = await supabase
      .from('users')
      .select('id, name, email, lead_allocation_percent')
      .eq('org_id', org.id)
      .eq('role', 'sales')
      .eq('is_approved', true)

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
      
      <div className="flex-1 p-6 space-y-6">
        {/* Sales Team Allocation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Sales Team Allocation
            </CardTitle>
            <CardDescription>
              Set percentage allocation for auto-assignment (must total 100%)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : salesTeam.length > 0 ? (
              <div className="space-y-4">
                {salesTeam.map((sales) => (
                  <div key={sales.id} className="flex items-center gap-4 p-3 border rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{sales.name}</p>
                      <p className="text-sm text-muted-foreground">{sales.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={sales.lead_allocation_percent || 0}
                        onChange={(e) => updateAllocation(sales.id, parseInt(e.target.value) || 0)}
                        className="w-16 px-2 py-1 border rounded text-center"
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
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Unassigned Leads ({unassignedLeads.length})
              </CardTitle>
              <CardDescription>
                Select leads and assign to sales team members
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={handleAutoAssign}
                disabled={isAssigning || unassignedLeads.length === 0 || salesTeam.length === 0}
              >
                {isAssigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Auto-Assign All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : unassignedLeads.length > 0 ? (
              <>
                {/* Manual Assignment Controls */}
                <div className="flex items-center gap-4 mb-4 p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      checked={selectedLeads.length === unassignedLeads.length}
                      onCheckedChange={handleSelectAll}
                    />
                    <span className="text-sm">
                      {selectedLeads.length} selected
                    </span>
                  </div>
                  <Select value={selectedSales} onValueChange={setSelectedSales}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Select sales person" />
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
                    onClick={handleAssign}
                    disabled={isAssigning || selectedLeads.length === 0 || !selectedSales}
                  >
                    {isAssigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                    Assign Selected
                  </Button>
                </div>

                {/* Leads List */}
                <div className="space-y-2">
                  {unassignedLeads.map((lead) => (
                    <div 
                      key={lead.id} 
                      className={`flex items-center gap-4 p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedLeads.includes(lead.id) ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => handleSelectLead(lead.id)}
                    >
                      <Checkbox 
                        checked={selectedLeads.includes(lead.id)}
                        onCheckedChange={() => handleSelectLead(lead.id)}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{lead.name}</p>
                          {lead.custom_fields?.company && (
                            <span className="text-sm text-muted-foreground">
                              @ {lead.custom_fields.company}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{lead.email || 'No email'}</p>
                      </div>
                      <Badge variant="outline">{lead.status}</Badge>
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
