'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

// Redirect old /new route to platform selection
export default function NewIntegrationPage() {
  const params = useParams()
  const router = useRouter()
  const orgSlug = params.orgSlug as string

  useEffect(() => {
    // Redirect to main integrations page (platform selection)
    router.replace(`/${orgSlug}/integrations`)
  }, [orgSlug, router])

  return null
}

