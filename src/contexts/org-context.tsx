'use client'

import { createContext, useContext } from 'react'

interface OrgContextType {
  orgName: string
  orgCode: string
  orgSlug: string
}

const OrgContext = createContext<OrgContextType | null>(null)

export function OrgProvider({
  children,
  orgName,
  orgCode,
  orgSlug,
}: {
  children: React.ReactNode
  orgName: string
  orgCode: string
  orgSlug: string
}) {
  return (
    <OrgContext.Provider value={{ orgName, orgCode, orgSlug }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  const context = useContext(OrgContext)
  return context
}

