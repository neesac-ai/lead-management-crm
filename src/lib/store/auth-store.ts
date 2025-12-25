import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser } from '@/types'

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  isImpersonating: boolean
  originalUser: AuthUser | null
  setUser: (user: AuthUser | null) => void
  setLoading: (loading: boolean) => void
  startImpersonation: (targetUser: AuthUser) => void
  stopImpersonation: () => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: true,
      isImpersonating: false,
      originalUser: null,

      setUser: (user) => set({ user, isLoading: false }),
      
      setLoading: (isLoading) => set({ isLoading }),

      startImpersonation: (targetUser) => {
        const currentUser = get().user
        set({
          originalUser: currentUser,
          user: { ...targetUser, is_impersonating: true, impersonated_by: currentUser?.id },
          isImpersonating: true,
        })
      },

      stopImpersonation: () => {
        const originalUser = get().originalUser
        set({
          user: originalUser,
          originalUser: null,
          isImpersonating: false,
        })
      },

      logout: () => set({
        user: null,
        isLoading: false,
        isImpersonating: false,
        originalUser: null,
      }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        isImpersonating: state.isImpersonating,
        originalUser: state.originalUser,
      }),
    }
  )
)












