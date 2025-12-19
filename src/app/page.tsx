import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user profile
  const { data: profileData } = await supabase
    .from('users')
    .select('role, org_id, is_approved, organizations(slug)')
    .eq('auth_id', user.id)
    .single()

  type ProfileType = {
    role: string
    org_id: string | null
    is_approved: boolean
    organizations: { slug: string } | null
  }
  const profile = profileData as ProfileType | null

  if (!profile) {
    redirect('/login')
  }

  if (profile.role === 'super_admin') {
    redirect('/super-admin')
  }

  if (!profile.is_approved) {
    redirect('/pending-approval')
  }

  if (profile.org_id) {
    const orgSlug = profile.organizations?.slug
    redirect(`/${orgSlug}/dashboard`)
  }

  redirect('/onboarding')
}
