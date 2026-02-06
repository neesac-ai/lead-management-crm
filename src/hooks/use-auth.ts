'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/lib/store/auth-store'
import type { AuthUser, UserRole } from '@/types'
import { getNativeBridge, isNativeApp } from '@/lib/native-bridge'

export function useAuth() {
  const router = useRouter()
  const { user, isLoading, setUser, setLoading, logout: logoutStore } = useAuthStore()

  useEffect(() => {
    const supabase = createClient()

    const syncNativeTokens = async () => {
      if (typeof window === 'undefined') return
      if (!isNativeApp()) return
      const bridge = getNativeBridge()
      if (!bridge?.setAuthTokens) return

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token && session?.refresh_token && session?.expires_at) {
          bridge.setAuthTokens(session.access_token, session.refresh_token, session.expires_at)
        }
      } catch (e) {
        console.warn('[NATIVE_AUTH] Failed to sync tokens to native', e)
      }
    }

    const enrollDeviceForNative = async () => {
      if (typeof window === 'undefined') return
      if (!isNativeApp()) return
      const bridge = getNativeBridge()
      if (!bridge?.setDeviceEnrollment && !bridge?.setDeviceEnrollmentWithResult && !bridge?.setDeviceEnrollmentDetailsWithResult) return

      try {
        const res = await fetch('/api/native/device/enroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: 'android',
            device_label: 'Android device',
          }),
        })
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        const deviceId = String(data?.device?.id || '')
        const deviceKey = String(data?.device_key || '')
        const assignedName = String(data?.assigned_user?.name || '')
        const assignedEmail = String(data?.assigned_user?.email || '')
        if (deviceId && deviceKey) {
          if (bridge.setDeviceEnrollmentDetailsWithResult) {
            bridge.setDeviceEnrollmentDetailsWithResult(deviceId, deviceKey, assignedName, assignedEmail)
          } else if (bridge.setDeviceEnrollmentWithResult) {
            bridge.setDeviceEnrollmentWithResult(deviceId, deviceKey)
          } else {
            bridge.setDeviceEnrollment?.(deviceId, deviceKey)
          }
        }
      } catch (e) {
        console.warn('[DEVICE_ENROLL] Failed to enroll device', e)
      }
    }

    // Get initial session
    const enforceOrgSubscriptionActive = async (profile: {
      org_id: string | null
      role: string
    }) => {
      // Super admins are allowed regardless of org subscription status.
      if (!profile.org_id || profile.role === 'super_admin') return true

      const { data: sub } = await supabase
        .from('org_subscriptions')
        .select('status, end_date')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const allowedStatuses = ['active', 'trialing']
      let isAllowed = false

      if (sub) {
        const status = (sub as any).status as string
        const endDateStr = (sub as any).end_date as string | undefined
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const endDate = endDateStr ? new Date(endDateStr) : null
        const isExpired = !!endDate && endDate < today

        isAllowed = allowedStatuses.includes(status) && !isExpired
      }

      if (!isAllowed) {
        // Org subscription is paused / cancelled / expired or missing -> force logout.
        await supabase.auth.signOut()
        logoutStore()
        setUser(null)
        router.push('/login')
        return false
      }

      return true
    }

    const getSession = async () => {
      setLoading(true)
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser()

        if (authUser) {
          // Fetch user profile
          const { data: profile } = await supabase
            .from('users')
            .select(`
              id,
              email,
              name,
              avatar_url,
              role,
              org_id,
              is_approved,
              organizations(slug)
            `)
            .eq('auth_id', authUser.id)
            .single()

          if (profile) {
            const p = profile as {
              id: string
              email: string
              name: string
              avatar_url: string | null
              role: string
              org_id: string | null
              is_approved: boolean
              organizations: { slug: string } | null
            }
            // Enforce org subscription status for non-super-admin users.
            const ok = await enforceOrgSubscriptionActive({ org_id: p.org_id, role: p.role })
            if (!ok) return

            const authUserData: AuthUser = {
              id: p.id,
              email: p.email,
              name: p.name,
              avatar_url: p.avatar_url,
              role: p.role as UserRole,
              org_id: p.org_id,
              org_slug: p.organizations?.slug || null,
              is_approved: p.is_approved,
            }
            setUser(authUserData)
          } else {
            setUser(null)
          }
        } else {
          setUser(null)
        }
      } catch (error) {
        console.error('Error getting session:', error)
        setUser(null)
      }
    }

    getSession()
    // Also sync tokens for native background features
    void syncNativeTokens()
    // And enroll device for device-key auth (one-time; safe to call repeatedly)
    void enrollDeviceForNative()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          logoutStore()
          router.push('/login')
          // NOTE: Do NOT clear device enrollment on logout.
          // We only clear session tokens; device-key auth remains valid until admin revokes it.
          if (isNativeApp()) getNativeBridge()?.setAuthTokens?.('', '', 0)
        } else if (event === 'SIGNED_IN' && session?.user) {
          // Sync tokens to native
          if (session?.access_token && session?.refresh_token && session?.expires_at && isNativeApp()) {
            getNativeBridge()?.setAuthTokens?.(session.access_token, session.refresh_token, session.expires_at)
          }
          // Enroll device for device-key auth after sign-in
          void enrollDeviceForNative()
          // Refresh user profile
          const { data: profile } = await supabase
            .from('users')
            .select(`
              id,
              email,
              name,
              avatar_url,
              role,
              org_id,
              is_approved,
              organizations(slug)
            `)
            .eq('auth_id', session.user.id)
            .single()

          if (profile) {
            const p = profile as {
              id: string
              email: string
              name: string
              avatar_url: string | null
              role: string
              org_id: string | null
              is_approved: boolean
              organizations: { slug: string } | null
            }
            // Enforce org subscription status for non-super-admin users on sign-in.
            const ok = await enforceOrgSubscriptionActive({ org_id: p.org_id, role: p.role })
            if (!ok) return

            const authUserData: AuthUser = {
              id: p.id,
              email: p.email,
              name: p.name,
              avatar_url: p.avatar_url,
              role: p.role as UserRole,
              org_id: p.org_id,
              org_slug: p.organizations?.slug || null,
              is_approved: p.is_approved,
            }
            setUser(authUserData)
          }
        } else if (event === 'TOKEN_REFRESHED') {
          if (session?.access_token && session?.refresh_token && session?.expires_at && isNativeApp()) {
            getNativeBridge()?.setAuthTokens?.(session.access_token, session.refresh_token, session.expires_at)
          }
          // Keep enrollment fresh (no-op if already enrolled)
          void enrollDeviceForNative()
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [setUser, setLoading, logoutStore, router])

  const logout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    logoutStore()
    router.push('/login')
  }

  const refreshUser = async () => {
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (authUser) {
      const { data: profile } = await supabase
        .from('users')
        .select(`
          id,
          email,
          name,
          avatar_url,
          role,
          org_id,
          is_approved,
          organizations(slug)
        `)
        .eq('auth_id', authUser.id)
        .single()

      if (profile) {
        const p = profile as {
          id: string
          email: string
          name: string
          avatar_url: string | null
          role: string
          org_id: string | null
          is_approved: boolean
          organizations: { slug: string } | null
        }

        // Enforce org subscription status again on manual refresh.
        const supabaseForEnforce = createClient()
        const { data: sub } = await supabaseForEnforce
          .from('org_subscriptions')
          .select('status')
          .eq('org_id', p.org_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const allowedStatuses = ['active', 'trialing']
        const isAllowed = !p.org_id || p.role === 'super_admin' || (sub && allowedStatuses.includes((sub as any).status))

        if (!isAllowed) {
          await supabaseForEnforce.auth.signOut()
          logoutStore()
          setUser(null)
          router.push('/login')
          return
        }

        const authUserData: AuthUser = {
          id: p.id,
          email: p.email,
          name: p.name,
          avatar_url: p.avatar_url,
          role: p.role as UserRole,
          org_id: p.org_id,
          org_slug: p.organizations?.slug || null,
          is_approved: p.is_approved,
        }
        setUser(authUserData)
      }
    }
  }

  const { isImpersonating } = useAuthStore()

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isSuperAdmin: user?.role === 'super_admin',
    isAdmin: user?.role === 'admin',
    isSales: user?.role === 'sales',
    isAccountant: user?.role === 'accountant',
    isImpersonating,
    logout,
    refreshUser,
  }
}

