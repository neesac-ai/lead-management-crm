/**
 * Utility functions for managing lead statuses
 */

export interface LeadStatus {
  id: string | null
  org_id: string
  status_value: string
  label: string
  color: string
  display_order: number
  is_protected: boolean
  is_active: boolean
}

const DEFAULT_STATUSES: Omit<LeadStatus, 'id' | 'org_id'>[] = [
  { status_value: 'new', label: 'New', color: 'bg-blue-500', is_protected: false, display_order: 0, is_active: true },
  { status_value: 'call_not_picked', label: 'Call Not Picked', color: 'bg-yellow-500', is_protected: false, display_order: 1, is_active: true },
  { status_value: 'not_interested', label: 'Not Interested', color: 'bg-gray-500', is_protected: false, display_order: 2, is_active: true },
  { status_value: 'follow_up_again', label: 'Follow Up Again', color: 'bg-orange-500', is_protected: true, display_order: 3, is_active: true },
  { status_value: 'demo_booked', label: 'Meeting Booked', color: 'bg-purple-500', is_protected: true, display_order: 4, is_active: true },
  { status_value: 'demo_completed', label: 'Meeting Completed', color: 'bg-indigo-500', is_protected: false, display_order: 5, is_active: true },
  { status_value: 'deal_won', label: 'Deal Won', color: 'bg-emerald-500', is_protected: true, display_order: 6, is_active: true },
  { status_value: 'deal_lost', label: 'Deal Lost', color: 'bg-red-500', is_protected: false, display_order: 7, is_active: true },
]

export const PROTECTED_STATUSES = ['follow_up_again', 'demo_booked', 'deal_won']

/**
 * Fetch lead statuses for the current organization
 */
export async function getLeadStatuses(): Promise<LeadStatus[]> {
  try {
    const response = await fetch('/api/lead-statuses', {
      cache: 'no-store',
    })

    if (!response.ok) {
      console.error('Failed to fetch lead statuses')
      return DEFAULT_STATUSES.map(s => ({ ...s, id: null, org_id: '' }))
    }

    const data = await response.json()
    return data.statuses || []
  } catch (error) {
    console.error('Error fetching lead statuses:', error)
    return DEFAULT_STATUSES.map(s => ({ ...s, id: null, org_id: '' }))
  }
}

/**
 * Get status label by value
 */
export function getStatusLabel(statuses: LeadStatus[], statusValue: string): string {
  const status = statuses.find(s => s.status_value === statusValue)
  return status?.label || statusValue
}

/**
 * Get status color by value
 */
export function getStatusColor(statuses: LeadStatus[], statusValue: string): string {
  const status = statuses.find(s => s.status_value === statusValue)
  return status?.color || 'bg-gray-500'
}

/**
 * Get status options for dropdowns (excluding 'new' and inactive statuses)
 */
export function getStatusOptions(statuses: LeadStatus[], excludeNew: boolean = true): Array<{ value: string; label: string; color: string }> {
  return statuses
    .filter(s => s.is_active && (!excludeNew || s.status_value !== 'new'))
    .sort((a, b) => a.display_order - b.display_order)
    .map(s => ({
      value: s.status_value,
      label: s.label,
      color: s.color,
    }))
}
