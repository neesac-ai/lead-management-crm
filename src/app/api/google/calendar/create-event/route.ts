import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedClient, refreshAccessToken } from '@/lib/google/oauth'

interface CreateEventRequest {
  leadId: string
  leadName: string
  leadEmail?: string
  demoDate: string // ISO string
  duration?: number // in minutes, default 30
  description?: string
  timezone?: string // User's timezone (e.g., 'Asia/Kolkata')
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile with Google tokens
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, name, email, org_id, role, google_access_token, google_refresh_token, google_token_expiry')
      .eq('auth_id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Check if Google is connected
    if (!profile.google_refresh_token) {
      return NextResponse.json(
        { error: 'Google Calendar not connected. Please connect your Google account first.', code: 'GOOGLE_NOT_CONNECTED' },
        { status: 400 }
      )
    }

    // Fetch admin email for the organization (to include in invite)
    let adminEmail: string | null = null
    if (profile.org_id && profile.role === 'sales') {
      // If sales person is creating, get the admin's email
      const { data: adminData } = await supabase
        .from('users')
        .select('email')
        .eq('org_id', profile.org_id)
        .eq('role', 'admin')
        .eq('is_approved', true)
        .single()
      
      adminEmail = adminData?.email || null
    }

    // Parse request body
    const body: CreateEventRequest = await request.json()
    const { leadId, leadName, leadEmail, demoDate, duration = 30, description, timezone } = body

    if (!leadId || !leadName || !demoDate) {
      return NextResponse.json(
        { error: 'Missing required fields: leadId, leadName, demoDate' },
        { status: 400 }
      )
    }

    // Check if access token is expired and refresh if needed
    let accessToken = profile.google_access_token
    const tokenExpiry = profile.google_token_expiry ? new Date(profile.google_token_expiry) : null
    
    if (!accessToken || (tokenExpiry && tokenExpiry < new Date())) {
      try {
        const newCredentials = await refreshAccessToken(profile.google_refresh_token)
        accessToken = newCredentials.access_token as string
        
        // Update tokens in database
        const adminSupabase = createAdminClient()
        await adminSupabase
          .from('users')
          .update({
            google_access_token: newCredentials.access_token,
            google_token_expiry: newCredentials.expiry_date 
              ? new Date(newCredentials.expiry_date).toISOString() 
              : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', profile.id)
      } catch (refreshError) {
        console.error('Failed to refresh Google token:', refreshError)
        return NextResponse.json(
          { error: 'Google token expired. Please reconnect your Google account.', code: 'TOKEN_EXPIRED' },
          { status: 401 }
        )
      }
    }

    // Create OAuth2 client with tokens
    const oauth2Client = getAuthenticatedClient(accessToken!, profile.google_refresh_token)
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    // Use provided timezone or default to IST (Asia/Kolkata)
    const userTimezone = timezone || 'Asia/Kolkata'

    // Calculate event times
    const startTime = new Date(demoDate)
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000)

    // Validate email format if provided
    const isValidEmail = (email: string) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      return emailRegex.test(email)
    }

    // Build attendees list
    const attendees: { email: string }[] = []
    
    // Add lead email if valid
    if (leadEmail && isValidEmail(leadEmail)) {
      attendees.push({ email: leadEmail })
    }
    
    // Add admin email if valid and different from lead email
    if (adminEmail && isValidEmail(adminEmail) && adminEmail !== leadEmail) {
      attendees.push({ email: adminEmail })
    }
    
    // Add the organizer (sales person) as well so they get the invite
    if (profile.email && isValidEmail(profile.email) && profile.email !== leadEmail && profile.email !== adminEmail) {
      attendees.push({ email: profile.email })
    }

    // Create calendar event with Google Meet
    const event: {
      summary: string
      description: string
      start: { dateTime: string; timeZone: string }
      end: { dateTime: string; timeZone: string }
      attendees?: { email: string }[]
      conferenceData: {
        createRequest: {
          requestId: string
          conferenceSolutionKey: { type: string }
        }
      }
      reminders: {
        useDefault: boolean
        overrides: { method: string; minutes: number }[]
      }
    } = {
      summary: `Demo Call with ${leadName}`,
      description: description || `Product demo scheduled with ${leadName}.\n\nScheduled by: ${profile.name}`,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: userTimezone,
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: userTimezone,
      },
      conferenceData: {
        createRequest: {
          requestId: `demo-${leadId}-${Date.now()}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet',
          },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    }

    // Add attendees if any valid emails
    if (attendees.length > 0) {
      event.attendees = attendees
    }

    const calendarEvent = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      conferenceDataVersion: 1,
      sendUpdates: event.attendees?.length ? 'all' : 'none',
    })

    // Extract Google Meet link
    const meetLink = calendarEvent.data.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === 'video'
    )?.uri

    // Update the demos table with the calendar event info
    const { error: demoUpdateError } = await supabase
      .from('demos')
      .update({
        calendar_event_id: calendarEvent.data.id,
        google_meet_link: meetLink,
        status: 'scheduled',
      })
      .eq('lead_id', leadId)
      .eq('status', 'scheduled')
      .order('created_at', { ascending: false })
      .limit(1)

    if (demoUpdateError) {
      console.error('Error updating demo record:', demoUpdateError)
      // Don't fail the request - the calendar event was created successfully
    }

    return NextResponse.json({
      success: true,
      event: {
        id: calendarEvent.data.id,
        htmlLink: calendarEvent.data.htmlLink,
        meetLink,
        summary: calendarEvent.data.summary,
        start: calendarEvent.data.start,
        end: calendarEvent.data.end,
      },
    })
  } catch (error: unknown) {
    console.error('Error creating calendar event:', error)
    
    // Check for specific Google API errors
    if (error && typeof error === 'object' && 'code' in error) {
      const apiError = error as { code: number; message?: string }
      if (apiError.code === 401) {
        return NextResponse.json(
          { error: 'Google authentication failed. Please reconnect your Google account.', code: 'AUTH_FAILED' },
          { status: 401 }
        )
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to create calendar event' },
      { status: 500 }
    )
  }
}

