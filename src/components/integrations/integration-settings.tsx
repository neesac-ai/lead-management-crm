'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Facebook,
  RefreshCw,
  ExternalLink,
  Copy
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Integration = {
  id: string
  name: string
  platform: 'facebook' | 'whatsapp' | 'linkedin' | 'instagram'
  credentials: Record<string, unknown>
  config: Record<string, unknown>
  is_active: boolean
}

interface IntegrationSettingsProps {
  integration: Integration
  onUpdate: () => void
}

export function IntegrationSettings({ integration, onUpdate }: IntegrationSettingsProps) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [selectedAdAccount, setSelectedAdAccount] = useState<string>('')
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([])
  const [adAccounts, setAdAccounts] = useState<Array<{ id: string; name: string; account_id?: string }>>([])
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([])
  const [isFetchingCampaigns, setIsFetchingCampaigns] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [facebookAppId, setFacebookAppId] = useState<string>('')
  const [facebookAppSecret, setFacebookAppSecret] = useState<string>('')
  const [isSavingCredentials, setIsSavingCredentials] = useState(false)
  const [hasFacebookIntegration, setHasFacebookIntegration] = useState(false)
  const [isLoadingFacebookCreds, setIsLoadingFacebookCreds] = useState(false)

  const checkForFacebookIntegration = async () => {
    try {
      // Use API to fetch Facebook integrations
      const response = await fetch('/api/integrations?platform=facebook')
      if (!response.ok) {
        console.log('Failed to fetch Facebook integrations:', response.status)
        return // Silently fail
      }

      const data = await response.json()
      const integrations = data.integrations || []
      console.log('Found integrations:', integrations.length)
      
      // Check if there's a Facebook integration with credentials
      const fbIntegration = integrations.find((i: { platform: string; config?: Record<string, unknown> }) => {
        const hasCredentials = i.platform === 'facebook' && 
          i.config?.facebook_app_id && 
          i.config?.facebook_app_secret
        console.log('Checking integration:', i.platform, 'has credentials:', !!hasCredentials)
        return hasCredentials
      })

      if (fbIntegration) {
        console.log('Facebook integration found with credentials, showing copy button')
        setHasFacebookIntegration(true)
      } else {
        console.log('No Facebook integration with credentials found')
      }
    } catch (error) {
      // Silently fail - not critical
      console.error('Error checking for Facebook integration:', error)
    }
  }

  const copyFromFacebookIntegration = async () => {
    setIsLoadingFacebookCreds(true)
    try {
      // Fetch all integrations to find Facebook one
      const response = await fetch('/api/integrations?platform=facebook')
      if (!response.ok) {
        throw new Error('Failed to fetch integrations')
      }

      const data = await response.json()
      const integrations = data.integrations || []
      
      // Find Facebook integration with credentials
      const fbIntegration = integrations.find((i: { 
        platform: string
        config?: Record<string, unknown>
        credentials?: Record<string, unknown>
      }) => 
        i.platform === 'facebook' && 
        i.config?.facebook_app_id && 
        i.config?.facebook_app_secret
      )

      if (!fbIntegration) {
        toast.error('No Facebook integration with credentials found. Make sure you have a Facebook integration configured first.')
        return
      }

      const fbConfig = fbIntegration.config as Record<string, unknown>
      const appId = fbConfig.facebook_app_id as string
      const appSecret = fbConfig.facebook_app_secret as string

      if (!appId || !appSecret) {
        toast.error('Facebook integration does not have App credentials configured')
        return
      }

      // Copy App ID and Secret
      setFacebookAppId(appId)
      setFacebookAppSecret(appSecret)
      setHasFacebookIntegration(false) // Hide the button after copying
      
      toast.success('App ID and Secret copied! Click "Save App Credentials" to save them, then "Connect Instagram Account" to authorize.')
    } catch (error) {
      console.error('Error copying from Facebook integration:', error)
      toast.error('Failed to copy credentials. Please check console for details.')
    } finally {
      setIsLoadingFacebookCreds(false)
    }
  }

  useEffect(() => {
    // Load saved ad accounts and campaigns from config
    const config = integration.config || {}
    if (config.ad_accounts) {
      setAdAccounts(config.ad_accounts as Array<{ id: string; name: string; account_id?: string }>)
    }
    if (config.available_campaigns) {
      setCampaigns(config.available_campaigns as Array<{ id: string; name: string }>)
    }
    if (config.ad_account_id) {
      setSelectedAdAccount(config.ad_account_id as string)
    }
    if (config.selected_campaigns) {
      setSelectedCampaigns(config.selected_campaigns as string[])
    }
    // Load Facebook App credentials
    if (config.facebook_app_id) {
      setFacebookAppId(config.facebook_app_id as string)
    }
    if (config.facebook_app_secret) {
      setFacebookAppSecret(config.facebook_app_secret as string)
    }

    // For Instagram, check if there's a Facebook integration to copy from
    if (integration.platform === 'instagram' && !config.facebook_app_id) {
      checkForFacebookIntegration()
    }
  }, [integration])

  const handleSaveAppCredentials = async () => {
    if (!facebookAppId || !facebookAppSecret) {
      toast.error('Please enter both App ID and App Secret')
      return
    }

    setIsSavingCredentials(true)
    try {
      const response = await fetch(`/api/integrations/${integration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            ...integration.config,
            facebook_app_id: facebookAppId,
            facebook_app_secret: facebookAppSecret,
          },
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save credentials')
      }

      toast.success(`${integration.platform === 'instagram' ? 'Instagram' : 'Facebook'} App credentials saved`)
      onUpdate()
    } catch (error) {
      console.error('Error saving credentials:', error)
      toast.error('Failed to save credentials')
    } finally {
      setIsSavingCredentials(false)
    }
  }

  const handleConnectFacebook = async () => {
    // Check if App ID and Secret are configured
    const config = integration.config || {}
    const appId = config.facebook_app_id as string
    const appSecret = config.facebook_app_secret as string

    if (!appId || !appSecret) {
      toast.error('Please configure Facebook App ID and App Secret first')
      return
    }

    setIsConnecting(true)
    try {
      // Redirect to OAuth initiation
      window.location.href = `/api/integrations/${integration.id}/oauth`
    } catch (error) {
      console.error('Error initiating OAuth:', error)
      toast.error('Failed to connect to Facebook')
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm(`Are you sure you want to disconnect ${integration.platform === 'instagram' ? 'Instagram' : 'Facebook'}? This will remove all credentials.`)) {
      return
    }

    try {
      const response = await fetch(`/api/integrations/${integration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentials: {},
          config: {
            ad_account_id: null,
            selected_campaigns: [],
            available_campaigns: [],
            ad_accounts: [],
          },
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to disconnect')
      }

      toast.success(`${integration.platform === 'instagram' ? 'Instagram' : 'Facebook'} disconnected successfully`)
      onUpdate()
    } catch (error) {
      console.error('Error disconnecting:', error)
      toast.error('Failed to disconnect Facebook')
    }
  }

  const handleFetchCampaigns = async () => {
    if (!selectedAdAccount) {
      toast.error('Please select an ad account first')
      return
    }

    setIsFetchingCampaigns(true)
    try {
      const response = await fetch(`/api/integrations/${integration.id}/campaigns`)
      if (!response.ok) {
        throw new Error('Failed to fetch campaigns')
      }

      const data = await response.json()
      setCampaigns(data.campaigns || [])
      
      // Save to config
      await fetch(`/api/integrations/${integration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            ...integration.config,
            available_campaigns: data.campaigns,
          },
        }),
      })

      toast.success(`Found ${data.campaigns?.length || 0} campaigns`)
    } catch (error) {
      console.error('Error fetching campaigns:', error)
      toast.error('Failed to fetch campaigns')
    } finally {
      setIsFetchingCampaigns(false)
    }
  }

  const handleSaveCampaignSelection = async () => {
    setIsSaving(true)
    try {
      const response = await fetch(`/api/integrations/${integration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            ...integration.config,
            ad_account_id: selectedAdAccount,
            selected_campaigns: selectedCampaigns,
          },
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save campaign selection')
      }

      toast.success('Campaign selection saved')
      onUpdate()
    } catch (error) {
      console.error('Error saving campaigns:', error)
      toast.error('Failed to save campaign selection')
    } finally {
      setIsSaving(false)
    }
  }

  const isConnected = !!(integration.credentials?.access_token as string)
  const tokenExpiresAt = integration.credentials?.token_expires_at as string | undefined
  
  // Check if credentials are already saved (match current config)
  const config = integration.config || {}
  const savedAppId = config.facebook_app_id as string
  const savedAppSecret = config.facebook_app_secret as string
  const credentialsMatchSaved = 
    facebookAppId === savedAppId && 
    facebookAppSecret === savedAppSecret &&
    facebookAppId !== '' &&
    facebookAppSecret !== ''

  // Only show Facebook/Instagram OAuth UI for Facebook and Instagram platforms
  // Instagram uses the same Meta API as Facebook
  if (integration.platform !== 'facebook' && integration.platform !== 'instagram') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Configuration for {integration.platform} integration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              Manual configuration for {integration.platform} is not yet available. Please use the API directly.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Facebook App Credentials */}
      <Card>
        <CardHeader>
          <CardTitle>Facebook App Credentials</CardTitle>
          <CardDescription>
            Enter your Facebook App ID and App Secret. These are required before connecting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="facebookAppId">Facebook App ID *</Label>
            <Input
              id="facebookAppId"
              type="text"
              value={facebookAppId}
              onChange={(e) => setFacebookAppId(e.target.value)}
              placeholder="Enter your Facebook App ID"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Found in Facebook App Dashboard → Settings → Basic → App ID
              </p>
              {integration.platform === 'instagram' && hasFacebookIntegration && !facebookAppId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyFromFacebookIntegration}
                  disabled={isLoadingFacebookCreds}
                  className="h-7 text-xs"
                >
                  {isLoadingFacebookCreds ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 mr-1" />
                      Copy from Facebook
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="facebookAppSecret">Facebook App Secret *</Label>
            <Input
              id="facebookAppSecret"
              type="password"
              value={facebookAppSecret}
              onChange={(e) => setFacebookAppSecret(e.target.value)}
              placeholder="Enter your Facebook App Secret"
            />
            <p className="text-xs text-muted-foreground">
              Found in Facebook App Dashboard → Settings → Basic → App Secret (click "Show")
            </p>
          </div>

          {credentialsMatchSaved && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>Credentials saved</span>
            </div>
          )}
          <Button
            onClick={handleSaveAppCredentials}
            disabled={isSavingCredentials || !facebookAppId || !facebookAppSecret || credentialsMatchSaved}
            className="w-full"
            variant={credentialsMatchSaved ? "outline" : "default"}
          >
            {isSavingCredentials ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : credentialsMatchSaved ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Credentials Saved
              </>
            ) : (
              'Save App Credentials'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle>
            {integration.platform === 'instagram' ? 'Instagram' : 'Facebook'} Connection
          </CardTitle>
          <CardDescription>
            Connect your {integration.platform === 'instagram' ? 'Instagram' : 'Facebook'} account to automatically sync leads
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConnected ? (
            <div className="space-y-4">
              <Alert>
                <Facebook className="h-4 w-4" />
                <AlertTitle>Not Connected</AlertTitle>
                <AlertDescription>
                  {facebookAppId && facebookAppSecret ? (
                    <>Click the button below to connect your {integration.platform === 'instagram' ? 'Instagram' : 'Facebook'} account. You'll be redirected to {integration.platform === 'instagram' ? 'Meta' : 'Facebook'} to authorize access.</>
                  ) : (
                    <>Please configure {integration.platform === 'instagram' ? 'Instagram' : 'Facebook'} App ID and App Secret above before connecting.</>
                  )}
                </AlertDescription>
              </Alert>
              <Button 
                onClick={handleConnectFacebook}
                disabled={isConnecting || !facebookAppId || !facebookAppSecret}
                className="w-full"
                size="lg"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Facebook className="w-4 h-4 mr-2" />
                    Connect {integration.platform === 'instagram' ? 'Instagram' : 'Facebook'} Account
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <div>
                    <div className="font-medium">Connected to {integration.platform === 'instagram' ? 'Instagram' : 'Facebook'}</div>
                    {tokenExpiresAt && (
                      <div className="text-sm text-muted-foreground">
                        Token expires: {new Date(tokenExpiresAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleDisconnect}>
                  Disconnect
                </Button>
              </div>

              {/* Ad Account Selection */}
              {adAccounts.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Ad Account</label>
                  <Select value={selectedAdAccount} onValueChange={setSelectedAdAccount}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select ad account" />
                    </SelectTrigger>
                    <SelectContent>
                      {adAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name} ({account.account_id || account.id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleFetchCampaigns}
                    disabled={!selectedAdAccount || isFetchingCampaigns}
                  >
                    {isFetchingCampaigns ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Fetching...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Fetch Campaigns
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Campaign Selection */}
              {campaigns.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Campaigns to Sync</label>
                  <div className="space-y-2 max-h-60 overflow-y-auto border rounded-lg p-3">
                    {campaigns.map((campaign) => (
                      <div key={campaign.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`campaign-${campaign.id}`}
                          checked={selectedCampaigns.includes(campaign.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedCampaigns([...selectedCampaigns, campaign.id])
                            } else {
                              setSelectedCampaigns(selectedCampaigns.filter(id => id !== campaign.id))
                            }
                          }}
                        />
                        <label 
                          htmlFor={`campaign-${campaign.id}`}
                          className="text-sm cursor-pointer flex-1"
                        >
                          {campaign.name}
                        </label>
                      </div>
                    ))}
                  </div>
                  <Button
                    onClick={handleSaveCampaignSelection}
                    disabled={selectedCampaigns.length === 0 || isSaving}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      `Save Campaign Selection (${selectedCampaigns.length} selected)`
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


