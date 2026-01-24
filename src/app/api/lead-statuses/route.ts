import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering to avoid caching
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Default statuses with their labels and colors
const DEFAULT_STATUSES = [
  { status_value: 'new', label: 'New', color: 'bg-blue-500', is_protected: false, display_order: 0 },
  { status_value: 'call_not_picked', label: 'Call Not Picked', color: 'bg-yellow-500', is_protected: false, display_order: 1 },
  { status_value: 'not_interested', label: 'Not Interested', color: 'bg-gray-500', is_protected: false, display_order: 2 },
  { status_value: 'follow_up_again', label: 'Follow Up Again', color: 'bg-orange-500', is_protected: true, display_order: 3 },
  { status_value: 'demo_booked', label: 'Meeting Booked', color: 'bg-purple-500', is_protected: true, display_order: 4 },
  { status_value: 'demo_completed', label: 'Meeting Completed', color: 'bg-indigo-500', is_protected: false, display_order: 5 },
  { status_value: 'deal_won', label: 'Deal Won', color: 'bg-emerald-500', is_protected: true, display_order: 6 },
  { status_value: 'deal_lost', label: 'Deal Lost', color: 'bg-red-500', is_protected: false, display_order: 7 },
]

// Protected statuses that cannot be deleted
const PROTECTED_STATUSES = ['follow_up_again', 'demo_booked', 'deal_won']

/**
 * GET /api/lead-statuses
 * Fetch all lead statuses for the current organization
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

    // Fetch custom statuses (force fresh data, no cache)
    // Note: is_active can be null for existing records, so we check for is_active !== false
    const { data: customStatuses, error } = await supabase
      .from('lead_statuses')
      .select('*')
      .eq('org_id', profile.org_id)
      .or('is_active.is.null,is_active.eq.true')
      .order('display_order', { ascending: true })

    console.log('[GET /api/lead-statuses] Fetched custom statuses:', customStatuses)
    console.log('[GET /api/lead-statuses] Org ID:', profile.org_id)
    if (error) {
      console.error('[GET /api/lead-statuses] Query error:', error)
    }

    if (error) {
      console.error('Error fetching lead statuses:', error)
      return NextResponse.json({ error: 'Failed to fetch lead statuses' }, { status: 500 })
    }

    // If no custom statuses exist, initialize defaults in the database
    if (!customStatuses || customStatuses.length === 0) {
      // Insert default statuses for this organization
      const defaultStatusesToInsert = DEFAULT_STATUSES.map(s => ({
        org_id: profile.org_id,
        status_value: s.status_value,
        label: s.label,
        color: s.color,
        display_order: s.display_order,
        is_protected: s.is_protected,
        is_active: s.is_active,
      }))

      const { data: insertedStatuses, error: insertError } = await supabase
        .from('lead_statuses')
        .insert(defaultStatusesToInsert)
        .select()

      if (insertError) {
        console.error('Error initializing default statuses:', insertError)
        // Return defaults even if insert fails
        return NextResponse.json({
          statuses: DEFAULT_STATUSES.map(s => ({
            ...s,
            org_id: profile.org_id,
            id: null,
          }))
        })
      }

      return NextResponse.json({
        statuses: insertedStatuses || DEFAULT_STATUSES.map(s => ({
          ...s,
          org_id: profile.org_id,
          id: null,
        }))
      })
    }

    // Merge custom statuses with defaults (in case new statuses were added)
    // Track which status_values have been customized (even if deleted) to prevent showing defaults
    const allCustomStatuses = await supabase
      .from('lead_statuses')
      .select('status_value')
      .eq('org_id', profile.org_id)
      // Include both active and inactive to know which were customized
      .order('display_order', { ascending: true })

    const customizedStatusValues = new Set(
      (allCustomStatuses.data || []).map((s: any) => s.status_value)
    )

    const customStatusMap = new Map(customStatuses.map(s => [s.status_value, s]))
    const allStatuses = DEFAULT_STATUSES.map(defaultStatus => {
      const custom = customStatusMap.get(defaultStatus.status_value)
      if (custom) {
        return custom
      }
      // Only return default if it was never customized (or was customized but is now active)
      // If it was customized and deleted (is_active: false), don't show the default
      if (customizedStatusValues.has(defaultStatus.status_value)) {
        // This status was customized but is now inactive - don't show it
        return null
      }
      // New default status not yet customized - return default with org_id
      return {
        ...defaultStatus,
        org_id: profile.org_id,
        id: null,
      }
    }).filter((s): s is NonNullable<typeof s> => s !== null)

    // Add any custom status values that aren't in defaults (shouldn't happen, but handle it)
    customStatuses.forEach(custom => {
      if (!DEFAULT_STATUSES.find(d => d.status_value === custom.status_value)) {
        allStatuses.push(custom)
      }
    })

    return NextResponse.json({
      statuses: allStatuses.sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
    })
  } catch (error) {
    console.error('Error in GET /api/lead-statuses:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/lead-statuses
 * Create a new custom lead status (for adding new status values)
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

    // Only admins can create statuses
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { label, color, display_order } = body

    if (!label || !label.trim()) {
      return NextResponse.json({ error: 'Label is required' }, { status: 400 })
    }

    // Auto-generate status_value from label
    // Convert to lowercase, replace spaces/special chars with underscores, remove leading/trailing underscores
    const status_value = label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_') // Replace non-alphanumeric with underscore
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      .substring(0, 50) // Limit length

    if (!status_value || status_value.length === 0) {
      return NextResponse.json({ error: 'Invalid label format' }, { status: 400 })
    }

    // Check if status already exists
    const { data: existing } = await supabase
      .from('lead_statuses')
      .select('id')
      .eq('org_id', profile.org_id)
      .eq('status_value', status_value)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Status with this value already exists' }, { status: 400 })
    }

    // Insert new status
    const { data: newStatus, error } = await supabase
      .from('lead_statuses')
      .insert({
        org_id: profile.org_id,
        status_value,
        label,
        color: color || 'bg-gray-500',
        display_order: display_order ?? 100, // New custom statuses go to the end
        is_protected: false,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating lead status:', error)
      return NextResponse.json({ error: 'Failed to create lead status' }, { status: 500 })
    }

    return NextResponse.json({ status: newStatus }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/lead-statuses:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
