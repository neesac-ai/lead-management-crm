import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * DELETE /api/menu-names/[id]
 * Delete a custom menu name (revert to default)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Only admins can delete menu names
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get the existing menu name to check ownership
    const { data: existingMenuName } = await supabase
      .from('menu_names')
      .select('org_id')
      .eq('id', id)
      .single()

    if (!existingMenuName) {
      return NextResponse.json({ error: 'Menu name not found' }, { status: 404 })
    }

    if (existingMenuName.org_id !== profile.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete the menu name
    const { error } = await supabase
      .from('menu_names')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting menu name:', error)
      return NextResponse.json({ error: 'Failed to delete menu name' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/menu-names/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
