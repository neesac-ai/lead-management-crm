'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Copy,
  Trash2,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react'
import { FaInstagram } from 'react-icons/fa'
import { MetaLogo } from '@/components/icons/meta-logo'
import Link from 'next/link'
import { toast } from 'sonner'
import { CampaignAssignmentTable } from '@/components/integrations/campaign-assignment-table'
import { IntegrationSettings } from '@/components/integrations/integration-settings'
import { GoogleSheetsSettings } from '@/components/integrations/google-sheets-settings'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

type Integration = {
  id: string
  name: string
  platform: 'facebook' | 'instagram' | 'google_sheets'
  is_active: boolean
  sync_status: 'idle' | 'syncing' | 'error'
  last_sync_at: string | null
  error_message: string | null
  webhook_url: string | null
  created_at: string
  credentials?: Record<string, unknown>
  config?: Record<string, unknown>
}

export default function IntegrationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const orgSlug = params.orgSlug as string
  const integrationId = params.id as string

  const [integration, setIntegration] = useState<Integration | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isTesting, setIsTesting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showAdvancedCampaigns, setShowAdvancedCampaigns] = useState(false)
  const [syncWindow, setSyncWindow] = useState<'24h' | '7d' | '30d' | '90d'>('24h')

  const getPlatformIcon = () => {
    const iconProps = { className: 'w-8 h-8' }
    switch (integration?.platform) {
      case 'facebook':
        return <MetaLogo className="h-8 w-8 text-[#0866FF]" />
      case 'instagram':
        return <FaInstagram className="w-8 h-8 text-pink-600" />
      case 'google_sheets':
        return <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
      default:
        return null
    }
  }

  const fetchIntegration = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/integrations/${integrationId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch integration')
      }
      const data = await response.json()
      setIntegration(data.integration)
    } catch (error) {
      console.error('Error fetching integration:', error)
      toast.error('Failed to load integration')
    } finally {
      setIsLoading(false)
    }
  }, [integrationId])

  useEffect(() => {
    fetchIntegration()
  }, [fetchIntegration])

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oauthStatus = params.get('oauth')

    if (oauthStatus === 'success') {
      toast.success('Account connected successfully!')
      fetchIntegration()
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    } else if (oauthStatus === 'error') {
      const message = params.get('message') || 'Connection failed'
      toast.error(`Connection failed: ${message}`)
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [fetchIntegration])

  const handleTest = async () => {
    setIsTesting(true)
    try {
      const response = await fetch(`/api/integrations/${integrationId}/test`, {
        method: 'POST',
      })
      const data = await response.json()
      if (data.success) {
        toast.success('Connection test successful')
      } else {
        toast.error(data.message || 'Connection test failed')
      }
      fetchIntegration()
    } catch (error) {
      console.error('Error testing connection:', error)
      toast.error('Failed to test connection')
    } finally {
      setIsTesting(false)
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      const backfillDays =
        syncWindow === '7d' ? 7 :
        syncWindow === '30d' ? 30 :
        syncWindow === '90d' ? 90 :
        undefined

      const response = await fetch(`/api/integrations/${integrationId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(backfillDays ? { backfill_days: backfillDays } : {}),
        }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err?.details || err?.error || 'Failed to sync')
      }
      const data = await response.json()
      toast.success(`Sync completed: ${data.leads_created} leads created`)
      fetchIntegration()
    } catch (error) {
      console.error('Error syncing:', error)
      toast.error('Failed to start sync')
    } finally {
      setIsSyncing(false)
    }
  }

  const copyWebhookUrl = () => {
    if (integration?.webhook_url) {
      navigator.clipboard.writeText(integration.webhook_url)
      toast.success('Webhook URL copied to clipboard')
    }
  }

  const webhookExplanation = () => {
    const isMeta = integration.platform === 'facebook' || integration.platform === 'instagram'
    if (!isMeta) return null

    return (
      <div className="text-xs text-muted-foreground mt-2 space-y-2">
        <p>
          <strong>What it does:</strong> Meta webhooks enable <strong>real-time lead delivery</strong>. When someone submits your
          Instant Form, Meta calls this URL and BharatCRM immediately fetches the full lead details and creates a Lead in CRM.
        </p>
        <p>
          <strong>Why you haven&apos;t “used it” yet:</strong> Until you paste this URL into Meta App Webhooks and subscribe to
          <code className="mx-1">leadgen</code>, Meta won&apos;t send events. In the meantime, you can still pull leads using
          <strong className="mx-1">Sync Now</strong> (manual / scheduled sync).
        </p>
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="font-medium text-foreground">Webhook setup checklist (Meta Developer)</div>
          <ol className="mt-2 list-decimal list-inside space-y-1">
            <li>
              Go to <strong>Meta Developers</strong> → open your app → <strong>Products</strong> → <strong>Webhooks</strong>.
            </li>
            <li>
              In <strong>Webhooks</strong>, choose the object <strong>Page</strong> and click <strong>Subscribe to this object</strong>.
            </li>
            <li>
              Set <strong>Callback URL</strong> to the exact URL above (including the <code>?secret=...</code>).
            </li>
            <li>
              Set <strong>Verify Token</strong> to the same secret value (the part after <code>secret=</code>).
            </li>
            <li>
              Subscribe to the field: <strong>leadgen</strong> (Lead Ads / Instant Forms).
            </li>
            <li>
              Click <strong>Verify and Save</strong>. Meta will send a verification request and BharatCRM should respond OK.
            </li>
          </ol>
          <div className="mt-2">
            <strong>Localhost note:</strong> Meta can’t call <code className="mx-1">localhost</code>. Use a tunnel (e.g. ngrok) and set
            your <code className="mx-1">NEXT_PUBLIC_SITE_URL</code> so the webhook URL is public.
          </div>
        </div>
      </div>
    )
  }

  const handleDelete = async () => {
    if (!integration) return

    if (!confirm(`Are you sure you want to delete "${integration.name}"? This action cannot be undone and will:\n\n- Stop all lead syncing from this integration\n- Remove all campaign assignments\n- Delete all sync logs\n\nThis cannot be undone.`)) {
      return
    }

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/integrations/${integrationId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete integration')
      }

      toast.success('Integration deleted successfully')
      router.push(`/${orgSlug}/integrations`)
    } catch (error) {
      console.error('Error deleting integration:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to delete integration')
      setIsDeleting(false)
    }
  }

  const getStatusBadge = () => {
    if (!integration) return null
    if (!integration.is_active) {
      return <Badge variant="secondary">Inactive</Badge>
    }
    switch (integration.sync_status) {
      case 'syncing':
        return <Badge variant="default" className="bg-blue-500">Syncing</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
      default:
        return <Badge variant="outline" className="bg-green-500 text-white">Active</Badge>
    }
  }

  // Check if credentials are configured
  const isCredentialsConfigured = () => {
    if (!integration) return false

    if (integration.platform === 'facebook' || integration.platform === 'instagram') {
      const config = integration.config || {}
      const credentials = integration.credentials || {}

      // For Meta (Facebook/Instagram), need App ID, App Secret, and Access Token
      const hasAppCredentials = !!(config.facebook_app_id && config.facebook_app_secret)
      const hasAccessToken = !!(credentials.access_token)

      return hasAppCredentials && hasAccessToken
    }

    // For other platforms, check if credentials exist
    return !!(integration.credentials && Object.keys(integration.credentials).length > 0)
  }

  const credentialsConfigured = isCredentialsConfigured()

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!integration) {
    return (
      <div className="flex h-screen flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="text-center">
                <XCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
                <h2 className="text-xl font-semibold mb-2">Integration Not Found</h2>
                <Link href={`/${orgSlug}/integrations`}>
                  <Button variant="outline">Back to Integrations</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="flex items-center gap-4 mb-6">
            <Link href={`/${orgSlug}/integrations/platform/${integration.platform}`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-3 flex-1">
              {getPlatformIcon()}
              <div>
                <h1 className="text-3xl font-bold">{integration.name}</h1>
                <p className="text-muted-foreground mt-1">
                  {integration.platform.charAt(0).toUpperCase() + integration.platform.slice(1)} Integration
                </p>
              </div>
            </div>
            {getStatusBadge()}
          </div>

          <div className="space-y-6">
            {!credentialsConfigured && (
              <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Setup Required</AlertTitle>
                <AlertDescription className="mt-2">
                  <p>
                    Complete the steps below to start receiving{' '}
                    {integration.platform === 'google_sheets' ? 'Google Sheet' : 'Meta'} leads into CRM.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {(integration.platform === 'facebook' || integration.platform === 'instagram') && (
                <Card>
                  <CardHeader>
                    <CardTitle>Step 1: Webhook (Real-time leads)</CardTitle>
                    <CardDescription>
                      Connect Meta Webhooks to receive leads instantly (recommended).
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {integration.webhook_url ? (
                      <>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 p-2 bg-muted rounded text-sm break-all">
                            {integration.webhook_url}
                          </code>
                          <Button variant="outline" size="icon" onClick={copyWebhookUrl}>
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                        {webhookExplanation()}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Webhook URL not available yet.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Status & Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {integration.platform === 'instagram'
                        ? 'Instagram Connected'
                        : integration.platform === 'facebook'
                          ? 'Facebook Connected'
                          : 'Google Connected'}
                    </span>
                    {credentialsConfigured && integration.credentials?.access_token ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                        <span className="text-sm text-green-600 dark:text-green-400">Connected</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <XCircle className="w-5 h-5 text-red-500" />
                        <span className="text-sm text-red-600 dark:text-red-400">Not Connected</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Sync Status</span>
                    <Badge variant="outline">{integration.sync_status}</Badge>
                  </div>
                  {integration.last_sync_at && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Last Sync</span>
                      <span className="text-sm">
                        {new Date(integration.last_sync_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="grid gap-2">
                    <Button
                      onClick={handleTest}
                      disabled={isTesting || !credentialsConfigured}
                      variant="outline"
                      className="w-full"
                      title={!credentialsConfigured ? 'Configure connection below first' : 'Test the connection'}
                    >
                      {isTesting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Test Connection
                        </>
                      )}
                    </Button>
                    <div className="space-y-2">
                      {integration.platform !== 'google_sheets' && (
                        <>
                          <div className="text-xs text-muted-foreground">
                            Backfill window (Meta typically retains ~90 days of leads)
                          </div>
                          <Select value={syncWindow} onValueChange={(v) => setSyncWindow(v as typeof syncWindow)}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select time window" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="24h">Last 24 hours</SelectItem>
                              <SelectItem value="7d">Last 7 days</SelectItem>
                              <SelectItem value="30d">Last 30 days</SelectItem>
                              <SelectItem value="90d">Last 90 days (max recommended)</SelectItem>
                            </SelectContent>
                          </Select>
                        </>
                      )}
                    </div>
                    <Button
                      onClick={handleSync}
                      disabled={isSyncing || !integration.is_active || !credentialsConfigured}
                      variant="outline"
                      className="w-full"
                      title={!credentialsConfigured ? 'Configure connection below first' : 'Manually sync leads'}
                    >
                      {isSyncing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Sync Now
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={handleDelete}
                      disabled={isDeleting}
                      variant="outline"
                      className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/50"
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Integration
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>
                  {integration.platform === 'google_sheets'
                    ? 'Step 2: Connect Google Sheet & Map Columns'
                    : 'Step 2: Connect Meta & Choose Lead Forms'}
                </CardTitle>
                <CardDescription>
                  {integration.platform === 'google_sheets'
                    ? 'Connect Google, paste Sheet URL + Tab name, map columns (phone required), then sync.'
                    : 'Save App ID/Secret, connect your Meta account, select an Ad Account, then fetch Lead Forms and assign to reps.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {integration.platform === 'google_sheets' ? (
                  <GoogleSheetsSettings integration={integration as any} onUpdate={fetchIntegration} />
                ) : (
                  <IntegrationSettings integration={integration as any} onUpdate={fetchIntegration} />
                )}
              </CardContent>
            </Card>

            {integration.platform !== 'google_sheets' && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Campaign Assignments (Advanced)</CardTitle>
                    <CardDescription>
                      Optional. Keep for legacy routing/reporting; Phase 1 is form-based.
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowAdvancedCampaigns((v) => !v)}>
                    {showAdvancedCampaigns ? 'Hide' : 'Show'}
                  </Button>
                </CardHeader>
                {showAdvancedCampaigns && (
                  <CardContent>
                    <CampaignAssignmentTable integrationId={integrationId} />
                  </CardContent>
                )}
              </Card>
            )}

              {integration.error_message && (
                <Card className="border-destructive">
                  <CardHeader>
                    <CardTitle className="text-destructive">Error</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-destructive">{integration.error_message}</p>
                  </CardContent>
                </Card>
              )}
          </div>
        </div>
      </div>
    </div>
  )
}

