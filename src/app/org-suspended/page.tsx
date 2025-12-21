'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ShieldAlert, LogOut, Mail } from 'lucide-react'

export default function OrgSuspendedPage() {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen gradient-mesh flex items-center justify-center p-6">
      <Card className="w-full max-w-md glass animate-fade-in">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <CardTitle className="text-2xl">Organization Suspended</CardTitle>
          <CardDescription className="text-base">
            Your organization&apos;s account has been temporarily suspended. 
            This might be due to billing issues or a policy violation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-2">What can you do?</p>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                <span>Contact your organization administrator</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                <span>Reach out to our support team for assistance</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                <span>Check your email for any suspension notices</span>
              </li>
            </ul>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" asChild>
              <a href="mailto:support@leadflow.com">
                <Mail className="w-4 h-4 mr-2" />
                Contact Support
              </a>
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







