'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, Building2, ArrowRight, Sparkles } from 'lucide-react'

export default function OnboardingPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    organizationName: '',
    slug: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value,
      // Auto-generate slug from organization name
      ...(name === 'organizationName' && {
        slug: value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      })
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.organizationName || !formData.slug) {
      toast.error('Please fill in all fields')
      return
    }

    setIsLoading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      // Check if slug is available
      const { data: existingOrg } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', formData.slug)
        .single()

      if (existingOrg) {
        toast.error('This organization URL is already taken. Please choose another.')
        setIsLoading(false)
        return
      }

      // Create organization
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: orgData, error: orgError } = await (supabase
        .from('organizations') as any)
        .insert({
          name: formData.organizationName,
          slug: formData.slug,
          status: 'pending',
        })
        .select()
        .single()

      if (orgError) {
        throw orgError
      }

      const org = orgData as { id: string }

      // Update user to be admin of this org
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: userError } = await (supabase
        .from('users') as any)
        .update({
          org_id: org.id,
          role: 'admin',
          is_approved: false,
        })
        .eq('auth_id', user.id)

      if (userError) {
        throw userError
      }

      // Get default trial plan
      const { data: planData } = await supabase
        .from('platform_plans')
        .select('id')
        .eq('name', 'Starter')
        .single()

      const plan = planData as { id: string } | null

      if (plan) {
        // Create trial subscription
        const startDate = new Date()
        const endDate = new Date()
        endDate.setDate(endDate.getDate() + 14) // 14-day trial

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('org_subscriptions') as any).insert({
          org_id: org.id,
          plan_id: plan.id,
          billing_cycle: 'monthly',
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          status: 'trialing',
        })
      }

      toast.success('Organization created! Waiting for approval.')
      router.push('/pending-approval')
    } catch (error) {
      console.error('Onboarding error:', error)
      toast.error('Failed to create organization. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen gradient-mesh flex items-center justify-center p-6">
      <Card className="w-full max-w-lg glass animate-fade-in">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Set Up Your Organization</CardTitle>
          <CardDescription className="text-base">
            Let&apos;s get your workspace ready. This will only take a moment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="organizationName">Organization Name</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="organizationName"
                    name="organizationName"
                    placeholder="Acme Inc."
                    value={formData.organizationName}
                    onChange={handleChange}
                    className="pl-10 h-11"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Organization URL</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">leadflow.com/</span>
                  <Input
                    id="slug"
                    name="slug"
                    placeholder="acme"
                    value={formData.slug}
                    onChange={handleChange}
                    className="h-11"
                    required
                    disabled={isLoading}
                    pattern="[a-z0-9-]+"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Only lowercase letters, numbers, and hyphens allowed
                </p>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 text-sm">
              <p className="font-medium mb-2">What&apos;s included in your trial:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>✓ 14-day free trial</li>
                <li>✓ Up to 5 team members</li>
                <li>✓ 500 leads per month</li>
                <li>✓ All core features</li>
              </ul>
            </div>

            <Button 
              type="submit" 
              className="w-full h-11 text-base font-medium"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating organization...
                </>
              ) : (
                <>
                  Create Organization
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

