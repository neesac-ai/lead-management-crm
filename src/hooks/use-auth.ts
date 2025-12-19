'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/lib/store/auth-store'
import type { AuthUser, UserRole } from '@/types'

export function useAuth() {
  const router = useRouter()
  const { user, isLoading, setUser, setLoading, logout: logoutStore } = useAuthStore()

  useEffect(() => {
    const supabase = createClient()

    // Get initial session
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

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          logoutStore()
          router.push('/login')
        } else if (event === 'SIGNED_IN' && session?.user) {
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

