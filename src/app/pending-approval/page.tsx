'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, LogOut, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

export default function PendingApprovalPage() {
  const router = useRouter()

  const checkApprovalStatus = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    const { data: profileData } = await supabase
      .from('users')
      .select('is_approved, role, org_id, organizations(slug)')
      .eq('auth_id', user.id)
      .single()

    type ProfileType = {
      is_approved: boolean
      role: string
      org_id: string | null
      organizations: { slug: string } | null
    }
    const profile = profileData as ProfileType | null

    if (profile?.is_approved) {
      toast.success('Your account has been approved!')
      
      if (profile.role === 'super_admin') {
        router.push('/super-admin')
      } else if (profile.org_id) {
        const orgSlug = profile.organizations?.slug
        router.push(`/${orgSlug}/dashboard`)
      }
    } else {
      toast.info('Your account is still pending approval')
    }
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  useEffect(() => {
    // Check status on mount
    const supabase = createClient()
    
    // Set up real-time subscription for approval status
    const channel = supabase
      .channel('approval-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
        },
        (payload) => {
          if (payload.new.is_approved) {
            checkApprovalStatus()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return (
    <div className="min-h-screen gradient-mesh flex items-center justify-center p-6">
      <Card className="w-full max-w-md glass animate-fade-in">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
          <CardTitle className="text-2xl">Pending Approval</CardTitle>
          <CardDescription className="text-base">
            Your account is waiting for approval from your organization admin. 
            You&apos;ll be notified once your account is activated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-2">What happens next?</p>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                <span>Your admin will review your registration request</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                <span>Once approved, you&apos;ll receive an email notification</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                <span>You can then access your dashboard and start working</span>
              </li>
            </ul>
          </div>

          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={checkApprovalStatus}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Check Status
            </Button>
            <Button 
              variant="ghost" 
              className="flex-1"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

