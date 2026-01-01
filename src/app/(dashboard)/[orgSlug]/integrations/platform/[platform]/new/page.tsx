'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Loader2, Plug } from 'lucide-react'
import { FaFacebook, FaWhatsapp, FaLinkedin, FaInstagram } from 'react-icons/fa'
import { SiGoogleads } from 'react-icons/si'
import Link from 'next/link'
import { toast } from 'sonner'

const PLATFORM_INFO: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; iconColor: string }> = {
  facebook: { label: 'Facebook Lead Ads', icon: FaFacebook, iconColor: 'text-blue-600' },
  instagram: { label: 'Instagram Lead Ads', icon: FaInstagram, iconColor: 'text-pink-600' },
  linkedin: { label: 'LinkedIn Lead Gen Forms', icon: FaLinkedin, iconColor: 'text-blue-700' },
  whatsapp: { label: 'WhatsApp Business API', icon: FaWhatsapp, iconColor: 'text-green-500' },
  google: { label: 'Google Ads Lead Forms', icon: SiGoogleads, iconColor: 'text-blue-500' },
}

export default function NewPlatformIntegrationPage() {
  const params = useParams()
  const router = useRouter()
  const orgSlug = params.orgSlug as string
  const platform = params.platform as string

  const [name, setName] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const platformInfo = PLATFORM_INFO[platform] || { 
    label: platform, 
    icon: () => null, 
    iconColor: 'text-gray-500' 
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name) {
      toast.error('Please enter an integration name')
      return
    }

    if (!['facebook', 'whatsapp', 'linkedin', 'instagram', 'google'].includes(platform)) {
      toast.error('Invalid platform')
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          name,
          credentials: {}, // Will be configured later via OAuth
          config: {},
          webhook_secret: webhookSecret || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        const errorMessage = data.details 
          ? `${data.error}: ${data.details}${data.hint ? ` (${data.hint})` : ''}`
          : data.error || 'Failed to create integration'
        throw new Error(errorMessage)
      }

      const data = await response.json()
      toast.success('Integration created successfully')
      router.push(`/${orgSlug}/integrations/${data.integration.id}`)
    } catch (error) {
      console.error('Error creating integration:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to create integration'
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="flex items-center gap-4 mb-6">
            <Link href={`/${orgSlug}/integrations/platform/${platform}`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <platformInfo.icon className={`w-10 h-10 ${platformInfo.iconColor}`} />
              <div>
                <h1 className="text-3xl font-bold">New {platformInfo.label} Integration</h1>
                <p className="text-muted-foreground mt-1">
                  Create a new integration for {platformInfo.label}
                </p>
              </div>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Integration Details</CardTitle>
              <CardDescription>
                Create the integration first. You'll configure OAuth and API credentials in the next step.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Integration Name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={`e.g., ${platformInfo.label} Main Account`}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Give this integration a descriptive name to identify it later
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="webhookSecret">Webhook Secret (Optional)</Label>
                  <Input
                    id="webhookSecret"
                    type="password"
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    placeholder="Leave empty to auto-generate a secure secret"
                  />
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Used to verify webhook requests from {platformInfo.label}. This is different from OAuth credentials.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <strong>Recommended:</strong> Leave empty to auto-generate a secure random secret. 
                      Or enter a custom secret if you want to use a specific value.
                    </p>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h4 className="font-semibold text-sm mb-2">Next Steps After Creation:</h4>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Go to Settings tab and configure OAuth credentials</li>
                    <li>Connect your {platformInfo.label} account</li>
                    <li>Test the connection</li>
                    <li>Configure webhook in {platformInfo.label} settings</li>
                  </ol>
                </div>

                <div className="flex justify-end gap-2">
                  <Link href={`/${orgSlug}/integrations/platform/${platform}`}>
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </Link>
                  <Button type="submit" disabled={isSaving || !name}>
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plug className="w-4 h-4 mr-2" />
                        Create Integration
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

