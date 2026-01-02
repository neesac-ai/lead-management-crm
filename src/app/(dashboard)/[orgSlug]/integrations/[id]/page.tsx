'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  ArrowLeft, 
  Loader2, 
  Settings, 
  Users, 
  RefreshCw, 
  CheckCircle2, 
  XCircle,
  Copy,
  ExternalLink,
  Trash2,
  AlertCircle,
} from 'lucide-react'
import { FaFacebook, FaWhatsapp, FaLinkedin, FaInstagram } from 'react-icons/fa'
import Link from 'next/link'
import { toast } from 'sonner'
import { CampaignAssignmentTable } from '@/components/integrations/campaign-assignment-table'
import { IntegrationSettings } from '@/components/integrations/integration-settings'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

type Integration = {
  id: string
  name: string
  platform: 'facebook' | 'whatsapp' | 'linkedin' | 'instagram'
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
  const [activeTab, setActiveTab] = useState('overview')

  const getPlatformIcon = () => {
    const iconProps = { className: 'w-8 h-8' }
    switch (integration?.platform) {
      case 'facebook':
        return <FaFacebook className="w-8 h-8 text-blue-600" />
      case 'whatsapp':
        return <FaWhatsapp className="w-8 h-8 text-green-500" />
      case 'linkedin':
        return <FaLinkedin className="w-8 h-8 text-blue-700" />
      case 'instagram':
        return <FaInstagram className="w-8 h-8 text-pink-600" />
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
      toast.success('Facebook connected successfully!')
      fetchIntegration()
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    } else if (oauthStatus === 'error') {
      const message = params.get('message') || 'Connection failed'
      toast.error(`Facebook connection failed: ${message}`)
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
      const response = await fetch(`/api/integrations/${integrationId}/sync`, {
        method: 'POST',
      })
      if (!response.ok) {
        throw new Error('Failed to sync')
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
    
    if (integration.platform === 'facebook') {
      const config = integration.config || {}
      const credentials = integration.credentials || {}
      
      // For Facebook, need App ID, App Secret, and Access Token
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

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="campaigns">Campaign Assignments</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              {!credentialsConfigured && (
                <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Setup Required</AlertTitle>
                  <AlertDescription className="mt-2">
                    <p>Before you can test the connection or sync leads, you need to configure your integration credentials.</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setActiveTab('settings')}
                    >
                      Go to Settings →
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Facebook Connected</span>
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
                    {integration.credentials?.token_expires_at && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Token Expires</span>
                        <span className="text-sm">
                          {new Date(integration.credentials.token_expires_at as string).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Integration Active</span>
                      {integration.is_active ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
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
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button
                      onClick={handleTest}
                      disabled={isTesting || !credentialsConfigured}
                      variant="outline"
                      className="w-full"
                      title={!credentialsConfigured ? 'Configure credentials in Settings tab first' : 'Test the connection to Facebook'}
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
                    <Button
                      onClick={handleSync}
                      disabled={isSyncing || !integration.is_active || !credentialsConfigured}
                      variant="outline"
                      className="w-full"
                      title={!credentialsConfigured ? 'Configure credentials in Settings tab first' : 'Manually sync leads from Facebook'}
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
                  </CardContent>
                </Card>
              </div>

              {integration.webhook_url && (
                <Card>
                  <CardHeader>
                    <CardTitle>Webhook URL</CardTitle>
                    <CardDescription>
                      Use this URL to configure webhooks in your platform settings. Configure this in Facebook App → Webhooks → Add Callback URL
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 bg-muted rounded text-sm break-all">
                        {integration.webhook_url}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={copyWebhookUrl}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      <strong>Note:</strong> For localhost testing, you'll need to use a tunneling service like ngrok to expose your local server to Facebook.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Connection Info Card */}
              {credentialsConfigured && integration.credentials?.access_token && (
                <Card>
                  <CardHeader>
                    <CardTitle>Connection Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm font-medium mb-1">Ad Account</p>
                      <p className="text-sm text-muted-foreground">
                        {integration.config?.ad_account_id 
                          ? `${integration.config.ad_account_id}` 
                          : 'Not configured'}
                      </p>
                    </div>
                    {integration.config?.selected_campaigns && 
                     Array.isArray(integration.config.selected_campaigns) &&
                     integration.config.selected_campaigns.length > 0 ? (
                      <div>
                        <p className="text-sm font-medium mb-1">Selected Campaigns</p>
                        <p className="text-sm text-muted-foreground">
                          {integration.config.selected_campaigns.length} campaign(s) selected
                        </p>
                      </div>
                    ) : (
                      <Alert className="bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>No Campaigns Selected</AlertTitle>
                        <AlertDescription className="mt-2">
                          <p className="text-sm">
                            You don't have any campaigns selected. Go to <strong>Settings</strong> tab to:
                          </p>
                          <ul className="text-sm list-disc list-inside mt-2 space-y-1">
                            <li>Select an Ad Account</li>
                            <li>Fetch and select campaigns</li>
                            <li>Or create a test Lead Gen Form in Facebook Ads Manager</li>
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
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
            </TabsContent>

            <TabsContent value="campaigns">
              <CampaignAssignmentTable integrationId={integrationId} orgSlug={orgSlug} />
            </TabsContent>

            <TabsContent value="settings">
              <IntegrationSettings integration={integration} onUpdate={fetchIntegration} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

