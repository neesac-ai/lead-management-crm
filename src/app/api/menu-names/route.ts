import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Default menu keys and labels
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
 * GET /api/menu-names
 * Fetch all menu names for the current organization
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('users')
      .select('org_id, role')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Fetch custom menu names
    const { data: customMenuNames, error } = await supabase
      .from('menu_names')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('menu_key', { ascending: true })

    if (error) {
      console.error('Error fetching menu names:', error)
      return NextResponse.json({ error: 'Failed to fetch menu names' }, { status: 500 })
    }

    // Build map of custom labels
    const customMap = new Map((customMenuNames || []).map(m => [m.menu_key, m.custom_label]))

    // Merge with defaults
    const allMenuNames: Record<string, { id: string | null; label: string }> = {}
    Object.keys(DEFAULT_MENU_ITEMS).forEach(key => {
      const custom = customMap.get(key)
      if (custom) {
        const menuItem = customMenuNames?.find(m => m.menu_key === key)
        allMenuNames[key] = {
          id: menuItem?.id || null,
          label: custom,
        }
      } else {
        allMenuNames[key] = {
          id: null,
          label: DEFAULT_MENU_ITEMS[key],
        }
      }
    })

    return NextResponse.json({ menuNames: allMenuNames })
  } catch (error) {
    console.error('Error in GET /api/menu-names:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/menu-names
 * Create or update a menu name
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('users')
      .select('org_id, role')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Only admins can manage menu names
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { menu_key, custom_label } = body

    if (!menu_key || !custom_label || !custom_label.trim()) {
      return NextResponse.json({ error: 'menu_key and custom_label are required' }, { status: 400 })
    }

    // Validate menu_key exists in defaults
    if (!DEFAULT_MENU_ITEMS[menu_key]) {
      return NextResponse.json({ error: 'Invalid menu_key' }, { status: 400 })
    }

    // Check if menu name already exists
    const { data: existing } = await supabase
      .from('menu_names')
      .select('id')
      .eq('org_id', profile.org_id)
      .eq('menu_key', menu_key)
      .single()

    if (existing) {
      // Update existing
      const { data: updated, error } = await supabase
        .from('menu_names')
        .update({
          custom_label: custom_label.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) {
        console.error('Error updating menu name:', error)
        return NextResponse.json({ error: 'Failed to update menu name' }, { status: 500 })
      }

      return NextResponse.json({ menuName: updated })
    } else {
      // Create new
      const { data: created, error } = await supabase
        .from('menu_names')
        .insert({
          org_id: profile.org_id,
          menu_key,
          custom_label: custom_label.trim(),
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating menu name:', error)
        return NextResponse.json({ error: 'Failed to create menu name' }, { status: 500 })
      }

      return NextResponse.json({ menuName: created }, { status: 201 })
    }
  } catch (error) {
    console.error('Error in POST /api/menu-names:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
