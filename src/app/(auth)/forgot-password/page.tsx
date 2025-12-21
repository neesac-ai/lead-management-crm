'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2, Mail, ArrowLeft, CheckCircle } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [email, setEmail] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const supabase = createClient()
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) {
        toast.error(error.message)
        return
      }

      setIsSubmitted(true)
      toast.success('Password reset email sent!')
    } catch (error) {
      console.error('Reset password error:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  if (isSubmitted) {
    return (
      <div className="space-y-8 animate-fade-in text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Check your email</h2>
          <p className="text-muted-foreground max-w-sm mx-auto">
            We&apos;ve sent a password reset link to <strong>{email}</strong>. 
            Please check your inbox and follow the instructions.
          </p>
        </div>

        <div className="space-y-4">
          <Button 
            variant="outline" 
            className="w-full h-11"
            onClick={() => setIsSubmitted(false)}
          >
            Try another email
          </Button>
          
          <Link href="/login">
            <Button variant="ghost" className="w-full h-11">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to login
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-3 justify-center mb-8">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <span className="text-2xl font-bold tracking-tight">LeadFlow</span>
      </div>

      <div className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Forgot password?</h2>
        <p className="text-muted-foreground">
          No worries, we&apos;ll send you reset instructions.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
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

        <Button 
          type="submit" 
          className="w-full h-11 text-base font-medium"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending reset link...
            </>
          ) : (
            'Send reset link'
          )}
        </Button>
      </form>

      <Link href="/login">
        <Button variant="ghost" className="w-full h-11">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to login
        </Button>
      </Link>
    </div>
  )
}







