'use client'

import { useEffect, useState, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getMenuNames, getMenuLabel } from '@/lib/menu-names'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Building2,
  Calendar,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Phone,
  User,
  Key,
  Pencil,
  X,
  MapPin,
} from 'lucide-react'
import { isNativeApp, getNativeBridge } from '@/lib/native-bridge'
import { globalNativeEventListener } from '@/lib/global-native-events'
import { toast } from 'sonner'
import { LeadStatusesManager } from '@/components/settings/lead-statuses-manager'
import { MenuNamesManager } from '@/components/settings/menu-names-manager'

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

type UserProfile = {
  id: string
  name: string
  email: string
  role: string
  org_id: string
  google_refresh_token: string | null
}

type OrgInfo = {
  name: string
  org_code: string
  contact_email?: string | null
}

export default function SettingsPage({ params }: PageProps) {
  const { orgSlug } = use(params)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [orgEmail, setOrgEmail] = useState('')
  const [isSavingOrg, setIsSavingOrg] = useState(false)
  const [callTrackingStatus, setCallTrackingStatus] = useState<{
    enabled: boolean
    configured: boolean
    allowed_phone_account_ids: string[]
  } | null>(null)

  // Profile editing states
  const [profileName, setProfileName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isEditingProfile, setIsEditingProfile] = useState(false)

  // Password reset states
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [showPasswordSection, setShowPasswordSection] = useState(false)

  // Location tracking (team member only)
  const [isLocationTrackingEnabled, setIsLocationTrackingEnabled] = useState(false)
  const [isLoadingLocationTracking, setIsLoadingLocationTracking] = useState(true)
  const [isSavingLocationTracking, setIsSavingLocationTracking] = useState(false)
  const [menuNames, setMenuNames] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchData()
    fetchMenuNames()
  }, [orgSlug])

  // Fetch menu names
  const fetchMenuNames = async () => {
    try {
      const names = await getMenuNames()
      setMenuNames(names)
    } catch (error) {
      console.error('Error fetching menu names:', error)
    }
  }

  // Listen for menu name updates
  useEffect(() => {
    const handleMenuNamesUpdate = () => {
      fetchMenuNames()
    }
    window.addEventListener('menu-names-updated', handleMenuNamesUpdate)
    return () => {
      window.removeEventListener('menu-names-updated', handleMenuNamesUpdate)
    }
  }, [])

  // Call tracking status (native only)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isNativeApp()) return

    const bridge = getNativeBridge()
    const refresh = () => {
      try {
        const raw = bridge?.getCallTrackingStatus?.()
        if (!raw) return
        const parsed = JSON.parse(raw) as any
        setCallTrackingStatus({
          enabled: !!parsed.enabled,
          configured: !!parsed.configured,
          allowed_phone_account_ids: Array.isArray(parsed.allowed_phone_account_ids) ? parsed.allowed_phone_account_ids : [],
        })
      } catch (e) {
        console.warn('Failed to parse call tracking status', e)
      }
    }

    refresh()
    const cleanup = globalNativeEventListener.addHandler((event) => {
      if (event.type === 'CALL_TRACKING_SETUP') {
        refresh()
      }
    })
    return cleanup
  }, [orgSlug])

  const fetchData = async () => {
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await (supabase as any)
      .from('users')
      .select('id, name, email, role, org_id, google_refresh_token')
      .eq('auth_id', user.id)
      .single()

    if (profile) {
      setUserProfile(profile as UserProfile)
      setProfileName(profile.name || '')

      // Fetch org info via API (bypasses RLS)
      try {
        const orgResponse = await fetch('/api/org/info')
        if (orgResponse.ok) {
          const org = await orgResponse.json()
          setOrgInfo(org as OrgInfo)
          setOrgName(org.name || '')
          setOrgEmail(org.contact_email || '')
          setCompanyName(org.name || '')
        }
      } catch (error) {
        console.error('Error fetching org info:', error)
      }

      if (profile.role === 'admin' && profile.org_id) {
        // AI configuration settings removed for now
      }
    }

    // Fetch location tracking setting (team member only)
    try {
      const res = await fetch('/api/locations/settings')
      if (res.ok) {
        const data = await res.json()
        setIsLocationTrackingEnabled(!!data?.is_tracking_enabled)
      }
    } catch (e) {
      console.error('Error fetching location tracking settings:', e)
    } finally {
      setIsLoadingLocationTracking(false)
    }

    setIsLoading(false)
  }

  const handleToggleLocationTracking = async (enabled: boolean) => {
    setIsSavingLocationTracking(true)
    try {
      const res = await fetch('/api/locations/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_tracking_enabled: enabled }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to update location tracking setting')
      }
      setIsLocationTrackingEnabled(enabled)
      toast.success(enabled ? 'Live location tracking enabled' : 'Live location tracking disabled')
      // Notify global tracker to refresh
      window.dispatchEvent(new CustomEvent('location-tracking-changed', { detail: { enabled } }))
    } catch (e) {
      console.error('Error updating location tracking settings:', e)
      toast.error(e instanceof Error ? e.message : 'Failed to update setting')
    } finally {
      setIsSavingLocationTracking(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!userProfile?.id) return

    setIsSavingProfile(true)
    const supabase = createClient()

    const { error } = await (supabase as any)
      .from('users')
      .update({ name: profileName })
      .eq('id', userProfile.id)

    if (error) {
      toast.error('Failed to save profile')
    } else {
      toast.success('Profile saved')
      setUserProfile(prev => prev ? { ...prev, name: profileName } : null)
      // Notify sidebar to refresh user data
      window.dispatchEvent(new CustomEvent('profile-updated'))
    }
    setIsSavingProfile(false)
  }

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error('Please fill in all password fields')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    setIsChangingPassword(true)
    const supabase = createClient()

    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })

    if (error) {
      toast.error(error.message || 'Failed to change password')
    } else {
      toast.success('Password changed successfully')
      setNewPassword('')
      setConfirmPassword('')
    }
    setIsChangingPassword(false)
  }

  const handleConnectGoogle = async () => {
    setIsConnectingGoogle(true)
    try {
      const response = await fetch('/api/google/auth')
      const data = await response.json()
      if (data.url) {
        const popup = window.open(data.url, '_blank', 'noopener,noreferrer')
        if (!popup) {
          toast.error('Please allow popups to connect Google')
          setIsConnectingGoogle(false)
          return
        }

        const pollInterval = setInterval(async () => {
          const supabase = createClient()
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data: profile } = await (supabase as any)
              .from('users')
              .select('google_refresh_token')
              .eq('auth_id', user.id)
              .single()

            if (profile?.google_refresh_token) {
              clearInterval(pollInterval)
              setIsConnectingGoogle(false)
              toast.success('Google account connected!')
              fetchData()
            }
          }
        }, 2000)

        setTimeout(() => {
          clearInterval(pollInterval)
          setIsConnectingGoogle(false)
        }, 120000)
      }
    } catch (error) {
      console.error('Error connecting Google:', error)
      toast.error('Failed to connect Google account')
      setIsConnectingGoogle(false)
    }
  }

  const handleDisconnectGoogle = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await (supabase as any)
      .from('users')
      .update({
        google_access_token: null,
        google_refresh_token: null
      })
      .eq('auth_id', user.id)

    if (error) {
      toast.error('Failed to disconnect Google account')
    } else {
      toast.success('Google account disconnected')
      setUserProfile(prev => prev ? { ...prev, google_refresh_token: null } : null)
    }
  }

  const handleSaveOrg = async () => {
    if (!userProfile?.org_id) return

    setIsSavingOrg(true)
    const supabase = createClient()

    const { error } = await (supabase as any)
      .from('organizations')
      .update({
        name: orgName,
      })
      .eq('id', userProfile.org_id)

    if (error) {
      toast.error('Failed to save organization settings')
    } else {
      toast.success('Organization settings saved')
    }
    setIsSavingOrg(false)
  }

  const isAdmin = userProfile?.role === 'admin'
  const isGoogleConnected = !!userProfile?.google_refresh_token

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="Settings"
        description="Manage your account and organization settings"
      />

      <div className="flex-1 p-4 lg:p-6 space-y-4 lg:space-y-6">
        {/* Account Information - Registration Info */}
        <Card>
          <CardHeader className="px-4 lg:px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <CardTitle>Account Information</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {userProfile?.role?.replace('_', ' ')}
                </Badge>
                {!isEditingProfile && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingProfile(true)}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                )}
              </div>
            </div>
            <CardDescription>
              Your account details from registration
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 lg:px-6 space-y-6">
            {/* Account Details - Display Mode */}
            {!isEditingProfile ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Name</Label>
                  <p className="font-medium">{userProfile?.name || '-'}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Organization Name</Label>
                  <p className="font-medium">{orgInfo?.name || companyName || '-'}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Email</Label>
                  <p className="font-medium">{userProfile?.email || '-'}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Organization Code</Label>
                  <p className="font-medium font-mono text-primary">{orgInfo?.org_code || '-'}</p>
                  <p className="text-xs text-muted-foreground">Share this code with team members</p>
                </div>
              </div>
            ) : (
              /* Account Details - Edit Mode */
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="Your name"
                    />
                  </div>
                  {isAdmin && (
                    <div className="space-y-2">
                      <Label>Organization Name</Label>
                      <Input
                        value={companyName}
                        onChange={(e) => {
                          setCompanyName(e.target.value)
                          setOrgName(e.target.value)
                        }}
                        placeholder="Organization name"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      value={userProfile?.email || ''}
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                  </div>
                  {orgInfo && (
                    <div className="space-y-2">
                      <Label>Organization Code</Label>
                      <Input
                        value={orgInfo.org_code}
                        disabled
                        className="bg-muted font-mono"
                      />
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button onClick={async () => {
                    await handleSaveProfile()
                    if (isAdmin) {
                      await handleSaveOrg()
                    }
                    setIsEditingProfile(false)
                  }} disabled={isSavingProfile || isSavingOrg}>
                    {(isSavingProfile || isSavingOrg) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save Changes
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Reset to original values
                      setProfileName(userProfile?.name || '')
                      setCompanyName(orgInfo?.name || '')
                      setOrgName(orgInfo?.name || '')
                      setIsEditingProfile(false)
                    }}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                </div>
              </>
            )}

            {/* Password Reset Section */}
            <div className="pt-4 border-t">
              {!showPasswordSection ? (
                <Button
                  variant="ghost"
                  onClick={() => setShowPasswordSection(true)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Key className="h-4 w-4 mr-2 text-orange-500" />
                  Change Password
                </Button>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-orange-500" />
                      <h4 className="font-medium">Change Password</h4>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowPasswordSection(false)
                        setNewPassword('')
                        setConfirmPassword('')
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>New Password</Label>
                      <Input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Confirm Password</Label>
                      <Input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={async () => {
                      await handleChangePassword()
                      setShowPasswordSection(false)
                    }}
                    disabled={isChangingPassword}
                    className="mt-4"
                  >
                    {isChangingPassword && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Update Password
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 2. Google Calendar Connection */}
        <Card>
          <CardHeader className="px-4 lg:px-6">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-500" />
              <CardTitle>Google Calendar</CardTitle>
            </div>
            <CardDescription>
              Connect to schedule demos and create calendar events
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 lg:px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isGoogleConnected ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="font-medium">Connected</p>
                      <p className="text-sm text-muted-foreground">
                        Google Calendar is linked
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Not Connected</p>
                      <p className="text-sm text-muted-foreground">
                        Connect to schedule demos
                      </p>
                    </div>
                  </>
                )}
              </div>

              {isGoogleConnected ? (
                <Button variant="outline" onClick={handleDisconnectGoogle}>
                  Disconnect
                </Button>
              ) : (
                <Button onClick={handleConnectGoogle} disabled={isConnectingGoogle}>
                  {isConnectingGoogle ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Calendar className="h-4 w-4 mr-2" />
                  )}
                  Connect Google
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 3. Lead Statuses Management (Admin only) */}
        {isAdmin && <LeadStatusesManager orgSlug={orgSlug} isAdmin={isAdmin} />}

        {/* 4. Sidebar Menu Names (Admin only) */}
        {isAdmin && <MenuNamesManager orgSlug={orgSlug} isAdmin={isAdmin} />}

        {/* 5. Call Tracking (Android app only) */}
        <Card>
          <CardHeader className="px-4 lg:px-6">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-green-600" />
              <CardTitle>Call Tracking</CardTitle>
            </div>
            <CardDescription>
              Enable tracking for inbound and outbound calls (Android app only). You'll choose which SIM to allow.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 lg:px-6">
            {!isNativeApp() ? (
              <div className="text-sm text-muted-foreground">
                Call tracking is available in the Android app. Install/open the Android app to enable.
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {callTrackingStatus?.enabled ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <div>
                        <p className="font-medium">Enabled</p>
                        <p className="text-sm text-muted-foreground">
                          {callTrackingStatus.allowed_phone_account_ids?.length
                            ? `Allowed SIMs: ${callTrackingStatus.allowed_phone_account_ids.length}`
                            : 'Allowed SIMs: All (no SIM filter)'}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Disabled</p>
                        <p className="text-sm text-muted-foreground">
                          Enable to track all calls from selected SIM(s)
                        </p>
                      </div>
                    </>
                  )}
                </div>

                <Button
                  onClick={() => {
                    const bridge = getNativeBridge()
                    if (!bridge?.setupCallTracking) {
                      toast.error('Native call tracking setup not available')
                      return
                    }
                    toast.info('Select SIM and grant permissions on the prompt')
                    bridge.setupCallTracking()
                  }}
                >
                  {callTrackingStatus?.enabled ? 'Manage' : 'Enable'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 6. Live Location Tracking (team member only) */}
        <Card>
          <CardHeader className="px-4 lg:px-6">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-purple-500" />
              <CardTitle>Live Location Tracking</CardTitle>
            </div>
            <CardDescription>
              When enabled, your location is tracked while the app is open. Admins can view team locations in real time.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 lg:px-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {isLoadingLocationTracking ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <div>
                      <p className="font-medium">Loading…</p>
                      <p className="text-sm text-muted-foreground">Fetching your tracking setting</p>
                    </div>
                  </>
                ) : isLocationTrackingEnabled ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="font-medium">Enabled</p>
                      <p className="text-sm text-muted-foreground">Your location will update while the app is open</p>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Disabled</p>
                      <p className="text-sm text-muted-foreground">Enable to share your live location (app open)</p>
                    </div>
                  </>
                )}
              </div>

              <Button
                variant={isLocationTrackingEnabled ? 'outline' : 'default'}
                disabled={isLoadingLocationTracking || isSavingLocationTracking}
                onClick={() => handleToggleLocationTracking(!isLocationTrackingEnabled)}
              >
                {isSavingLocationTracking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isLocationTrackingEnabled ? 'Disable' : 'Enable'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
