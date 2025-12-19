import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createAdminClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.user) {
      // Check if user profile exists
      const { data: profileData } = await supabase
        .from('users')
        .select('id, role, org_id, is_approved, organizations(slug)')
        .eq('auth_id', data.user.id)
        .single()

      type ProfileType = { 
        id: string
        role: string
        org_id: string | null
        is_approved: boolean
        organizations: { slug: string } | null 
      }
      const profile = profileData as ProfileType | null

      if (!profile) {
        // Create user profile from auth metadata
        const metadata = data.user.user_metadata
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insertError } = await (supabase.from('users') as any).insert({
          auth_id: data.user.id,
          email: data.user.email || '',
          name: metadata?.name || data.user.email?.split('@')[0] || 'User',
          role: 'admin',
          is_approved: false,
        })

        if (insertError) {
          console.error('Error creating user profile:', insertError)
        }

        // Redirect to onboarding
        return NextResponse.redirect(`${origin}/onboarding`)
      }

      // Determine redirect based on user profile
      if (profile.role === 'super_admin') {
        return NextResponse.redirect(`${origin}/super-admin`)
      }
      
      if (!profile.is_approved) {
        return NextResponse.redirect(`${origin}/pending-approval`)
      }
      
      if (profile.org_id) {
        const orgSlug = profile.organizations?.slug
        return NextResponse.redirect(`${origin}/${orgSlug}/dashboard`)
      }

      return NextResponse.redirect(`${origin}/onboarding`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth-error`)
}

