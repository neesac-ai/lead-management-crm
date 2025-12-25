import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDriveClient } from '@/lib/google/drive'
import { refreshAccessToken } from '@/lib/google/oauth'

export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: user } = await supabase
      .from('users')
      .select('id, google_access_token, google_refresh_token')
      .eq('auth_id', authUser.id)
      .single()

    if (!user || !user.google_refresh_token) {
      return NextResponse.json(
        { error: 'Google account not connected. Please connect Google first.' },
        { status: 400 }
      )
    }

    // Refresh access token
    let accessToken = user.google_access_token
    try {
      const newCredentials = await refreshAccessToken(user.google_refresh_token)
      if (newCredentials.access_token) {
        accessToken = newCredentials.access_token
        await supabase
          .from('users')
          .update({ google_access_token: accessToken })
          .eq('id', user.id)
      }
    } catch (refreshError) {
      console.error('Token refresh error:', refreshError)
      return NextResponse.json(
        { error: 'Google session expired. Please reconnect your Google account.' },
        { status: 401 }
      )
    }

    // List folders from Drive
    const drive = getDriveClient(accessToken!, user.google_refresh_token)
    
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'files(id, name)',
      orderBy: 'name',
      pageSize: 100,
    })

    const folders = (response.data.files || []).map(f => ({
      id: f.id!,
      name: f.name!,
    }))

    return NextResponse.json({ folders })
  } catch (error) {
    console.error('Error listing folders:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    if (errorMessage.includes('insufficient') || errorMessage.includes('scope')) {
      return NextResponse.json(
        { error: 'Drive access not granted. Please disconnect and reconnect your Google account.' },
        { status: 403 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to list folders' },
      { status: 500 }
    )
  }
}





