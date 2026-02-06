import { redirect, notFound } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { BottomNav } from '@/components/layout/bottom-nav'
import { GoogleAuthToast } from '@/components/google-auth-toast'
import { OrgProviderWrapper } from '@/components/providers/org-provider-wrapper'
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

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError) {
    console.error('Auth error:', authError.message)
  }

  if (!user) {
    redirect('/login')
  }

  // Verify organization exists using admin client to bypass RLS
  const adminSupabase = await createAdminClient()
  const { data: orgData, error: orgError } = await adminSupabase
    .from('organizations')
    .select('id, name, status, org_code')
    .eq('slug', orgSlug)
    .single()

  type OrgData = { id: string; name: string; status: string; org_code: string }
  const org = orgData as OrgData | null

  if (orgError) {
    console.error('Org fetch error:', orgError.message, 'for slug:', orgSlug)
  }

  if (!org) {
    console.error('Organization not found for slug:', orgSlug)
    notFound()
  }

  // Verify user belongs to this org (or is super admin)
  const { data: profileData } = await adminSupabase
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

  // Check if org is active and has a valid subscription for non-super-admin users.
  if (profile.role !== 'super_admin') {
    // Hard org status guard
    if (org.status !== 'active') {
      redirect('/org-suspended')
    }

    // Enforce org subscription status (paused / cancelled / expired / missing → blocked)
    const { data: orgSub } = await adminSupabase
      .from('org_subscriptions')
      .select('status, end_date')
      .eq('org_id', org.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const allowedStatuses = ['active', 'trialing']
    let isAllowed = false

    if (orgSub) {
      const status = (orgSub as any).status as string
      const endDateStr = (orgSub as any).end_date as string | undefined
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const endDate = endDateStr ? new Date(endDateStr) : null
      const isExpired = !!endDate && endDate < today

      isAllowed = allowedStatuses.includes(status) && !isExpired
    }

    if (!isAllowed) {
      redirect('/org-suspended')
    }
  }

  if (!profile.is_approved && profile.role !== 'super_admin') {
    redirect('/pending-approval')
  }

  return (
    <OrgProviderWrapper orgName={org.name || ''} orgCode={org.org_code || ''} orgSlug={orgSlug}>
      <div className="min-h-screen bg-background">
        <Suspense fallback={null}>
          <GoogleAuthToast />
        </Suspense>
        <Sidebar orgSlug={orgSlug} />
        <main className="pt-16 pb-16 lg:pt-0 lg:pb-0 lg:pl-64">
          {children}
        </main>
        <BottomNav orgSlug={orgSlug} />
      </div>
    </OrgProviderWrapper>
  )
}

