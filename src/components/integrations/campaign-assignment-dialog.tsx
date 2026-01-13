'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type User = {
  id: string
  name: string
  email: string
  role: string
}

type Integration = {
  id: string
  config?: Record<string, unknown> | null
}

type Campaign = {
  id: string
  name: string
}

interface CampaignAssignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  integrationId: string
  assignment?: {
    id: string
    campaign_id: string
    campaign_name: string
    assigned_to: string
    is_active: boolean
  } | null
  onSuccess: () => void
}

export function CampaignAssignmentDialog({
  open,
  onOpenChange,
  integrationId,
  assignment,
  onSuccess,
}: CampaignAssignmentDialogProps) {
  const [campaignId, setCampaignId] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [availableCampaigns, setAvailableCampaigns] = useState<Campaign[]>([])
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false)
  const [selectedCampaignOption, setSelectedCampaignOption] = useState<string>('')

  useEffect(() => {
    if (open) {
      fetchUsers()
      fetchAvailableCampaigns()
      if (assignment) {
        setCampaignId(assignment.campaign_id)
        setCampaignName(assignment.campaign_name)
        setAssignedTo(assignment.assigned_to)
        setIsActive(assignment.is_active)
        setSelectedCampaignOption(assignment.campaign_id)
      } else {
        setCampaignId('')
        setCampaignName('')
        setAssignedTo('')
        setIsActive(true)
        setSelectedCampaignOption('')
      }
    }
  }, [open, assignment])

  const fetchUsers = async () => {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('users')
        .select('org_id')
        .eq('auth_id', user.id)
        .single()

      if (!profile) return

      const { data: usersData, error } = await supabase
        .from('users')
        .select('id, name, email, role')
        .eq('org_id', profile.org_id)
        .eq('role', 'sales')
        .eq('is_approved', true)
        .eq('is_active', true)
        .order('name')

      if (error) throw error
      setUsers(usersData || [])
    } catch (error) {
      console.error('Error fetching users:', error)
      toast.error('Failed to load sales team')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchAvailableCampaigns = async () => {
    setIsLoadingCampaigns(true)
    try {
      const response = await fetch(`/api/integrations/${integrationId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch integration')
      }
      const data = (await response.json()) as { integration?: Integration }
      const config = (data.integration?.config || {}) as Record<string, unknown>
      const campaigns = (config.available_campaigns || []) as Campaign[]
      setAvailableCampaigns(Array.isArray(campaigns) ? campaigns : [])
    } catch (error) {
      console.error('Error fetching available campaigns:', error)
      // Non-blocking: user can still type manually
      setAvailableCampaigns([])
    } finally {
      setIsLoadingCampaigns(false)
    }
  }

  const handleCampaignSelect = (value: string) => {
    setSelectedCampaignOption(value)
    if (!value || value === '__custom__') {
      setCampaignId('')
      setCampaignName('')
      return
    }
    const selected = availableCampaigns.find((c) => c.id === value)
    if (selected) {
      setCampaignId(selected.id)
      setCampaignName(selected.name)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!campaignId || !campaignName || !assignedTo) {
      toast.error('Please fill in all required fields')
      return
    }

    setIsSaving(true)
    try {
      const url = assignment
        ? `/api/integrations/${integrationId}/campaign-assignments/${assignment.id}`
        : `/api/integrations/${integrationId}/campaign-assignments`

      const method = assignment ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          campaign_name: campaignName,
          assigned_to: assignedTo,
          is_active: isActive,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save assignment')
      }

      toast.success(
        assignment
          ? 'Campaign assignment updated successfully'
          : 'Campaign assignment created successfully'
      )
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error('Error saving assignment:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to save campaign assignment'
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {assignment ? 'Edit Campaign Assignment' : 'New Campaign Assignment'}
          </DialogTitle>
          <DialogDescription>
            Map a campaign to a sales rep for automatic lead assignment
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {!assignment && (
              <div className="space-y-2">
                <Label>Campaign</Label>
                {isLoadingCampaigns ? (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                ) : availableCampaigns.length > 0 ? (
                  <Select value={selectedCampaignOption} onValueChange={handleCampaignSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a fetched campaign (recommended)" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCampaigns.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom__">Custom (enter manually)</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    No campaigns found. Go to Integration → Settings and click <strong>Fetch Campaigns</strong>, then come back here.
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="campaignId">Campaign ID *</Label>
              <Input
                id="campaignId"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                placeholder="e.g., 123456789"
                required
                disabled={!!assignment} // Don't allow changing ID for existing assignments
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaignName">Campaign Name *</Label>
              <Input
                id="campaignName"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g., Summer Sale 2024"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assignedTo">Assign To *</Label>
              {isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : (
                <Select value={assignedTo} onValueChange={setAssignedTo} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select sales rep" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isActive"
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
              />
              <Label htmlFor="isActive" className="cursor-pointer">
                Active (assign leads from this campaign)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                assignment ? 'Update' : 'Create'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

