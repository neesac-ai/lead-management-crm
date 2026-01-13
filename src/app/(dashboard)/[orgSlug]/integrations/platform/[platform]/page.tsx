'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Plus, Loader2, RefreshCw, Settings, Trash2, AlertCircle, FileSpreadsheet } from 'lucide-react'
import { MetaLogo } from '@/components/icons/meta-logo'
import Link from 'next/link'
import { toast } from 'sonner'

type Integration = {
  id: string
  name: string
  platform: 'facebook' | 'instagram' | 'google_sheets'
  is_active: boolean
  sync_status: 'idle' | 'syncing' | 'error'
  last_sync_at: string | null
  error_message: string | null
  created_at: string
}

const PLATFORM_INFO: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; iconColor: string; description: string }> = {
  facebook: {
    label: 'Meta Lead Ads',
    icon: MetaLogo,
    iconColor: 'text-[#0866FF]',
    description: 'Manage your Meta Lead Ads integrations (Facebook + Instagram)',
  },
  google_sheets: {
    label: 'Google Sheets',
    icon: FileSpreadsheet,
    iconColor: 'text-emerald-600',
    description: 'Manage your Google Sheets integrations (Google login + polling)',
  },
}

export default function PlatformIntegrationsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  const platform = params.platform as string

  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (platform) {
      fetchIntegrations()
    }
  }, [platform, orgSlug])

  const fetchIntegrations = async () => {
    setIsLoading(true)
    try {
      // We intentionally fetch all and filter client-side so Meta Lead Ads can include both facebook + instagram.
      const response = await fetch(`/api/integrations?org_id=${orgSlug}`)
      if (!response.ok) {
        throw new Error('Failed to fetch integrations')
      }
      const data = await response.json()
      const all = (data.integrations || []) as Integration[]
      if (platform === 'facebook') {
        // Meta Lead Ads section: group facebook + instagram together
        setIntegrations(all.filter((i) => i.platform === 'facebook' || i.platform === 'instagram'))
      } else if (platform === 'google_sheets') {
        setIntegrations(all.filter((i) => i.platform === 'google_sheets'))
      } else {
        setIntegrations([])
      }
    } catch (error) {
      console.error('Error fetching integrations:', error)
      toast.error('Failed to load integrations')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSync = async (integrationId: string) => {
    try {
      const response = await fetch(`/api/integrations/${integrationId}/sync`, {
        method: 'POST',
      })
      if (!response.ok) {
        throw new Error('Failed to sync')
      }
      toast.success('Sync started successfully')
      fetchIntegrations()
    } catch (error) {
      console.error('Error syncing:', error)
      toast.error('Failed to start sync')
    }
  }

  const handleDelete = async (integrationId: string, integrationName: string) => {
    if (!confirm(`Are you sure you want to delete "${integrationName}"? This action cannot be undone and will stop all lead syncing from this integration.`)) {
      return
    }

    setDeletingId(integrationId)
    try {
      const response = await fetch(`/api/integrations/${integrationId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete integration')
      }

      toast.success('Integration deleted successfully')
      fetchIntegrations()
    } catch (error) {
      console.error('Error deleting integration:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to delete integration')
    } finally {
      setDeletingId(null)
    }
  }

  const getStatusBadge = (integration: Integration) => {
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

  const platformInfo = PLATFORM_INFO[platform] || PLATFORM_INFO.facebook

  // Expose Meta Lead Ads + Google Sheets
  if (!['facebook', 'google_sheets'].includes(platform)) {
    return (
      <div className="flex h-screen flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
                <h2 className="text-xl font-semibold mb-2">Platform Disabled</h2>
                <p className="text-muted-foreground mb-4">
                  This platform is not available. Use <strong>Meta Lead Ads</strong> or <strong>Google Sheets</strong> instead.
                </p>
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
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Link href={`/${orgSlug}/integrations`}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <div>
                <div className="flex items-center gap-3">
                  <platformInfo.icon className={`w-10 h-10 ${platformInfo.iconColor}`} />
                  <div>
                    <h1 className="text-3xl font-bold">{platformInfo.label}</h1>
                    <p className="text-muted-foreground mt-1">
                      {platformInfo.description}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <Link href={`/${orgSlug}/integrations/platform/${platform}/new`}>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Integration
              </Button>
            </Link>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : integrations.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <platformInfo.icon className={`w-16 h-16 mx-auto mb-4 ${platformInfo.iconColor}`} />
                  <h3 className="text-xl font-semibold mb-2">No {platformInfo.label} Integrations</h3>
                  <p className="text-muted-foreground mb-6">
                    Get started by creating your first {platformInfo.label} integration
                  </p>
                  <Link href={`/${orgSlug}/integrations/platform/${platform}/new`}>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Integration
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {integrations.map((integration) => (
                <Card key={integration.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{integration.name}</CardTitle>
                        <CardDescription>Integration #{integrations.indexOf(integration) + 1}</CardDescription>
                      </div>
                      {getStatusBadge(integration)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {integration.error_message && (
                        <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                          {integration.error_message}
                        </div>
                      )}
                      {integration.last_sync_at && (
                        <div className="text-sm text-muted-foreground">
                          Last synced: {new Date(integration.last_sync_at).toLocaleString()}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSync(integration.id)}
                          disabled={integration.sync_status === 'syncing'}
                        >
                          {integration.sync_status === 'syncing' ? (
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
                        <Link href={`/${orgSlug}/integrations/${integration.id}`}>
                          <Button variant="outline" size="sm">
                            <Settings className="w-4 h-4 mr-2" />
                            Configure
                          </Button>
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(integration.id, integration.name)}
                          disabled={deletingId === integration.id}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          {deletingId === integration.id ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Deleting...
                            </>
                          ) : (
                            <>
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

