'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { toast } from 'sonner'
import { 
  MoreHorizontal, 
  CheckCircle, 
  XCircle, 
  UserX,
  UserCheck,
  Trash2,
  Loader2,
  AlertTriangle,
  Users,
} from 'lucide-react'

interface TeamMemberActionsProps {
  userId: string
  userName: string
  userEmail?: string
  isApproved: boolean
  isActive: boolean
  managerId?: string | null
}

export function TeamMemberActions({ userId, userName, userEmail, isApproved, isActive, managerId }: TeamMemberActionsProps) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleAction = async (action: 'approve' | 'reject') => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/admin/team/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Action failed')
        return
      }

      toast.success(data.message)
      router.refresh()
    } catch (error) {
      console.error('Action error:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleStatus = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/admin/team/${userId}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Action failed')
        return
      }

      toast.success(data.message)
      router.refresh()
    } catch (error) {
      console.error('Status toggle error:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
      setShowDeactivateDialog(false)
    }
  }

  const handlePermanentDelete = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/admin/team/${userId}/delete`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Failed to delete user')
        return
      }

      if (data.warning) {
        toast.warning(data.message)
      } else {
        toast.success(data.message)
      }
      router.refresh()
    } catch (error) {
      console.error('Delete error:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
      setShowDeleteDialog(false)
    }
  }

  if (isLoading) {
    return (
      <Button variant="ghost" size="icon" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    )
  }

  // Prevent hydration mismatch by only rendering after mount
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" disabled>
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!isApproved && (
            <>
              <DropdownMenuItem 
                onClick={() => handleAction('approve')}
                className="text-green-600"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Approve
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleAction('reject')}
                className="text-red-600"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {isApproved && (
            <>
              <DropdownMenuItem 
                onClick={() => {
                  const event = new CustomEvent('openManagerDialog', { 
                    detail: { id: userId, name: userName, manager_id: managerId }
                  })
                  window.dispatchEvent(event)
                }}
                className="text-blue-600"
              >
                <Users className="mr-2 h-4 w-4" />
                Assign Manager
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => setShowDeactivateDialog(true)}
                className={isActive ? "text-orange-600" : "text-green-600"}
              >
                {isActive ? (
                  <>
                    <UserX className="mr-2 h-4 w-4" />
                    Deactivate
                  </>
                ) : (
                  <>
                    <UserCheck className="mr-2 h-4 w-4" />
                    Reactivate
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => setShowDeleteDialog(true)}
                className="text-red-600"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Permanently
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isActive ? 'Deactivate' : 'Reactivate'} Team Member?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isActive ? (
                <>
                  This will deactivate <strong>{userName}</strong>. They will no longer be able to login.
                  All their assigned leads will be moved to unassigned leads section.
                  Their activity history will be preserved.
                </>
              ) : (
                <>
                  This will reactivate <strong>{userName}</strong>. They will be able to login again.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleToggleStatus}
              className={isActive ? "bg-orange-600 hover:bg-orange-700" : "bg-green-600 hover:bg-green-700"}
            >
              {isActive ? 'Deactivate' : 'Reactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Permanently Delete User?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will permanently delete <strong>{userName}</strong>
                  {userEmail && <span className="text-muted-foreground"> ({userEmail})</span>}.
                </p>
                <div className="bg-muted rounded-lg p-3 text-sm space-y-2">
                  <p className="font-medium text-foreground">What will happen:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>User account will be deleted</li>
                    <li>Email will be freed for new registrations</li>
                    <li>Assigned leads will become unassigned</li>
                    <li className="text-green-600">All lead data and activity history will be preserved</li>
                  </ul>
                </div>
                <p className="text-red-600 font-medium">
                  This action cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handlePermanentDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}









