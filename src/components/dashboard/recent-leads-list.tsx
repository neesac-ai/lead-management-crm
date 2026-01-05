'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { LeadDetailDialog } from '@/components/leads/lead-detail-dialog'
import { createClient } from '@/lib/supabase/client'

type Lead = {
  id: string
  name: string
  status: string
}

type RecentLeadsListProps = {
  leads: Lead[]
  orgSlug: string
}

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    new: 'bg-blue-500',
    call_not_picked: 'bg-yellow-500',
    not_interested: 'bg-gray-500',
    follow_up_again: 'bg-orange-500',
    demo_booked: 'bg-purple-500',
    demo_completed: 'bg-indigo-500',
    deal_won: 'bg-emerald-500',
    deal_lost: 'bg-red-500',
  }
  return colors[status] || 'bg-gray-500'
}

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    new: 'New',
    call_not_picked: 'Call Not Picked',
    not_interested: 'Not Interested',
    follow_up_again: 'Follow Up Again',
    demo_booked: 'Meeting Booked',
    demo_completed: 'Meeting Completed',
    deal_won: 'Deal Won',
    deal_lost: 'Deal Lost',
  }
  return labels[status] || status.replace(/_/g, ' ')
}

export function RecentLeadsList({ leads, orgSlug }: RecentLeadsListProps) {
  const [selectedLead, setSelectedLead] = useState<any>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  const handleLeadClick = async (e: React.MouseEvent, leadId: string) => {
    e.preventDefault()
    e.stopPropagation()

    // Fetch full lead data
    const supabase = createClient()
    const { data: leadData } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (leadData) {
      setSelectedLead(leadData)
      setIsDetailOpen(true)
    }
  }

  return (
    <>
      <div className="space-y-3">
        {leads.map((lead) => (
          <div
            key={lead.id}
            onClick={(e) => handleLeadClick(e, lead.id)}
            className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <div className={`w-2 h-2 rounded-full ${getStatusColor(lead.status)}`} />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{lead.name}</p>
              <p className="text-sm text-muted-foreground">
                {getStatusLabel(lead.status)}
              </p>
            </div>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </div>
        ))}
      </div>
      {selectedLead && (
        <LeadDetailDialog
          lead={selectedLead}
          open={isDetailOpen}
          onOpenChange={(open) => {
            setIsDetailOpen(open)
            if (!open) {
              setSelectedLead(null)
            }
          }}
          onUpdate={(updatedLead) => {
            setSelectedLead(prev => prev ? { ...prev, ...updatedLead } : null)
          }}
        />
      )}
    </>
  )
}

