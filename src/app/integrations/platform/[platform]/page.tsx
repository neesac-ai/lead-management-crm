import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

interface Props {
  params: Promise<{ platform: string }>
}

export default async function IntegrationsPlatformRedirect({ params }: Props) {
  const { platform } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('organizations(slug)')
    .eq('auth_id', user.id)
    .single()

  const orgSlug = (profile as { organizations?: { slug?: string } | null } | null)?.organizations?.slug

  if (!orgSlug) {
    redirect('/super-admin')
  }

  redirect(`/${orgSlug}/integrations/platform/${platform}`)
}


