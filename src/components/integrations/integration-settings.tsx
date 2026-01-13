'use client'

import { useState, useEffect, Fragment, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Facebook,
  RefreshCw,
  ExternalLink
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LeadBackfillDialog } from './lead-backfill-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Integration = {
  id: string
  name: string
  platform: 'facebook' | 'whatsapp' | 'linkedin' | 'instagram'
  credentials: Record<string, unknown>
  config: Record<string, unknown>
  is_active: boolean
}

type LeadForm = {
  id: string
  name: string
  status?: string
  page?: { id: string; name: string }
  campaigns?: Array<{ id: string; name?: string }>
}

type SalesUser = { id: string; name: string; email: string }
type LeadFormAssignmentRow = {
  id: string
  form_id: string
  form_name: string
  assigned_to: string
  is_active: boolean
  assigned_user: { id: string; name: string; email: string } | null
}

interface IntegrationSettingsProps {
  integration: Integration
  onUpdate: () => void
}

export function IntegrationSettings({ integration, onUpdate }: IntegrationSettingsProps) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [selectedAdAccount, setSelectedAdAccount] = useState<string>('')
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([])
  const [adAccounts, setAdAccounts] = useState<Array<{
    id: string
    name: string
    account_id?: string
    business?: { id: string; name: string } | null
  }>>([])
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([])
  const [isFetchingCampaigns, setIsFetchingCampaigns] = useState(false)
  const [isRefreshingAdAccounts, setIsRefreshingAdAccounts] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showAdvancedCampaigns, setShowAdvancedCampaigns] = useState(false)
  const [facebookAppId, setFacebookAppId] = useState<string>('')
  const [facebookAppSecret, setFacebookAppSecret] = useState<string>('')
  const [isSavingCredentials, setIsSavingCredentials] = useState(false)
  // Displayed forms (depends on scope)
  const [forms, setForms] = useState<LeadForm[]>([])
  // Cached forms across all accessible Pages (recommended default cache)
  const [formsAll, setFormsAll] = useState<LeadForm[]>([])
  // Cached forms filtered per ad account (derived by scanning ad creatives)
  const [formsByAdAccount, setFormsByAdAccount] = useState<Record<string, LeadForm[]>>({})
  const [selectedForms, setSelectedForms] = useState<string[]>([])
  const [isFetchingForms, setIsFetchingForms] = useState(false)
  const [isSavingForms, setIsSavingForms] = useState(false)
  const [formsScope, setFormsScope] = useState<'ad_account' | 'all'>('ad_account')
  const [formsLastSyncedAll, setFormsLastSyncedAll] = useState<string | null>(null)
  const [formsLastSyncedByAdAccount, setFormsLastSyncedByAdAccount] = useState<Record<string, string>>({})
  const [salesUsers, setSalesUsers] = useState<SalesUser[]>([])
  const [isLoadingSalesUsers, setIsLoadingSalesUsers] = useState(false)
  const [selectedAssignee, setSelectedAssignee] = useState<string>('')
  const [isAssigning, setIsAssigning] = useState(false)
  const [assignmentsByFormId, setAssignmentsByFormId] = useState<Record<string, LeadFormAssignmentRow>>({})
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false)
  const [showAssignedForms, setShowAssignedForms] = useState(false)
  const [isBackfillOpen, setIsBackfillOpen] = useState(false)
  const [isCheckingLeadPresence, setIsCheckingLeadPresence] = useState(false)
  // In-memory per-scope selection cache (reliable across tab switches)
  const selectedFormsByScopeRef = useRef<Record<string, string[]>>({})

  // Per-scope lead presence cache (so tags persist per tab/ad-account)
  const [leadPresenceCache, setLeadPresenceCache] = useState<Record<string, {
    checked: boolean
    days: '7' | '30' | '90'
    withLeads: string[]
    hideNoLeads: boolean
  }>>({})

  const leadPresenceStorageKey = `metaLeadPresenceCache:${integration.id}`

  // Hydrate lead presence cache from sessionStorage (survives remounts/tab switching oddities)
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      const raw = window.sessionStorage.getItem(leadPresenceStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object') return
      setLeadPresenceCache(parsed as typeof leadPresenceCache)
    } catch {
      // ignore storage parse errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadPresenceStorageKey])

  const updateLeadPresenceCache = (
    updater: (prev: typeof leadPresenceCache) => typeof leadPresenceCache
  ) => {
    setLeadPresenceCache((prev) => {
      const next = updater(prev)
      try {
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(leadPresenceStorageKey, JSON.stringify(next))
        }
      } catch {
        // ignore storage write errors
      }
      return next
    })
  }

  const formsScopeKey =
    formsScope === 'ad_account'
      ? `ad_account:${selectedAdAccount || 'none'}`
      : 'all_pages'

  const formsScopeKeyRef = useRef(formsScopeKey)
  useEffect(() => {
    formsScopeKeyRef.current = formsScopeKey
  }, [formsScopeKey])

  const currentLeadPresence = leadPresenceCache[formsScopeKey] || {
    checked: false,
    days: '30' as const,
    withLeads: [] as string[],
    hideNoLeads: false,
  }

  const formsWithLeadsSet = useMemo(() => new Set(currentLeadPresence.withLeads || []), [currentLeadPresence.withLeads])

  const adAccountGroups = (() => {
    const groups = new Map<string, {
      key: string
      label: string
      accounts: Array<{
        id: string
        name: string
        account_id?: string
        business?: { id: string; name: string } | null
      }>
    }>()

    for (const account of adAccounts) {
      const businessName = account.business?.name?.trim()
      const label = businessName || 'Other assets'
      const key = businessName ? `business:${account.business?.id || businessName}` : 'other-assets'
      const existing = groups.get(key)
      if (existing) {
        existing.accounts.push(account)
      } else {
        groups.set(key, { key, label, accounts: [account] })
      }
    }

    const sorted = Array.from(groups.values()).sort((a, b) => {
      if (a.key === 'other-assets' && b.key !== 'other-assets') return 1
      if (b.key === 'other-assets' && a.key !== 'other-assets') return -1
      return a.label.localeCompare(b.label)
    })

    for (const g of sorted) {
      g.accounts.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    }

    return sorted
  })()

  useEffect(() => {
    // Load saved ad accounts and campaigns from config
    const config = integration.config || {}
    if (config.ad_accounts) {
      setAdAccounts(
        config.ad_accounts as Array<{
          id: string
          name: string
          account_id?: string
          business?: { id: string; name: string } | null
        }>
      )
    }
    if (config.available_campaigns) {
      setCampaigns(config.available_campaigns as Array<{ id: string; name: string }>)
    }
    const allForms = (config.available_forms_all || config.available_forms || []) as LeadForm[]
    setFormsAll(allForms)
    setFormsLastSyncedAll((config.forms_last_synced_at_all as string | undefined) || null)

    const byAdAccount = (config.available_forms_by_ad_account || {}) as Record<string, LeadForm[]>
    setFormsByAdAccount(byAdAccount)
    setFormsLastSyncedByAdAccount(
      (config.forms_last_synced_at_by_ad_account || {}) as Record<string, string>
    )
    if (config.ad_account_id) {
      setSelectedAdAccount(config.ad_account_id as string)
    }
    if (config.selected_campaigns) {
      setSelectedCampaigns(config.selected_campaigns as string[])
    }
    if (config.selected_forms) {
      setSelectedForms(config.selected_forms as string[])
    }
    // Load Facebook App credentials
    if (config.facebook_app_id) {
      setFacebookAppId(config.facebook_app_id as string)
    }
    if (config.facebook_app_secret) {
      setFacebookAppSecret(config.facebook_app_secret as string)
    }
  }, [integration])

  useEffect(() => {
    // Keep the forms list in sync with the selected scope + cached data.
    if (formsScope === 'ad_account') {
      if (!selectedAdAccount) {
        setForms([])
        return
      }
      setForms(formsByAdAccount[selectedAdAccount] || [])
      return
    }

    setForms(formsAll)
  }, [formsScope, selectedAdAccount, formsAll, formsByAdAccount])

  // Persist current scope values into refs (no async state races)
  useEffect(() => {
    const key = formsScopeKeyRef.current
    selectedFormsByScopeRef.current[key] = selectedForms
  }, [selectedForms])

  // Lead presence is stored in leadPresenceCache keyed by scope; no ref-sync needed.

  // Restore per-scope selection + lead presence when switching tab or ad account
  useEffect(() => {
    const cachedSelection = selectedFormsByScopeRef.current[formsScopeKey]
    setSelectedForms(Array.isArray(cachedSelection) ? cachedSelection : [])

    // lead presence is rendered from leadPresenceCache; no state restore needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formsScopeKey])

  // NOTE:
  // We intentionally do NOT auto-switch scope when an ad account is selected.
  // Users may explicitly choose "All Pages" and expect that list to remain visible.

  const fetchAssignments = async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent)
    if (!(integration.credentials?.access_token as string | undefined)) return
    setIsLoadingAssignments(true)
    try {
      const res = await fetch(`/api/integrations/${integration.id}/form-assignments`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to fetch lead assignments')
      }
      const data = await res.json() as { assignments?: LeadFormAssignmentRow[] }
      const map: Record<string, LeadFormAssignmentRow> = {}
      for (const a of data.assignments || []) {
        if (a?.form_id) map[a.form_id] = a
      }
      setAssignmentsByFormId(map)
    } catch (e) {
      console.error('Error fetching assignments:', e)
      if (!silent) toast.error(e instanceof Error ? e.message : 'Failed to load assignments')
      setAssignmentsByFormId({})
    } finally {
      setIsLoadingAssignments(false)
    }
  }

  const unassignLeadForm = async (formId: string) => {
    const assignment = assignmentsByFormId[formId]
    if (!assignment?.id) return
    try {
      const res = await fetch(`/api/integrations/${integration.id}/form-assignments/${assignment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.details || data?.error || 'Failed to unassign lead form')
      toast.success('Lead form unassigned')
      void fetchAssignments({ silent: true })
    } catch (e) {
      console.error('Error unassigning lead form:', e)
      toast.error(e instanceof Error ? e.message : 'Failed to unassign lead form')
    }
  }

  useEffect(() => {
    const loadSalesUsers = async () => {
      if (!(integration.credentials?.access_token as string | undefined)) return
      setIsLoadingSalesUsers(true)
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: profile } = await supabase
          .from('users')
          .select('org_id')
          .eq('auth_id', user.id)
          .single()
        if (!profile?.org_id) return

        const { data, error } = await supabase
          .from('users')
          .select('id, name, email')
          .eq('org_id', profile.org_id)
          .eq('role', 'sales')
          .eq('is_approved', true)
          .eq('is_active', true)
          .order('name')

        if (error) throw error
        setSalesUsers((data || []) as SalesUser[])
      } catch (e) {
        console.error('Error loading sales users:', e)
        setSalesUsers([])
      } finally {
        setIsLoadingSalesUsers(false)
      }
    }

    void loadSalesUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integration.id, integration.credentials?.access_token])

  useEffect(() => {
    // Keep assignments up to date when connected.
    void fetchAssignments({ silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integration.id, integration.credentials?.access_token])

  const fetchForms = async (opts?: { scope?: 'ad_account' | 'all'; silent?: boolean }) => {
    const scope = opts?.scope || formsScope
    const silent = Boolean(opts?.silent)

    if (scope === 'ad_account' && !selectedAdAccount) {
      if (!silent) toast.error('Select an Ad Account first')
      return
    }

    setIsFetchingForms(true)
    try {
      const qs = new URLSearchParams()
      const adAccountIdForScope = scope === 'ad_account' ? selectedAdAccount : ''
      if (scope === 'ad_account' && adAccountIdForScope) {
        qs.set('ad_account_id', adAccountIdForScope)
      }

      // When filtering by ad account, include campaign usage info so the UI can show "used in campaigns"
      // without requiring a separate campaigns fetch.
      if (scope === 'ad_account' && adAccountIdForScope) {
        qs.set('include_campaigns', '1')
      }

      const response = await fetch(
        `/api/integrations/${integration.id}/forms${qs.toString() ? `?${qs.toString()}` : ''}`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch lead forms')
      }

      const data = await response.json()
      const fetchedForms = (data.forms || []) as LeadForm[]

      // Persist caches without clobbering the "all" cache when fetching per ad account.
      const nextConfig: Record<string, unknown> = {
        ...integration.config,
      }

      const nowIso = new Date().toISOString()

      if (scope === 'ad_account' && adAccountIdForScope) {
        const nextMap = {
          // IMPORTANT: merge from current state, not from integration.config (which can be stale),
          // otherwise switching accounts + fetching can wipe previously cached forms.
          ...formsByAdAccount,
          [adAccountIdForScope]: fetchedForms,
        }
        const nextTs = {
          ...formsLastSyncedByAdAccount,
          [adAccountIdForScope]: nowIso,
        }
        nextConfig.available_forms_by_ad_account = nextMap
        nextConfig.forms_last_synced_at_by_ad_account = nextTs
        // Also store "last fetched forms" for other screens (like assignments) to reuse without another fetch.
        nextConfig.available_forms = fetchedForms
        nextConfig.available_forms_last_scope = 'ad_account'
        nextConfig.available_forms_last_ad_account_id = adAccountIdForScope
        setFormsByAdAccount(nextMap)
        setFormsLastSyncedByAdAccount(nextTs)
      } else {
        nextConfig.available_forms_all = fetchedForms
        // Backwards-compatible alias used in other parts of UI
        nextConfig.available_forms = fetchedForms
        nextConfig.forms_last_synced_at_all = nowIso
        nextConfig.available_forms_last_scope = 'all'
        nextConfig.available_forms_last_ad_account_id = null
        setFormsAll(fetchedForms)
        setFormsLastSyncedAll(nowIso)
      }

      // Save to config
      await fetch(`/api/integrations/${integration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: nextConfig }),
      })

      if (data.ad_account_filter_warning && !silent) {
        toast.message('Lead forms filter', { description: data.ad_account_filter_warning })
      }

      const total = data.pages_total as number | undefined
      const failed = data.pages_failed as number | undefined
      const formsCount = fetchedForms.length

      if (!silent) {
        if (failed && failed > 0) {
          toast.warning(
            `Found ${formsCount} lead forms. ${failed}/${total || '?'} pages could not be read (permissions).`
          )
        } else {
          toast.success(`Found ${formsCount} lead forms`)
        }
      }

      // Refresh assignments so "Assigned vs Unassigned" is accurate for the just-fetched forms.
      void fetchAssignments({ silent: true })
    } catch (error) {
      console.error('Error fetching lead forms:', error)
      if (!silent) {
        toast.error(error instanceof Error ? error.message : 'Failed to fetch lead forms')
      }
    } finally {
      setIsFetchingForms(false)
    }
  }

  // NOTE: We intentionally do NOT auto-fetch forms after connect or on ad account change.
  // Fetching forms can be slow for users with many Pages/forms, so we keep it user-triggered.

  const handleSaveAppCredentials = async () => {
    if (!facebookAppId || !facebookAppSecret) {
      toast.error('Please enter both App ID and App Secret')
      return
    }

    setIsSavingCredentials(true)
    try {
      const response = await fetch(`/api/integrations/${integration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            ...integration.config,
            facebook_app_id: facebookAppId,
            facebook_app_secret: facebookAppSecret,
          },
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save credentials')
      }

      toast.success('Facebook App credentials saved')
      onUpdate()
    } catch (error) {
      console.error('Error saving credentials:', error)
      toast.error('Failed to save credentials')
    } finally {
      setIsSavingCredentials(false)
    }
  }

  const handleConnectFacebook = async () => {
    // Check if App ID and Secret are configured
    const config = integration.config || {}
    const appId = config.facebook_app_id as string
    const appSecret = config.facebook_app_secret as string

    if (!appId || !appSecret) {
      toast.error('Please configure Facebook App ID and App Secret first')
      return
    }

    setIsConnecting(true)
    try {
      // Redirect to OAuth initiation
      window.location.href = `/api/integrations/${integration.id}/oauth`
    } catch (error) {
      console.error('Error initiating OAuth:', error)
      toast.error('Failed to connect to Facebook')
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Facebook? This will remove all credentials.')) {
      return
    }

    try {
      const response = await fetch(`/api/integrations/${integration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentials: {},
          config: {
            ad_account_id: null,
            selected_campaigns: [],
            available_campaigns: [],
            ad_accounts: [],
          },
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to disconnect')
      }

      toast.success('Facebook disconnected successfully')
      onUpdate()
    } catch (error) {
      console.error('Error disconnecting:', error)
      toast.error('Failed to disconnect Facebook')
    }
  }

  const handleRefreshAdAccounts = async () => {
    setIsRefreshingAdAccounts(true)
    try {
      const response = await fetch(`/api/integrations/${integration.id}/ad-accounts`)
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to refresh ad accounts')
      }
      const data = await response.json()
      setAdAccounts(data.ad_accounts || [])
      if (data.selected_ad_account_id) {
        setSelectedAdAccount(data.selected_ad_account_id)
      }
      toast.success(`Refreshed ${data.ad_accounts?.length || 0} ad accounts`)
      onUpdate()
    } catch (error) {
      console.error('Error refreshing ad accounts:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to refresh ad accounts')
    } finally {
      setIsRefreshingAdAccounts(false)
    }
  }

  const handleFetchCampaigns = async () => {
    if (!selectedAdAccount) {
      toast.error('Please select an ad account first')
      return
    }

    setIsFetchingCampaigns(true)
    try {
      const response = await fetch(
        `/api/integrations/${integration.id}/campaigns?ad_account_id=${encodeURIComponent(selectedAdAccount)}`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch campaigns')
      }

      const data = await response.json()
      setCampaigns(data.campaigns || [])
      // Changing ad account invalidates previous selection
      setSelectedCampaigns([])

      // Save to config
      await fetch(`/api/integrations/${integration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            ...integration.config,
            ad_account_id: selectedAdAccount,
            available_campaigns: data.campaigns,
          },
        }),
      })

      toast.success(`Found ${data.campaigns?.length || 0} campaigns`)
    } catch (error) {
      console.error('Error fetching campaigns:', error)
      toast.error('Failed to fetch campaigns')
    } finally {
      setIsFetchingCampaigns(false)
    }
  }

  const persistSelectedForms = async (nextSelected: string[]) => {
    // IMPORTANT:
    // /api/integrations/[id] PATCH replaces the whole config object.
    // If we send a stale integration.config here, we can accidentally wipe cached forms.
    // So we always re-include the latest cached form state from React state.
    setIsSavingForms(true)
    try {
      const nextConfig: Record<string, unknown> = {
        ...integration.config,
        // preserve caches
        available_forms_all: formsAll,
        forms_last_synced_at_all: formsLastSyncedAll,
        available_forms_by_ad_account: formsByAdAccount,
        forms_last_synced_at_by_ad_account: formsLastSyncedByAdAccount,
        // preserve selection context
        ad_account_id: selectedAdAccount || (integration.config?.ad_account_id as string | undefined) || null,
        // last fetched forms (used by other screens)
        available_forms: forms,
        // selection
        selected_forms: nextSelected,
      }

      const response = await fetch(`/api/integrations/${integration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: nextConfig }),
      })

      if (!response.ok) throw new Error('Failed to persist selected forms')
      // No toast + no onUpdate here: persisting selection should not "refresh" the page.
    } catch (error) {
      console.error('Error persisting selected forms:', error)
      toast.error('Failed to save selection')
    } finally {
      setIsSavingForms(false)
    }
  }

  const getFormNameById = (formId: string): string => {
    const fromCurrent = forms.find((f) => f.id === formId)?.name
    if (fromCurrent) return fromCurrent
    const fromAll = formsAll.find((f) => f.id === formId)?.name
    if (fromAll) return fromAll
    const fromAny = Object.values(formsByAdAccount)
      .flat()
      .find((f) => f.id === formId)?.name
    return fromAny || formId
  }

  const handleAssignSelectedForms = async () => {
    if (!selectedAssignee) {
      toast.error('Select a sales rep to assign')
      return
    }
    if (selectedForms.length === 0) return

    setIsAssigning(true)
    try {
      // Upsert per form (API already uses onConflict org_id,integration_id,form_id)
      for (const formId of selectedForms) {
        const res = await fetch(`/api/integrations/${integration.id}/form-assignments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            form_id: formId,
            form_name: getFormNameById(formId),
            assigned_to: selectedAssignee,
            is_active: true,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.error || 'Failed to assign forms')
        }
      }

      toast.success(`Assigned ${selectedForms.length} form${selectedForms.length > 1 ? 's' : ''}`)
      setSelectedAssignee('')
      // Clear selection after assignment (optional but reduces confusion)
      setSelectedForms([])
      // Persist empty selection once (not on every click)
      void persistSelectedForms([])
      // Refresh assignments so UI reflects the change immediately
      void fetchAssignments({ silent: true })
    } catch (e) {
      console.error('Error assigning forms:', e)
      toast.error(e instanceof Error ? e.message : 'Failed to assign forms')
    } finally {
      setIsAssigning(false)
    }
  }

  const checkLeadPresenceForCurrentList = async () => {
    if (forms.length === 0) {
      toast.message('No forms loaded yet')
      return
    }
    setIsCheckingLeadPresence(true)
    try {
      const days = currentLeadPresence.days || '30'
      const res = await fetch(`/api/integrations/${integration.id}/forms/lead-presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_ids: forms.map((f) => f.id),
          backfill_days: Number(days),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.details || data?.error || 'Failed to check lead presence')

      const withLeads = Array.isArray(data.with_leads) ? (data.with_leads as string[]) : []
      updateLeadPresenceCache((prev) => ({
        ...prev,
        [formsScopeKey]: {
          checked: true,
          days: days as '7' | '30' | '90',
          withLeads,
          hideNoLeads: prev[formsScopeKey]?.hideNoLeads || false,
        },
      }))
      toast.success(`Forms with leads: ${withLeads.length}/${forms.length}`)
      if (withLeads.length === 0) {
        toast.message('No forms have leads in this time window. Try 90 days or check a different ad account.')
      }
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Failed to check lead presence')
    } finally {
      setIsCheckingLeadPresence(false)
    }
  }

  const handleSaveCampaignSelection = async () => {
    setIsSaving(true)
    try {
      const response = await fetch(`/api/integrations/${integration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            ...integration.config,
            ad_account_id: selectedAdAccount,
            selected_campaigns: selectedCampaigns,
          },
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save campaign selection')
      }

      toast.success('Campaign selection saved')
      onUpdate()
    } catch (error) {
      console.error('Error saving campaigns:', error)
      toast.error('Failed to save campaign selection')
    } finally {
      setIsSaving(false)
    }
  }

  const isConnected = !!(integration.credentials?.access_token as string)
  const tokenExpiresAt = integration.credentials?.token_expires_at as string | undefined

  // Check if credentials are already saved (match current config)
  const config = integration.config || {}
  const savedAppId = config.facebook_app_id as string
  const savedAppSecret = config.facebook_app_secret as string
  const credentialsMatchSaved =
    facebookAppId === savedAppId &&
    facebookAppSecret === savedAppSecret &&
    facebookAppId !== '' &&
    facebookAppSecret !== ''

  // Only show Meta OAuth UI for Facebook/Instagram platforms
  if (integration.platform !== 'facebook' && integration.platform !== 'instagram') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Configuration for {integration.platform} integration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              Manual configuration for {integration.platform} is not yet available. Please use the API directly.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Meta (Facebook/Instagram) App Credentials */}
      <Card>
        <CardHeader>
          <CardTitle>Meta App Credentials</CardTitle>
          <CardDescription>
            Enter your Meta App ID and App Secret. These are required before connecting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="facebookAppId">Facebook App ID *</Label>
            <Input
              id="facebookAppId"
              type="text"
              value={facebookAppId}
              onChange={(e) => setFacebookAppId(e.target.value)}
              placeholder="Enter your Facebook App ID"
            />
            <p className="text-xs text-muted-foreground">
              Found in Meta App Dashboard → Settings → Basic → App ID
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="facebookAppSecret">Facebook App Secret *</Label>
            <Input
              id="facebookAppSecret"
              type="password"
              value={facebookAppSecret}
              onChange={(e) => setFacebookAppSecret(e.target.value)}
              placeholder="Enter your Facebook App Secret"
            />
            <p className="text-xs text-muted-foreground">
              Found in Meta App Dashboard → Settings → Basic → App Secret (click "Show")
            </p>
          </div>

          {credentialsMatchSaved && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>Credentials saved</span>
            </div>
          )}
          <Button
            onClick={handleSaveAppCredentials}
            disabled={isSavingCredentials || !facebookAppId || !facebookAppSecret || credentialsMatchSaved}
            className="w-full"
            variant={credentialsMatchSaved ? "outline" : "default"}
          >
            {isSavingCredentials ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : credentialsMatchSaved ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Credentials Saved
              </>
            ) : (
              'Save App Credentials'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle>{integration.platform === 'instagram' ? 'Instagram' : 'Facebook'} Connection</CardTitle>
          <CardDescription>
            Connect your Meta account to automatically sync leads
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConnected ? (
            <div className="space-y-4">
              <Alert>
                <Facebook className="h-4 w-4" />
                <AlertTitle>Not Connected</AlertTitle>
                <AlertDescription>
                  {facebookAppId && facebookAppSecret ? (
                    <>Click the button below to connect your account. You'll be redirected to authorize access.</>
                  ) : (
                    <>Please configure Facebook App ID and App Secret above before connecting.</>
                  )}
                </AlertDescription>
              </Alert>
              <Button
                onClick={handleConnectFacebook}
                disabled={isConnecting || !facebookAppId || !facebookAppSecret}
                className="w-full"
                size="lg"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Facebook className="w-4 h-4 mr-2" />
                    Connect Account
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <div>
                    <div className="font-medium">Connected</div>
                    {tokenExpiresAt && (
                      <div className="text-sm text-muted-foreground">
                        Token expires: {new Date(tokenExpiresAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleDisconnect}>
                  Disconnect
                </Button>
              </div>

              {/* Ad Account Selection */}
                <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Select ad account to fetch the leads from</label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshAdAccounts}
                    disabled={isRefreshingAdAccounts}
                    title="Refresh ad accounts from Meta (may take a few seconds)"
                  >
                    {isRefreshingAdAccounts ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Refreshing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                      </>
                    )}
                  </Button>
                </div>
                {adAccounts.length > 0 ? (
                  <Select
                    value={selectedAdAccount}
                    onValueChange={(value) => {
                      // Persist selection before switching ad account (prevents losing selection)
                      const key = formsScopeKeyRef.current
                      selectedFormsByScopeRef.current[key] = selectedForms

                      setSelectedAdAccount(value)
                      // Clear stale campaigns when switching accounts
                      setCampaigns([])
                      setSelectedCampaigns([])
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select ad account" />
                    </SelectTrigger>
                    <SelectContent>
                      {adAccountGroups.map((group, idx) => (
                        <Fragment key={group.key}>
                          {idx > 0 && <SelectSeparator />}
                          <SelectGroup>
                            <SelectLabel className="font-semibold text-foreground">
                              {group.label}
                            </SelectLabel>
                            {group.accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name} ({account.account_id || account.id})
                        </SelectItem>
                            ))}
                          </SelectGroup>
                        </Fragment>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    No ad accounts loaded yet. Click “Refresh”.
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Select the ad account, then click <strong>Fetch Lead Forms</strong> below.
                </p>
              </div>

              {/* Lead Forms (Instant Forms) */}
              <div className="space-y-2">
                <Tabs
                  value={formsScope}
                  onValueChange={(v) => {
                    // Persist selection before switching tabs (prevents losing selection)
                    const key = formsScopeKeyRef.current
                    selectedFormsByScopeRef.current[key] = selectedForms

                    const next = v as 'ad_account' | 'all'
                    setFormsScope(next)
                    // Keep per-scope state (selection + lead presence) via caches; do not wipe on switch.
                    setSelectedAssignee('')
                  }}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <TabsList className="w-full sm:w-auto">
                      <TabsTrigger value="ad_account">Ad Account Forms</TabsTrigger>
                      <TabsTrigger value="all">All Pages Forms</TabsTrigger>
                    </TabsList>

                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground">
                        {formsScope === 'ad_account' ? (
                          selectedAdAccount ? (
                            <>
                              {formsLastSyncedByAdAccount[selectedAdAccount]
                                ? `Last fetched: ${new Date(formsLastSyncedByAdAccount[selectedAdAccount]).toLocaleString()}`
                                : 'Not fetched yet for this ad account'}
                            </>
                          ) : (
                            'Select an ad account to view/fetch its forms'
                          )
                        ) : (
                          <>
                            {formsLastSyncedAll
                              ? `Last fetched: ${new Date(formsLastSyncedAll).toLocaleString()}`
                              : 'Not fetched yet for all pages'}
                          </>
                        )}
                      </div>

                  <Button
                        variant={formsScope === 'ad_account' ? (selectedAdAccount ? 'default' : 'outline') : 'outline'}
                    size="sm"
                        onClick={() => fetchForms({ scope: formsScope })}
                        disabled={isFetchingForms || (formsScope === 'ad_account' && !selectedAdAccount)}
                        title={
                          formsScope === 'ad_account'
                            ? 'Fetch lead forms linked with the selected Ad Account'
                            : 'Fetch all lead forms accessible via your Pages'
                        }
                      >
                        {isFetchingForms ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Fetching...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                            Fetch Lead Forms
                      </>
                    )}
                  </Button>
                </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-muted-foreground">
                      Tip: Click <strong>Find forms with leads</strong> to avoid testing 0-lead forms.
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xs text-muted-foreground">Check leads in</div>
                      <Select
                        value={currentLeadPresence.days}
                        onValueChange={(v) =>
                          updateLeadPresenceCache((prev) => ({
                            ...prev,
                            [formsScopeKey]: {
                              checked: prev[formsScopeKey]?.checked || false,
                              days: v as '7' | '30' | '90',
                              withLeads: prev[formsScopeKey]?.withLeads || [],
                              hideNoLeads: prev[formsScopeKey]?.hideNoLeads || false,
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="h-8 w-[150px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7">Last 7 days</SelectItem>
                          <SelectItem value="30">Last 30 days</SelectItem>
                          <SelectItem value="90">Last 90 days</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={checkLeadPresenceForCurrentList}
                        disabled={isCheckingLeadPresence || forms.length === 0}
                      >
                        {isCheckingLeadPresence ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Checking…
                          </>
                        ) : (
                          'Find forms with leads'
                        )}
                      </Button>
                      <div className="flex items-center gap-2 pl-1">
                        <Checkbox
                          id="hide-no-leads"
                          checked={currentLeadPresence.hideNoLeads}
                          disabled={!currentLeadPresence.checked}
                          onCheckedChange={(v) =>
                            updateLeadPresenceCache((prev) => ({
                              ...prev,
                              [formsScopeKey]: {
                                checked: prev[formsScopeKey]?.checked || false,
                                days: prev[formsScopeKey]?.days || '30',
                                withLeads: prev[formsScopeKey]?.withLeads || [],
                                hideNoLeads: Boolean(v),
                              },
                            }))
                          }
                        />
                        <label htmlFor="hide-no-leads" className="text-xs cursor-pointer text-muted-foreground">
                          Show only forms with leads
                        </label>
                      </div>
                    </div>
                  </div>

                  <TabsContent value="ad_account">
                    <div className="text-sm font-medium">Lead Forms (Instant Forms)</div>
                  </TabsContent>
                  <TabsContent value="all">
                    <div className="text-sm font-medium">Lead Forms (Instant Forms)</div>
                  </TabsContent>
                </Tabs>

                {forms.length > 0 ? (
                  <div className="space-y-2">
                    <div className="space-y-2 max-h-60 overflow-y-auto border rounded-lg p-3">
                      {(() => {
                        const isAssigned = (formId: string) => {
                          const a = assignmentsByFormId[formId]
                          return Boolean(a && a.is_active && a.assigned_to)
                        }

                        const visible = currentLeadPresence.hideNoLeads && currentLeadPresence.checked
                          ? forms.filter((f) => formsWithLeadsSet.has(f.id))
                          : forms

                        const unassigned = visible.filter((f) => !isAssigned(f.id))
                        const assigned = visible.filter((f) => isAssigned(f.id))

                        const rows = [
                          ...unassigned.map((f) => ({ form: f, bucket: 'unassigned' as const })),
                          ...(showAssignedForms ? assigned.map((f) => ({ form: f, bucket: 'assigned' as const })) : []),
                        ]

                        return rows.map(({ form, bucket }, idx) => {
                          const assignment = assignmentsByFormId[form.id]
                          const assignedUser = assignment?.assigned_user
                          const isAssignedActive = Boolean(assignment && assignment.is_active && assignment.assigned_to)

                          const showHeader =
                            (idx === 0 && bucket === 'unassigned') ||
                            (idx === unassigned.length && bucket === 'assigned')

                          return (
                            <div key={form.id} className="space-y-1">
                              {showHeader && (
                                <div className="text-xs font-medium text-muted-foreground pt-2">
                                  {bucket === 'unassigned'
                                    ? `Unassigned (${unassigned.length})`
                                    : `Assigned (${assigned.length})`}
                                </div>
                              )}

                              <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`form-${form.id}`}
                            checked={selectedForms.includes(form.id)}
                            disabled={isAssigning}
                            onCheckedChange={(checked) => {
                              const nextSelected = checked
                                ? Array.from(new Set([...selectedForms, form.id]))
                                : selectedForms.filter(id => id !== form.id)
                              setSelectedForms(nextSelected)

                              if (checked) {
                                try {
                                  document.getElementById('lead-assignments-inline')?.scrollIntoView({ behavior: 'smooth' })
                                } catch {
                                  // ignore
                                }
                              }
                            }}
                          />
                          <label htmlFor={`form-${form.id}`} className="cursor-pointer flex-1">
                            <div className="flex items-center gap-2">
                              <div className="text-sm">{form.name}</div>
                              {form.status && (
                                <Badge variant={form.status === 'ACTIVE' ? 'default' : 'secondary'}>
                                  {form.status}
                                </Badge>
                              )}
                              {currentLeadPresence.checked && (
                                formsWithLeadsSet.has(form.id) ? (
                                  <Badge variant="default">Has leads</Badge>
                                ) : (
                                  <Badge variant="secondary">No leads</Badge>
                                )
                              )}
                              {isAssignedActive && assignedUser?.name && (
                                <Badge variant="outline">
                                  Assigned to {assignedUser.name}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <span>Form ID: {form.id}</span>
                              {form.page?.name && <span> • Page: {form.page.name}</span>}
                              {Array.isArray(form.campaigns) && (
                                <span>
                                  {' '}
                                  • Campaigns: {form.campaigns.length}
                                  {form.campaigns.length > 0 ? ` (e.g. ${form.campaigns[0]?.name || form.campaigns[0]?.id})` : ''}
                                </span>
                              )}
                            </div>
                          </label>
                          {isAssignedActive && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                void unassignLeadForm(form.id)
                              }}
                            >
                              Unassign
                            </Button>
                          )}
                              </div>
                            </div>
                          )
                        })
                      })()}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <p className="text-muted-foreground">
                        {selectedForms.length > 0 ? (
                          <span>{selectedForms.length} form{selectedForms.length > 1 ? 's' : ''} selected. Check a form to assign it to a sales rep.</span>
                        ) : (
                          <span>Select forms to assign them to sales reps.</span>
                        )}
                      </p>
                      {/* All Pages is handled by the tab above */}
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div className="text-muted-foreground">
                        {isLoadingAssignments ? 'Updating assignments…' : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto py-0 text-xs"
                          onClick={() => setShowAssignedForms((v) => !v)}
                        >
                          {showAssignedForms ? 'Hide assigned' : 'Show assigned'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (selectedForms.length === 0) {
                              toast.error('Select one or more lead forms first')
                              return
                            }
                            setIsBackfillOpen(true)
                          }}
                          title="Fetch older leads for the selected forms"
                        >
                          Fetch Leads
                        </Button>
                      </div>
                    </div>

                    {selectedForms.length > 0 && (
                      <div id="lead-assignments-inline" className="mt-3 rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium">
                            Assign {selectedForms.length} selected form{selectedForms.length > 1 ? 's' : ''} to:
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedForms([])
                            }}
                            disabled={isAssigning}
                          >
                            Clear selection
                          </Button>
                        </div>

                        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                          <Select value={selectedAssignee} onValueChange={setSelectedAssignee}>
                            <SelectTrigger className="w-full sm:w-[320px]">
                              <SelectValue placeholder={isLoadingSalesUsers ? 'Loading sales team...' : 'Select sales rep'} />
                            </SelectTrigger>
                            <SelectContent>
                              {salesUsers.map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.name} ({u.email})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Button
                            type="button"
                            onClick={handleAssignSelectedForms}
                            disabled={!selectedAssignee || isAssigning}
                          >
                            {isAssigning ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Assigning...
                              </>
                            ) : (
                              'Assign'
                            )}
                          </Button>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          This will create/update lead form assignments for each selected form.
                        </p>
                      </div>
                    )}

                    <LeadBackfillDialog
                      open={isBackfillOpen}
                      onOpenChange={setIsBackfillOpen}
                      integrationId={integration.id}
                      selectedFormIds={selectedForms}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {formsScope === 'ad_account'
                        ? (selectedAdAccount ? 'Click "Fetch Lead Forms" to load forms for the selected Ad Account.' : 'Select an Ad Account and click "Fetch Lead Forms".')
                        : 'Click "Fetch Lead Forms" to load all accessible Page forms.'}
                    </p>
                    {/* All Pages is handled by the tab above */}
                  </div>
                )}
              </div>

              {/* Campaign Selection */}
              {(campaigns.length > 0 || showAdvancedCampaigns) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Campaigns (Advanced)</label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAdvancedCampaigns((v) => !v)}
                    >
                      {showAdvancedCampaigns ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                  {showAdvancedCampaigns ? (
                    campaigns.length > 0 ? (
                      <>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            Optional: useful for reporting/legacy routing. Phase 1 routing is form-based.
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleFetchCampaigns}
                            disabled={!selectedAdAccount || isFetchingCampaigns}
                          >
                            {isFetchingCampaigns ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Fetching...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Refresh Campaigns
                              </>
                            )}
                          </Button>
                        </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto border rounded-lg p-3">
                    {campaigns.map((campaign) => (
                      <div key={campaign.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`campaign-${campaign.id}`}
                          checked={selectedCampaigns.includes(campaign.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedCampaigns([...selectedCampaigns, campaign.id])
                            } else {
                              setSelectedCampaigns(selectedCampaigns.filter(id => id !== campaign.id))
                            }
                          }}
                        />
                        <label
                          htmlFor={`campaign-${campaign.id}`}
                          className="text-sm cursor-pointer flex-1"
                        >
                          {campaign.name}
                        </label>
                      </div>
                    ))}
                  </div>
                  <Button
                    onClick={handleSaveCampaignSelection}
                    disabled={selectedCampaigns.length === 0 || isSaving}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      `Save Campaign Selection (${selectedCampaigns.length} selected)`
                    )}
                  </Button>
                      </>
                    ) : (
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          Load campaigns for the selected ad account (optional).
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleFetchCampaigns}
                          disabled={!selectedAdAccount || isFetchingCampaigns}
                        >
                          {isFetchingCampaigns ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Fetching...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Fetch Campaigns
                            </>
                          )}
                        </Button>
                      </div>
                    )
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Not needed for Phase 1 lead routing. Keep this hidden unless you want campaign-level sync/reporting.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


