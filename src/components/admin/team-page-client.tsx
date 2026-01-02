'use client'

import { useState } from 'react'
import { ManagerAssignmentDialog } from './manager-assignment-dialog'
import { TeamMemberActions } from './team-member-actions'

type TeamMember = {
  id: string
  name: string
  email: string
  avatar_url: string | null
  role: string
  is_approved: boolean
  is_active: boolean
  created_at: string
  manager_id: string | null
  manager?: {
    id: string
    name: string
    email: string
  } | null
}

interface TeamPageClientProps {
  members: TeamMember[]
  orgId: string
  getRoleBadge: (role: string) => React.ReactNode
  formatDistanceToNow: (date: Date, options: { addSuffix: boolean }) => string
}

export function TeamPageClient({ members, orgId, getRoleBadge, formatDistanceToNow }: TeamPageClientProps) {
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)
  const [showManagerDialog, setShowManagerDialog] = useState(false)

  const handleAssignManager = (member: TeamMember) => {
    setSelectedMember(member)
    setShowManagerDialog(true)
  }

  return (
    <>
      {members.map((member) => (
        <div 
          key={member.id} 
          className="p-4 rounded-lg border bg-card"
        >
          <div className="flex items-start gap-3 mb-3">
            {/* Avatar and basic info will be rendered by parent */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{member.name}</p>
              <p className="text-sm text-muted-foreground truncate">{member.email}</p>
              {member.manager && (
                <p className="text-xs text-muted-foreground mt-1">
                  Manager: {member.manager.name}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getRoleBadge(member.role)}
            </div>
            <TeamMemberActions 
              userId={member.id} 
              userName={member.name}
              userEmail={member.email}
              isApproved={member.is_approved}
              isActive={member.is_active}
              onAssignManager={() => handleAssignManager(member)}
            />
          </div>
        </div>
      ))}

      {selectedMember && (
        <ManagerAssignmentDialog
          userId={selectedMember.id}
          userName={selectedMember.name}
          currentManagerId={selectedMember.manager_id}
          orgId={orgId}
          onSuccess={() => {
            setShowManagerDialog(false)
            setSelectedMember(null)
          }}
          open={showManagerDialog}
          onOpenChange={setShowManagerDialog}
        />
      )}
    </>
  )
}

