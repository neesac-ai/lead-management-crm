import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Convenience redirect:
 * Some links (or cached clients) may hit `/integrations` without the `/{orgSlug}` prefix.
 * Redirect to the current user's org-scoped integrations route.
 */
export default async function IntegrationsRootRedirect() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role, organizations(slug)')
    .eq('auth_id', user.id)
    .single()

  const orgSlug = (profile as { organizations?: { slug?: string } | null } | null)?.organizations?.slug

  if (!orgSlug) {
    // If super admin (or misconfigured profile), send to super-admin home.
    redirect('/super-admin')
  }

  redirect(`/${orgSlug}/integrations`)
}


