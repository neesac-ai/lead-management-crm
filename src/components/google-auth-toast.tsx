'use client'

import { useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'

export function GoogleAuthToast() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const googleAuth = searchParams.get('google_auth')

  useEffect(() => {
    if (googleAuth) {
      // Show appropriate toast based on result
      switch (googleAuth) {
        case 'success':
          toast.success('Google Calendar connected successfully!')
          break
        case 'error':
          toast.error('Failed to connect Google Calendar. Please try again.')
          break
        case 'no_tokens':
          toast.error('Google did not provide necessary permissions. Please try again and allow all requested permissions.')
          break
        case 'save_error':
          toast.error('Failed to save Google credentials. Please try again.')
          break
        case 'missing_params':
          toast.error('Invalid Google authorization response.')
          break
      }

      // Remove the query param from URL
      const url = new URL(window.location.href)
      url.searchParams.delete('google_auth')
      router.replace(url.pathname)
    }
  }, [googleAuth, router])

  return null
}


