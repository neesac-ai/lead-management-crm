/**
 * Server-side utility to fetch menu names
 */

import { createClient } from '@/lib/supabase/server'

// Default menu items and labels
const DEFAULT_MENU_ITEMS: Record<string, string> = {
  dashboard: 'Dashboard',
  leads: 'Leads',
  'follow-ups': 'Follow-ups',
  meetings: 'Meetings',
  subscriptions: 'Subscriptions',
  analytics: 'Analytics',
  'call-tracking': 'Call Tracking',
  locations: 'Locations',
  assignment: 'Lead Assignment',
  integrations: 'Integrations',
  products: 'Products',
  team: 'Team',
  payments: 'Payments',
  invoices: 'Invoices',
  settings: 'Settings',
}

/**
 * Fetch menu names for the current organization (server-side)
 */
export async function getMenuNamesServer(): Promise<Record<string, string>> {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return {}
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('users')
      .select('org_id')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id) {
      return {}
    }

    // Fetch custom menu names
    const { data: customMenuNames } = await supabase
      .from('menu_names')
      .select('menu_key, custom_label')
      .eq('org_id', profile.org_id)

    if (!customMenuNames) {
      return {}
    }

    // Build map of custom labels
    const namesMap: Record<string, string> = {}
    customMenuNames.forEach(m => {
      namesMap[m.menu_key] = m.custom_label
    })

    return namesMap
  } catch (error) {
    console.error('Error fetching menu names (server):', error)
    return {}
  }
}

/**
 * Get menu label (custom or default) - server-side
 */
export function getMenuLabelServer(
  menuNames: Record<string, string>,
  key: string,
  defaultLabel: string
): string {
  return menuNames[key] || defaultLabel
}
