'use client'

import { OrgProvider } from '@/contexts/org-context'

interface OrgProviderWrapperProps {
  children: React.ReactNode
  orgName: string
  orgCode: string
  orgSlug: string
}

export function OrgProviderWrapper({
  children,
  orgName,
  orgCode,
  orgSlug,
}: OrgProviderWrapperProps) {
  return (
    <OrgProvider orgName={orgName} orgCode={orgCode} orgSlug={orgSlug}>
      {children}
    </OrgProvider>
  )
}


