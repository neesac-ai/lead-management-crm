import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

/**
 * POST /api/lead-statuses/upsert
 * Upsert (update or create) a lead status by status_value
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

    // Only admins can manage statuses
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { status_value: providedStatusValue, label, color, display_order } = body

    if (!label || !label.trim()) {
      return NextResponse.json({ error: 'Label is required' }, { status: 400 })
    }

    // Auto-generate status_value from label if not provided
    // Convert to lowercase, replace spaces/special chars with underscores, remove leading/trailing underscores
    const status_value = providedStatusValue || label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_') // Replace non-alphanumeric with underscore
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      .substring(0, 50) // Limit length

    if (!status_value || status_value.length === 0) {
      return NextResponse.json({ error: 'Invalid label format' }, { status: 400 })
    }

    // Check if status exists
    const { data: existing } = await supabase
      .from('lead_statuses')
      .select('id')
      .eq('org_id', profile.org_id)
      .eq('status_value', status_value)
      .single()

    if (existing) {
      // Update existing
      const updateData = {
        label: label.trim(),
        color: color || 'bg-gray-500',
        display_order: display_order ?? 0,
        is_active: true, // Ensure is_active is set to true
        updated_at: new Date().toISOString(),
      }
      console.log('[UPSERT] Updating existing status:', existing.id, 'with data:', updateData)

      const { data: updated, error } = await supabase
        .from('lead_statuses')
        .update(updateData)
        .eq('id', existing.id)
        .select()
        .single()

      if (error) {
        console.error('Error updating lead status:', error)
        return NextResponse.json({ error: 'Failed to update lead status' }, { status: 500 })
      }

      console.log('[UPSERT] Updated status:', updated)
      return NextResponse.json({ status: updated })
    } else {
      // Create new
      const insertData = {
        org_id: profile.org_id,
        status_value,
        label: label.trim(),
        color: color || 'bg-gray-500',
        display_order: display_order ?? 100,
        is_protected: false,
        is_active: true, // Explicitly set to true
      }
      console.log('[UPSERT] Creating new status with data:', insertData)

      const { data: created, error } = await supabase
        .from('lead_statuses')
        .insert(insertData)
        .select()
        .single()

      if (error) {
        console.error('Error creating lead status:', error)
        return NextResponse.json({ error: 'Failed to create lead status' }, { status: 500 })
      }

      return NextResponse.json({ status: created }, { status: 201 })
    }
  } catch (error) {
    console.error('Error in POST /api/lead-statuses/upsert:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
