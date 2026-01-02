'use client'

import { useState, useEffect } from 'react'
import { ManagerAssignmentDialog } from './manager-assignment-dialog'

interface TeamManagerWrapperProps {
  children: React.ReactNode
  orgId: string
}

export function TeamManagerWrapper({ children, orgId }: TeamManagerWrapperProps) {
  const [selectedMember, setSelectedMember] = useState<{ id: string; name: string; managerId?: string | null } | null>(null)
  const [showDialog, setShowDialog] = useState(false)

  useEffect(() => {
    const handleOpenDialog = (event: CustomEvent) => {
      const member = event.detail
      setSelectedMember({
        id: member.id,
        name: member.name,
        managerId: member.manager_id || member.manager?.id,
      })
      setShowDialog(true)
    }

    window.addEventListener('openManagerDialog' as any, handleOpenDialog as EventListener)
    return () => {
      window.removeEventListener('openManagerDialog' as any, handleOpenDialog as EventListener)
    }
  }, [])

  return (
    <>
      {children}
      {selectedMember && (
        <ManagerAssignmentDialog
          userId={selectedMember.id}
          userName={selectedMember.name}
          currentManagerId={selectedMember.managerId || null}
          orgId={orgId}
          onSuccess={() => {
            setShowDialog(false)
            setSelectedMember(null)
            window.location.reload()
          }}
          open={showDialog}
          onOpenChange={setShowDialog}
        />
      )}
    </>
  )
}

