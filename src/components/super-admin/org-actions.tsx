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
  CheckCircle, 
  XCircle, 
  Ban, 
  Trash2,
  Loader2,
  Copy,
} from 'lucide-react'

interface OrgActionsProps {
  orgId: string
  orgName: string
  orgCode: string
  status: string
}

export function OrgActions({ orgId, orgName, orgCode, status }: OrgActionsProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const copyOrgCode = () => {
    navigator.clipboard.writeText(orgCode)
    toast.success('Organization code copied!')
  }

  const handleAction = async (action: 'approve' | 'reject' | 'suspend') => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/super-admin/organizations/${orgId}`, {
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

  const handleDelete = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/super-admin/organizations/${orgId}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Delete failed')
        return
      }

      toast.success('Organization deleted')
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
          <DropdownMenuItem onClick={copyOrgCode}>
            <Copy className="mr-2 h-4 w-4" />
            Copy Org Code
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {status === 'pending' && (
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
            </>
          )}
          {status === 'active' && (
            <DropdownMenuItem 
              onClick={() => handleAction('suspend')}
              className="text-yellow-600"
            >
              <Ban className="mr-2 h-4 w-4" />
              Suspend
            </DropdownMenuItem>
          )}
          {status === 'suspended' && (
            <DropdownMenuItem 
              onClick={() => handleAction('approve')}
              className="text-green-600"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Reactivate
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={() => setShowDeleteDialog(true)}
            className="text-red-600"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{orgName}</strong> and all its users, 
              leads, and data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}








