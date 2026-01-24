import { createClient } from '@/lib/supabase/server'

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

/**
 * Fetch lead statuses for an organization (server-side)
 */
export async function getLeadStatusesForOrg(orgId: string): Promise<LeadStatus[]> {
  try {
    const supabase = await createClient()

    const { data: customStatuses, error } = await supabase
      .from('lead_statuses')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (error) {
      console.error('Error fetching lead statuses:', error)
      return DEFAULT_STATUSES.map(s => ({ ...s, id: null, org_id: orgId }))
    }

    // If no custom statuses exist, return defaults
    if (!customStatuses || customStatuses.length === 0) {
      return DEFAULT_STATUSES.map(s => ({ ...s, id: null, org_id: orgId }))
    }

    // Merge custom statuses with defaults
    const customStatusMap = new Map(customStatuses.map(s => [s.status_value, s]))
    const allStatuses = DEFAULT_STATUSES.map(defaultStatus => {
      const custom = customStatusMap.get(defaultStatus.status_value)
      if (custom) {
        return custom
      }
      return {
        ...defaultStatus,
        org_id: orgId,
        id: null,
      }
    })

    // Add any custom status values that aren't in defaults
    customStatuses.forEach(custom => {
      if (!DEFAULT_STATUSES.find(d => d.status_value === custom.status_value)) {
        allStatuses.push(custom)
      }
    })

    return allStatuses.sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
  } catch (error) {
    console.error('Error in getLeadStatusesForOrg:', error)
    return DEFAULT_STATUSES.map(s => ({ ...s, id: null, org_id: orgId }))
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
