import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user details
    const { data: userData } = await supabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', authUser.id)
      .single()

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Only admin and super_admin can delete recordings
    if (userData.role !== 'admin' && userData.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only admins can delete recordings' },
        { status: 403 }
      )
    }

    const { recordingId } = await request.json()

    if (!recordingId) {
      return NextResponse.json(
        { error: 'Recording ID is required' },
        { status: 400 }
      )
    }

    // Use admin client to bypass RLS
    const adminClient = await createAdminClient()

    // Verify the recording belongs to the user's org
    const { data: recording } = await adminClient
      .from('call_recordings')
      .select('id, org_id')
      .eq('id', recordingId)
      .single()

    if (!recording) {
      return NextResponse.json(
        { error: 'Recording not found' },
        { status: 404 }
      )
    }

    if (recording.org_id !== userData.org_id) {
      return NextResponse.json(
        { error: 'Not authorized to delete this recording' },
        { status: 403 }
      )
    }

    // Delete the recording
    const { error: deleteError } = await adminClient
      .from('call_recordings')
      .delete()
      .eq('id', recordingId)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete recording' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true,
      message: 'Recording deleted successfully'
    })

  } catch (error) {
    console.error('Delete recording error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}




