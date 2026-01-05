'use client'

import { useEffect, useState, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Building2,
  Calendar,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Sparkles,
  FolderOpen,
  Folder,
  ChevronRight,
  RefreshCw,
  User,
  Key,
  Pencil,
  X,
  Download,
  Smartphone,
  MapPin,
} from 'lucide-react'
import { isNativeApp } from '@/lib/native-bridge'
import { toast } from 'sonner'
import Link from 'next/link'

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

type DriveFolder = {
  id: string
  name: string
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
  const [hasAIConfig, setHasAIConfig] = useState(false)

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

  // Drive folder states
  const [syncSettings, setSyncSettings] = useState<{
    id?: string
    folder_id: string | null
    folder_name: string | null
    last_sync_at: string | null
  } | null>(null)
  const [showFolderBrowser, setShowFolderBrowser] = useState(false)
  const [driveFolders, setDriveFolders] = useState<DriveFolder[]>([])
  const [loadingFolders, setLoadingFolders] = useState(false)
  const [savingFolder, setSavingFolder] = useState(false)

  useEffect(() => {
    fetchData()
  }, [orgSlug])

  const fetchData = async () => {
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
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
        const { data: aiConfigs } = await supabase
          .from('ai_config')
          .select('id')
          .eq('org_id', profile.org_id)
          .eq('is_active', true)
          .limit(1)

        setHasAIConfig(!!(aiConfigs && aiConfigs.length > 0))
      }

      // Get drive sync settings
      const { data: sync } = await supabase
        .from('drive_sync_settings')
        .select('id, folder_id, folder_name, last_sync_at')
        .eq('user_id', profile.id)
        .single()

      if (sync) {
        setSyncSettings(sync)
      }
    }

    setIsLoading(false)
  }

  const handleSaveProfile = async () => {
    if (!userProfile?.id) return

    setIsSavingProfile(true)
    const supabase = createClient()

    const { error } = await supabase
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
      setCurrentPassword('')
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
            const { data: profile } = await supabase
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

    const { error } = await supabase
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
      setSyncSettings(null)
    }
  }

  const handleSaveOrg = async () => {
    if (!userProfile?.org_id) return

    setIsSavingOrg(true)
    const supabase = createClient()

    const { error } = await supabase
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

  const handleBrowseFolders = async () => {
    setShowFolderBrowser(true)
    setLoadingFolders(true)

    try {
      const response = await fetch('/api/google/drive/folders')
      const data = await response.json()

      if (data.error) {
        toast.error(data.error)
        setShowFolderBrowser(false)
      } else {
        setDriveFolders(data.folders || [])
      }
    } catch (error) {
      console.error('Error fetching folders:', error)
      toast.error('Failed to load folders')
      setShowFolderBrowser(false)
    }

    setLoadingFolders(false)
  }

  const handleSelectFolder = async (folder: DriveFolder) => {
    if (!userProfile?.id || !userProfile?.org_id) return

    setSavingFolder(true)
    const supabase = createClient()

    if (syncSettings?.id) {
      const { error } = await supabase
        .from('drive_sync_settings')
        .update({
          folder_id: folder.id,
          folder_name: folder.name,
        })
        .eq('id', syncSettings.id)

      if (error) {
        toast.error('Failed to save folder')
      } else {
        toast.success(`Connected to folder: ${folder.name}`)
        setSyncSettings(prev => prev ? { ...prev, folder_id: folder.id, folder_name: folder.name } : null)
        setShowFolderBrowser(false)
        // Trigger initial sync
        triggerSync()
      }
    } else {
      const { data, error } = await supabase
        .from('drive_sync_settings')
        .insert({
          user_id: userProfile.id,
          org_id: userProfile.org_id,
          folder_id: folder.id,
          folder_name: folder.name,
        })
        .select('id, folder_id, folder_name, last_sync_at')
        .single()

      if (error) {
        toast.error('Failed to save folder')
      } else {
        toast.success(`Connected to folder: ${folder.name}`)
        setSyncSettings(data)
        setShowFolderBrowser(false)
        // Trigger initial sync
        triggerSync()
      }
    }
    setSavingFolder(false)
  }

  const triggerSync = async () => {
    try {
      await fetch('/api/recordings/sync', { method: 'POST' })
    } catch (error) {
      console.error('Initial sync error:', error)
    }
  }

  const handleDisconnectFolder = async () => {
    if (!syncSettings?.id) return

    const supabase = createClient()
    const { error } = await supabase
      .from('drive_sync_settings')
      .delete()
      .eq('id', syncSettings.id)

    if (error) {
      toast.error('Failed to disconnect folder')
    } else {
      toast.success('Folder disconnected')
      setSyncSettings(null)
    }
  }

  const isAdmin = userProfile?.role === 'admin'
  const isGoogleConnected = !!userProfile?.google_refresh_token
  const isFolderConnected = !!syncSettings?.folder_id

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

        {/* 1. Google Calendar Connection */}
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

        {/* 2. Call Recording Drive Folder */}
        <Card>
          <CardHeader className="px-4 lg:px-6">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-amber-500" />
              <CardTitle>Call Recording Folder</CardTitle>
            </div>
            <CardDescription>
              Connect your Google Drive folder where call recordings are saved
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 lg:px-6">
            {!isGoogleConnected ? (
              <div className="text-center py-6 text-muted-foreground">
                <Calendar className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>Connect Google account first to access Drive folders</p>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isFolderConnected ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <div>
                        <p className="font-medium flex items-center gap-2">
                          <Folder className="h-4 w-4" />
                          {syncSettings?.folder_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Recordings auto-sync from this folder
                          {syncSettings?.last_sync_at && (
                            <span className="ml-1">
                              • Last: {new Date(syncSettings.last_sync_at).toLocaleString()}
                            </span>
                          )}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">No Folder Selected</p>
                        <p className="text-sm text-muted-foreground">
                          Select the folder where your call recordings are saved
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {isFolderConnected ? (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleBrowseFolders}>
                      Change
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleDisconnectFolder}>
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <Button onClick={handleBrowseFolders}>
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Select Folder
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Configuration (Admin Only) */}
        {isAdmin && (
          <Card>
            <CardHeader className="px-4 lg:px-6">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                <CardTitle>AI Configuration</CardTitle>
              </div>
              <CardDescription>
                Configure AI providers for call transcription and analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 lg:px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {hasAIConfig ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <div>
                        <p className="font-medium">Configured</p>
                        <p className="text-sm text-muted-foreground">
                          AI providers are set up
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Not Configured</p>
                        <p className="text-sm text-muted-foreground">
                          Set up AI for call analysis
                        </p>
                      </div>
                    </>
                  )}
                </div>

                <Button asChild>
                  <Link href={`/${orgSlug}/settings/ai`}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {hasAIConfig ? 'Manage AI' : 'Configure AI'}
                    <ExternalLink className="h-3 w-3 ml-2" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Folder Browser Dialog */}
      <Dialog open={showFolderBrowser} onOpenChange={setShowFolderBrowser}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Recording Folder</DialogTitle>
            <DialogDescription>
              Choose the Google Drive folder where your call recordings are saved
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {loadingFolders ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : driveFolders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Folder className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>No folders found in your Drive</p>
                <p className="text-xs mt-2">Create a folder in Google Drive first</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {driveFolders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => handleSelectFolder(folder)}
                    disabled={savingFolder}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors text-left"
                  >
                    <Folder className="h-5 w-5 text-amber-500 flex-shrink-0" />
                    <span className="flex-1 truncate">{folder.name}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-between items-center pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={handleBrowseFolders} disabled={loadingFolders}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingFolders ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => setShowFolderBrowser(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
