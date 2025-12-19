import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { GoogleAuthToast } from '@/components/google-auth-toast'
import { Suspense } from 'react'

interface OrgLayoutProps {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}

export default async function OrgDashboardLayout({
  children,
  params,
}: OrgLayoutProps) {
  const { orgSlug } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Verify organization exists and user belongs to it
  const { data: orgData } = await supabase
    .from('organizations')
    .select('id, name, status')
    .eq('slug', orgSlug)
    .single()

  type OrgData = { id: string; name: string; status: string }
  const org = orgData as OrgData | null

  if (!org) {
    notFound()
  }

  // Check if org is active
  if (org.status !== 'active') {
    redirect('/org-suspended')
  }

  // Verify user belongs to this org (or is super admin)
  const { data: profileData } = await supabase
    .from('users')
    .select('role, org_id, is_approved')
    .eq('auth_id', user.id)
    .single()

  type ProfileData = { role: string; org_id: string | null; is_approved: boolean }
  const profile = profileData as ProfileData | null

  if (!profile) {
    redirect('/login')
  }

  // Super admin can access any org
  if (profile.role !== 'super_admin' && profile.org_id !== org.id) {
    redirect('/')
  }

  if (!profile.is_approved && profile.role !== 'super_admin') {
    redirect('/pending-approval')
  }

  return (
    <div className="min-h-screen bg-background">
      <Suspense fallback={null}>
        <GoogleAuthToast />
      </Suspense>
      <Sidebar orgSlug={orgSlug} />
      <main className="lg:pl-64">
        {children}
      </main>
    </div>
  )
}

