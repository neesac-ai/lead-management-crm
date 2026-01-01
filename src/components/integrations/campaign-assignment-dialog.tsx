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

interface CampaignAssignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  integrationId: string
  orgSlug: string
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
  orgSlug,
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

  useEffect(() => {
    if (open) {
      fetchUsers()
      if (assignment) {
        setCampaignId(assignment.campaign_id)
        setCampaignName(assignment.campaign_name)
        setAssignedTo(assignment.assigned_to)
        setIsActive(assignment.is_active)
      } else {
        setCampaignId('')
        setCampaignName('')
        setAssignedTo('')
        setIsActive(true)
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

