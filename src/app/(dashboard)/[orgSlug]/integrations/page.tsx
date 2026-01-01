'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plug, Loader2, AlertCircle, ChevronRight } from 'lucide-react'
import { FaFacebook, FaWhatsapp, FaLinkedin, FaInstagram } from 'react-icons/fa'
import { SiGoogleads } from 'react-icons/si'
import Link from 'next/link'
import { toast } from 'sonner'

type PlatformStats = {
  platform: string
  total: number
  active: number
  error: number
}

const PLATFORMS = [
  { 
    value: 'facebook', 
    label: 'Facebook Lead Ads', 
    icon: FaFacebook,
    iconColor: 'text-blue-600',
    description: 'Connect Facebook Lead Ads to automatically capture leads',
    color: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800'
  },
  { 
    value: 'instagram', 
    label: 'Instagram Lead Ads', 
    icon: FaInstagram,
    iconColor: 'text-pink-600',
    description: 'Connect Instagram Lead Ads to capture leads from visual campaigns',
    color: 'bg-pink-50 dark:bg-pink-950 border-pink-200 dark:border-pink-800'
  },
  { 
    value: 'linkedin', 
    label: 'LinkedIn Lead Gen Forms', 
    icon: FaLinkedin,
    iconColor: 'text-blue-700',
    description: 'Connect LinkedIn Lead Gen Forms to capture professional leads',
    color: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800'
  },
  { 
    value: 'whatsapp', 
    label: 'WhatsApp Business API', 
    icon: FaWhatsapp,
    iconColor: 'text-green-500',
    description: 'Connect WhatsApp Business API to capture leads from conversations',
    color: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
  },
  { 
    value: 'google', 
    label: 'Google Ads Lead Forms', 
    icon: SiGoogleads,
    iconColor: 'text-blue-500',
    description: 'Connect Google Ads Lead Form Extensions to capture leads from search campaigns',
    color: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800'
  },
] as const

export default function IntegrationsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [platformStats, setPlatformStats] = useState<PlatformStats[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    fetchPlatformStats()
    fetchUserRole()
  }, [orgSlug])

  const fetchUserRole = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('auth_id', user.id)
        .single()
      if (profile) {
        setUserRole(profile.role)
      }
    }
  }

  const fetchPlatformStats = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/integrations?org_id=${orgSlug}`)
      if (!response.ok) {
        throw new Error('Failed to fetch integrations')
      }
      const data = await response.json()
      const integrations = data.integrations || []

      // Calculate stats per platform
      const stats: PlatformStats[] = PLATFORMS.map(platform => {
        const platformIntegrations = integrations.filter(
          (i: { platform: string }) => i.platform === platform.value
        )
        return {
          platform: platform.value,
          total: platformIntegrations.length,
          active: platformIntegrations.filter((i: { is_active: boolean }) => i.is_active).length,
          error: platformIntegrations.filter((i: { sync_status: string }) => i.sync_status === 'error').length,
        }
      })

      setPlatformStats(stats)
    } catch (error) {
      console.error('Error fetching platform stats:', error)
      toast.error('Failed to load integrations')
    } finally {
      setIsLoading(false)
    }
  }

  if (userRole && userRole !== 'admin' && userRole !== 'super_admin') {
    return (
      <div className="flex h-screen flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
                <p className="text-muted-foreground">
                  You need admin permissions to access integrations.
                </p>
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
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Integrations</h1>
            <p className="text-muted-foreground mt-1">
              Connect your marketing platforms to automatically capture leads
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
              {PLATFORMS.map((platform) => {
                const stats = platformStats.find(s => s.platform === platform.value) || {
                  total: 0,
                  active: 0,
                  error: 0,
                }

                return (
                  <Link 
                    key={platform.value} 
                    href={`/${orgSlug}/integrations/platform/${platform.value}`}
                    className="block"
                  >
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`${platform.iconColor} text-5xl`}>
                              <platform.icon />
                            </div>
                            <div className="flex-1">
                              <CardTitle className="text-xl mb-1">{platform.label}</CardTitle>
                              <CardDescription>{platform.description}</CardDescription>
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <div className="text-sm text-muted-foreground mb-1">Integrations</div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-lg px-3 py-1">
                                {stats.total}
                              </Badge>
                              {stats.active > 0 && (
                                <Badge variant="outline" className="bg-green-500 text-white border-green-500">
                                  {stats.active} Active
                                </Badge>
                              )}
                              {stats.error > 0 && (
                                <Badge variant="destructive">
                                  {stats.error} Error{stats.error > 1 ? 's' : ''}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
