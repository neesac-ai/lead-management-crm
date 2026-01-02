'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import { Button } from '@/components/ui/button'
import { Loader2, UserMinus } from 'lucide-react'
import { toast } from 'sonner'

interface ManagerAssignmentDialogProps {
  userId: string
  userName: string
  currentManagerId?: string | null
  orgId: string
  onSuccess: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

type User = {
  id: string
  name: string
  email: string
  role: string
}

export function ManagerAssignmentDialog({
  userId,
  userName,
  currentManagerId,
  orgId,
  onSuccess,
  open,
  onOpenChange,
}: ManagerAssignmentDialogProps) {
  const router = useRouter()
  const [availableManagers, setAvailableManagers] = useState<User[]>([])
  const [selectedManagerId, setSelectedManagerId] = useState<string>(currentManagerId || 'none')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingManagers, setIsLoadingManagers] = useState(true)

  useEffect(() => {
    if (open) {
      fetchAvailableManagers()
      setSelectedManagerId(currentManagerId || 'none')
    }
  }, [open, currentManagerId, orgId, userId])

  const fetchAvailableManagers = async () => {
    setIsLoadingManagers(true)
    try {
      // Fetch all active users in the org (excluding the current user and their reportees)
      const response = await fetch(`/api/admin/team/hierarchy?orgId=${orgId}`)
      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Failed to fetch managers')
        return
      }

      // Get all users from the flat hierarchy
      const allUsers = data.flat || []

      // Filter to get potential managers:
      // - Must be active
      // - Cannot be the current user
      // - Cannot be a reportee of the current user (would create cycle)
      let reporteeIds = new Set<string>()
      try {
        const reporteesResponse = await fetch(`/api/admin/team/${userId}/reportees`)
        const reporteesData = await reporteesResponse.json()
        reporteeIds = new Set(reporteesData?.reportees?.map((r: User) => r.id) || [])
      } catch (error) {
        console.error('Error fetching reportees:', error)
      }

      const managers = allUsers.filter((user: User & { is_active?: boolean }) =>
        user.id !== userId &&
        user.is_active !== false &&
        !reporteeIds.has(user.id) &&
        (user.role === 'admin' || user.role === 'sales')
      )

      setAvailableManagers(managers)
    } catch (error) {
      console.error('Error fetching managers:', error)
      toast.error('Failed to load available managers')
    } finally {
      setIsLoadingManagers(false)
    }
  }

  const handleAssign = async () => {
    if (!selectedManagerId || selectedManagerId === 'none') {
      toast.error('Please select a manager')
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/admin/team/${userId}/assign-manager`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerId: selectedManagerId }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Failed to assign manager')
        return
      }

      toast.success('Manager assigned successfully')
      onSuccess()
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      console.error('Error assigning manager:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemove = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/admin/team/${userId}/remove-manager`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Failed to remove manager')
        return
      }

      toast.success('Manager removed successfully')
      onSuccess()
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      console.error('Error removing manager:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const currentManager = availableManagers.find(m => m.id === currentManagerId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Manager</DialogTitle>
          <DialogDescription>
            Assign a manager to <strong>{userName}</strong>. Managers can view and manage all leads assigned to their reportees.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {currentManager && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Current Manager:</p>
              <p className="font-medium">{currentManager.name}</p>
              <p className="text-sm text-muted-foreground">{currentManager.email}</p>
            </div>
          )}

          {isLoadingManagers ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Manager</label>
              <Select
                value={selectedManagerId}
                onValueChange={setSelectedManagerId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Manager</SelectItem>
                  {availableManagers.map((manager) => (
                    <SelectItem key={manager.id} value={manager.id}>
                      {manager.name} ({manager.email}) - {manager.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableManagers.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No available managers. All users are either reportees or inactive.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          {currentManager && (
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={isLoading}
            >
              <UserMinus className="mr-2 h-4 w-4" />
              Remove Manager
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              disabled={isLoading || isLoadingManagers || !selectedManagerId || selectedManagerId === 'none'}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Assigning...
                </>
              ) : (
                'Assign Manager'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

