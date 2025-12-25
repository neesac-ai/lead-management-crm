'use client'

import { useState } from 'react'
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
  Trash2,
  Loader2,
  AlertTriangle,
} from 'lucide-react'

interface SuperAdminUserActionsProps {
  userId: string
  userName: string
  userRole: string
  orgId: string | null
}

export function SuperAdminUserActions({ userId, userName, userRole, orgId }: SuperAdminUserActionsProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const isAdmin = userRole === 'admin'

  const handleDelete = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/super-admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteTeam: isAdmin }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Delete failed')
        return
      }

      toast.success(isAdmin 
        ? `Admin ${userName} and their team deleted` 
        : `User ${userName} deleted`
      )
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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem 
            onClick={() => setShowDeleteDialog(true)}
            className="text-red-600"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {isAdmin ? 'Delete Admin & Team' : 'Delete User'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              {isAdmin ? 'Delete Admin and Team?' : 'Delete User?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {isAdmin ? (
                  <>
                    <p>This will permanently delete:</p>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      <li>Admin account: <strong>{userName}</strong></li>
                      <li>All team members under this admin</li>
                      <li>The organization and all its data</li>
                    </ul>
                    <p className="text-red-600 font-medium">This action cannot be undone!</p>
                  </>
                ) : (
                  <p>
                    This will permanently delete <strong>{userName}</strong> from the system.
                    This action cannot be undone.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {isAdmin ? 'Delete Admin & Team' : 'Delete User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}



