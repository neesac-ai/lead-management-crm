'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2, Mail, Lock, ArrowRight } from 'lucide-react'
import Image from 'next/image'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect')
  const errorParam = searchParams.get('error')

  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isAndroid, setIsAndroid] = useState(false)

  const apkUrl = useMemo(() => {
    // Configurable so you can host the APK anywhere (same domain, S3, Drive, etc.)
    // Fallback assumes you host it at /public/downloads/bharatcrm.apk
    return process.env.NEXT_PUBLIC_ANDROID_APK_URL || '/downloads/bharatcrm.apk'
  }, [])

  // Show deactivated message if redirected from middleware
  const showDeactivatedError = errorParam === 'account_deactivated'

  useEffect(() => {
    try {
      const ua = navigator.userAgent || ''
      setIsAndroid(/Android/i.test(ua))
    } catch {
      setIsAndroid(false)
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const supabase = createClient()

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        toast.error(error.message)
        return
      }

      if (data.user) {
        // Get user profile to determine redirect
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('role, org_id, is_approved, is_active, organizations(slug)')
          .eq('auth_id', data.user.id)
          .single()

        if (profileError || !profile) {
          toast.error('User profile not found. Please contact support.')
          return
        }

        const userProfile = profile as {
          role: string
          org_id: string | null
          is_approved: boolean
          is_active: boolean
          organizations: { slug: string } | null
        }

        // Check if account is deactivated
        if (userProfile.role !== 'super_admin' && !userProfile.is_active) {
          await supabase.auth.signOut()
          toast.error('Your account has been deactivated. Please contact your administrator.')
          return
        }

        toast.success('Welcome back!')

        if (redirect) {
          router.push(redirect)
        } else if (userProfile.role === 'super_admin') {
          router.push('/super-admin')
        } else if (userProfile.org_id && userProfile.is_approved) {
          const orgSlug = userProfile.organizations?.slug
          router.push(`/${orgSlug}/dashboard`)
        } else if (!userProfile.is_approved) {
          router.push('/pending-approval')
        } else {
          router.push('/onboarding')
        }
      }
    } catch (error) {
      console.error('Login error:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Mobile logo */}
      <div className="lg:hidden flex flex-col items-center justify-center mb-8 gap-2">
        <span className="text-2xl font-bold tracking-tight">BharatCRM</span>
        <span className="text-sm text-muted-foreground">by neesac.ai</span>
      </div>

      <div className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Welcome back</h2>
        <p className="text-muted-foreground">
          Enter your credentials to access your account
        </p>
      </div>

      {showDeactivatedError && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800">
          <p className="font-medium">Account Deactivated</p>
          <p className="text-sm mt-1">Your account has been deactivated by an administrator. Please contact your organization admin to reactivate your account.</p>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            Email address
          </Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-11"
              required
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-sm font-medium">
              Password
            </Label>
            <Link
              href="/forgot-password"
              className="text-sm text-primary hover:text-primary/80 transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-11"
              required
              disabled={isLoading}
            />
          </div>
        </div>

        <Button
          type="submit"
          className="w-full h-11 text-base font-medium"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              Sign in
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      {isAndroid && (
        <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
          <div className="font-medium">Using Android?</div>
          <div className="text-sm text-muted-foreground">
            Download the BharatCRM Android app (APK). You may need to allow “Install unknown apps” for your browser.
          </div>
          <a href={apkUrl} target="_blank" rel="noreferrer">
            <Button variant="outline" className="w-full h-11">
              Download Android App (APK)
            </Button>
          </a>
        </div>
      )}

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            New to BharatCRM?
          </span>
        </div>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link
          href="/register"
          className="text-primary font-medium hover:text-primary/80 transition-colors"
        >
          Create an account
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <LoginForm />
    </Suspense>
  )
}

