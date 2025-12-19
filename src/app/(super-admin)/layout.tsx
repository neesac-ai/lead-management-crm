import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if user is super admin
  const { data: profileData } = await supabase
    .from('users')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  const profile = profileData as { role: string } | null

  if (!profile || profile.role !== 'super_admin') {
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        {children}
      </main>
    </div>
  )
}

