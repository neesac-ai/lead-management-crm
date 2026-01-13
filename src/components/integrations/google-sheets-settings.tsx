'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Integration = {
  id: string
  platform: 'google_sheets'
  credentials?: Record<string, unknown> | null
  config?: Record<string, unknown> | null
}

type ColumnMapping = {
  phone?: string
  name?: string
  email?: string
  company?: string
  source?: string
}

const columnFields: Array<keyof ColumnMapping> = ['phone', 'name', 'email', 'company', 'source']

type SaveOptions = {
  suppressToast?: boolean
}

type SalesPerson = {
  id: string
  name: string
  email: string
}

type PreviewRow = {
  rowNumber: number
  cells: Record<string, string>
}

function storageKey(integrationId: string, key: string) {
  return `gsheets:${integrationId}:${key}`
}

function safeSessionGet<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function safeSessionSet(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

export function GoogleSheetsSettings({
  integration,
  onUpdate,
}: {
  integration: Integration
  onUpdate: () => void
}) {
  const existingConfig = (integration.config || {}) as Record<string, unknown>
  const existingMapping = (existingConfig.column_mapping || {}) as ColumnMapping
  const savedSheetAssignee = (existingConfig.sheet_assigned_to as string | undefined) || ''

  const [sheetUrl, setSheetUrl] = useState(String(existingConfig.sheet_url || ''))
  const [tabName, setTabName] = useState(String(existingConfig.sheet_tab_name || ''))

  const [isSaving, setIsSaving] = useState(false)
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [salesTeam, setSalesTeam] = useState<SalesPerson[]>([])
  const [sheetAssignee, setSheetAssignee] = useState<string>(savedSheetAssignee) // '' means None (unassigned)
  const [isAssigningSheet, setIsAssigningSheet] = useState(false)
  const [manualHeadersText, setManualHeadersText] = useState<string>(
    Array.isArray((existingConfig as any).manual_headers) ? ((existingConfig as any).manual_headers as string[]).join(', ') : ''
  )

  const [mapping, setMapping] = useState<ColumnMapping>({
    phone: existingMapping.phone,
    name: existingMapping.name,
    email: existingMapping.email,
    company: existingMapping.company,
    source: existingMapping.source,
  })

  useEffect(() => {
    const config = (integration.config || {}) as Record<string, unknown>
    const mappingValues = (config.column_mapping || {}) as ColumnMapping
    setSheetUrl(String(config.sheet_url || ''))
    setTabName(String(config.sheet_tab_name || ''))
    setSheetAssignee(String((config.sheet_assigned_to as string | undefined) || ''))
    setManualHeadersText(
      Array.isArray((config as any).manual_headers) ? ((config as any).manual_headers as string[]).join(', ') : ''
    )
    setMapping({
      phone: mappingValues.phone,
      name: mappingValues.name,
      email: mappingValues.email,
      company: mappingValues.company,
      source: mappingValues.source,
    })
  }, [integration.id, integration.config])

  // Hydrate persisted UI state (preview headers/rows) across tab switches.
  useEffect(() => {
    const cachedPreviewHeaders = safeSessionGet<string[]>(storageKey(integration.id, 'preview_headers'))
    if (cachedPreviewHeaders && Array.isArray(cachedPreviewHeaders)) {
      setPreviewHeaders(cachedPreviewHeaders)
    }

    const cachedPreviewRows = safeSessionGet<PreviewRow[]>(storageKey(integration.id, 'preview_rows'))
    if (cachedPreviewRows && Array.isArray(cachedPreviewRows)) {
      setPreviewRows(cachedPreviewRows)
    }
  }, [integration.id])

  // Note: no row-selection persistence needed anymore (single sheet-level assignment flow)

  const trimmedSheetUrl = sheetUrl.trim()
  const trimmedTabName = tabName.trim()
  const savedSheetUrl = String(existingConfig.sheet_url || '').trim()
  const savedTabName = String(existingConfig.sheet_tab_name || '').trim()
  const mappingChanged = columnFields.some((key) => mapping[key] !== existingMapping[key])
  const hasUnsavedChanges =
    trimmedSheetUrl !== savedSheetUrl ||
    trimmedTabName !== savedTabName ||
    mappingChanged
  const shouldResetCursor = Boolean(
    (savedSheetUrl && savedSheetUrl !== trimmedSheetUrl) ||
      (savedTabName && savedTabName !== trimmedTabName)
  )
  const isSaveDisabled = isSaving || !hasUnsavedChanges

  const isConnected = useMemo(() => {
    const creds = (integration.credentials || {}) as Record<string, unknown>
    return Boolean(creds.refresh_token || creds.access_token)
  }, [integration.credentials])

  const connectUrl = `/api/integrations/${integration.id}/google-sheets/oauth`

  const savedAssignee = String((existingConfig.sheet_assigned_to as string | undefined) || '')
  const assignmentChanged = sheetAssignee !== savedAssignee
  const isAssignDisabled = isAssigningSheet || !mapping.phone || (!assignmentChanged && !hasUnsavedChanges)

  const persistConfig = async (options: SaveOptions = {}) => {
    if (!trimmedSheetUrl || !trimmedTabName) {
      toast.error('Sheet URL and Tab Name are required')
      return false
    }

    setIsSaving(true)
    try {
      const updatedConfig = {
        ...(integration.config || {}),
        sheet_url: trimmedSheetUrl,
        sheet_tab_name: trimmedTabName,
        column_mapping: mapping,
      } as Record<string, unknown>

      if (shouldResetCursor) {
        delete updatedConfig.cursor_last_row
      }

      const response = await fetch(`/api/integrations/${integration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: updatedConfig,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save settings')
      }

      if (!options.suppressToast) {
        toast.success('Google Sheets settings saved')
      }

      onUpdate()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings')
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const previewSheet = async () => {
    setIsPreviewing(true)
    try {
      const response = await fetch(`/api/integrations/${integration.id}/google-sheets/preview?max_rows=500`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Failed to preview sheet')
      }

      const nextHeaders = Array.isArray(data.headers) ? (data.headers as string[]) : []
      const nextRows = Array.isArray(data.rows) ? (data.rows as PreviewRow[]) : []

      setPreviewHeaders(nextHeaders)
      setPreviewRows(nextRows)
      safeSessionSet(storageKey(integration.id, 'preview_headers'), nextHeaders)
      safeSessionSet(storageKey(integration.id, 'preview_rows'), nextRows)

      if (nextHeaders.length === 0) {
        const cfg = (integration.config || {}) as any
        const manual = Array.isArray(cfg.manual_headers) ? (cfg.manual_headers as string[]) : []
        if (manual.length > 0) {
          setPreviewHeaders(manual)
          safeSessionSet(storageKey(integration.id, 'preview_headers'), manual)
          toast.success('Sheet has no headers yet. Using your manually entered headers for mapping.')
        } else {
          toast.error('No headers found. Add headers in Row 1 of your sheet, or use Manual Header Input below.')
        }
      } else {
        toast.success(`Fetched ${nextRows.length} rows`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to preview sheet')
    } finally {
      setIsPreviewing(false)
    }
  }

  const fetchLeadsWithAssignment = async () => {
    setIsAssigningSheet(true)
    try {
      // Persist ALL current settings + mapping + assignment in a single PATCH.
      // IMPORTANT: Avoid a second PATCH with stale integration.config, which can wipe column_mapping
      // and cause GoogleSheetsIntegration.fetchLeads() to return 0 rows (phone column not found).
      const nextConfig = {
        ...(integration.config || {}),
        sheet_url: trimmedSheetUrl,
        sheet_tab_name: trimmedTabName,
        column_mapping: mapping,
        sheet_assigned_to: sheetAssignee || null,
        manual_headers: manualHeadersText
          .split(',')
          .map((h) => h.trim())
          .filter(Boolean),
      } as Record<string, unknown>

      if (shouldResetCursor) {
        delete (nextConfig as any).cursor_last_row
      }

      const patch = await fetch(`/api/integrations/${integration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: nextConfig }),
      })
      if (!patch.ok) {
        const pdata = await patch.json().catch(() => ({}))
        throw new Error(pdata.error || 'Failed to save assignment')
      }

      const response = await fetch(`/api/integrations/${integration.id}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_sync: true,
          sheet_assigned_to: sheetAssignee ? sheetAssignee : null,
          force_unassign: !sheetAssignee,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Sync failed')
      }

      const created = Number(data.leads_created || 0)
      const updated = Number(data.leads_updated || 0)
      const assignmentLabel = sheetAssignee ? 'assigned' : 'unassigned'
      toast.success(`Assigned (${assignmentLabel}): ${created} created, ${updated} updated. Future rows will auto-sync.`)
      onUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setIsAssigningSheet(false)
    }
  }

  const saveManualHeaders = async () => {
    const headers = manualHeadersText
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean)

    if (headers.length === 0) {
      toast.error('Enter at least one header (comma separated)')
      return
    }

    // Persist for mapping UI immediately
    setPreviewHeaders(headers)
    safeSessionSet(storageKey(integration.id, 'preview_headers'), headers)

    // Save into integration config so it persists across refresh too
    setIsSaving(true)
    try {
      const updatedConfig = {
        ...(integration.config || {}),
        manual_headers: headers,
      } as Record<string, unknown>

      const response = await fetch(`/api/integrations/${integration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: updatedConfig }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save manual headers')
      }
      toast.success('Manual headers saved')
      onUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save manual headers')
    } finally {
      setIsSaving(false)
    }
  }

  const headerOptions = useMemo(() => {
    const uniq = Array.from(new Set(previewHeaders.map((h) => String(h).trim()).filter(Boolean)))
    return uniq
  }, [previewHeaders])

  const headerOptionsPlusSelected = useMemo(() => {
    const selected = columnFields
      .map((k) => mapping[k])
      .filter((v): v is string => Boolean(v && v !== '__none__'))
      .map((v) => String(v).trim())
      .filter(Boolean)

    return Array.from(new Set([...headerOptions, ...selected]))
  }, [headerOptions, mapping])

  const headerSelectItems = (headerOptionsPlusSelected.length ? headerOptionsPlusSelected : []).map((h) => (
    <SelectItem key={h} value={h}>
      {h}
    </SelectItem>
  ))

  const setMap = (key: keyof ColumnMapping, value: string) => {
    setMapping((m) => ({ ...m, [key]: value === '__none__' ? undefined : value }))
  }

  // Persist critical UI state so it survives tab switches (component unmount/remount)
  useEffect(() => {
    safeSessionSet(storageKey(integration.id, 'mapping'), mapping)
  }, [integration.id, mapping])

  useEffect(() => {
    safeSessionSet(storageKey(integration.id, 'sheet_url'), sheetUrl)
  }, [integration.id, sheetUrl])

  useEffect(() => {
    safeSessionSet(storageKey(integration.id, 'sheet_tab_name'), tabName)
  }, [integration.id, tabName])

  // Fetch sales team list (needed for assignment UI after sync)
  useEffect(() => {
    const run = async () => {
      try {
        const supabase = createClient()
        const { data: auth } = await supabase.auth.getUser()
        if (!auth?.user) return

        const { data: profile } = await supabase
          .from('users')
          .select('id, role, org_id, name, email')
          .eq('auth_id', auth.user.id)
          .single()

        if (!profile?.org_id) return

        const { data: sales } = await supabase
          .from('users')
          .select('id, name, email')
          .eq('org_id', profile.org_id)
          .eq('role', 'sales')
          .eq('is_approved', true)
          .eq('is_active', true)
          .order('created_at', { ascending: true })

        const list = (sales || []) as SalesPerson[]

        // Allow assigning to admin as well (optional but helpful for testing)
        if (profile.role === 'admin' || profile.role === 'super_admin') {
          list.push({
            id: profile.id,
            name: profile.name || 'Admin',
            email: profile.email || '',
          })
        }

        setSalesTeam(list)
      } catch {
        // ignore
      }
    }

    run()
  }, [])

  // Assignment is now a single sheet-level dropdown + import action.

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">Step 1: Connect Google</div>
              <div className="text-sm text-muted-foreground">
                Connect once. We will use polling (every 2–5 minutes) to import new rows.
              </div>
            </div>
            <a href={connectUrl}>
              <Button variant={isConnected ? 'outline' : 'default'}>
                {isConnected ? 'Reconnect Google' : 'Connect Google'}
              </Button>
            </a>
          </div>
          {isConnected ? (
            <div className="text-xs text-muted-foreground">Connected</div>
          ) : (
            <div className="text-xs text-destructive">Not connected</div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Google Sheet URL *</Label>
            <Input value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="Paste Google Sheet URL" />
          </div>
          <div className="space-y-2">
            <Label>Sheet Tab Name *</Label>
            <Input value={tabName} onChange={(e) => setTabName(e.target.value)} placeholder="e.g., Sheet1" />
          </div>
        </div>

        <div className="flex gap-2">
        <Button onClick={() => persistConfig()} disabled={isSaveDisabled}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
          <Button
            variant="outline"
            onClick={previewSheet}
            disabled={isPreviewing || !savedSheetUrl || !savedTabName || !isConnected}
            title={!savedSheetUrl || !savedTabName ? 'Save Settings first' : 'Fetch all rows/columns for preview'}
          >
            {isPreviewing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Sync Now
              </>
            )}
          </Button>
        </div>

        <div className="rounded-md border p-4 space-y-3">
          <div className="font-medium">Manual Header Input (optional)</div>
          <div className="text-sm text-muted-foreground">
            If your sheet is currently blank (no Row 1 headers yet), paste headers here (comma separated) so you can map columns now.
            Make sure these header names match what Meta/Sheets will eventually create in Row 1.
          </div>
          <div className="space-y-2">
            <Label>Headers (comma separated)</Label>
            <Input
              value={manualHeadersText}
              onChange={(e) => setManualHeadersText(e.target.value)}
              placeholder="e.g., full_name, phone_number, email, company_name, platform"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={saveManualHeaders} disabled={isSaving}>
              Save Manual Headers
            </Button>
          </div>
        </div>
      </div>

      {previewHeaders.length > 0 && (
        <div className="space-y-4">
          <div className="font-medium">Step 2: Synced Rows (Raw Preview)</div>
          <div className="text-sm text-muted-foreground">
            This is a raw preview of your sheet (all columns). It persists even if you switch tabs.
          </div>

          <div className="rounded-md border">
            <div className="max-h-[60vh] overflow-auto">
              <div className="min-w-[900px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background border-b">
                    <tr>
                      <th className="p-2 text-left whitespace-nowrap">Row #</th>
                      {previewHeaders.map((h) => (
                        <th key={h} className="p-2 text-left whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r) => (
                      <tr key={r.rowNumber} className="border-b last:border-b-0">
                        <td className="p-2 whitespace-nowrap">{r.rowNumber}</td>
                        {previewHeaders.map((h) => (
                          <td key={h} className="p-2 whitespace-nowrap">
                            {r.cells?.[h] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewHeaders.length > 0 && (
        <div className="space-y-4">
          <div className="font-medium">Step 3: Column Mapping</div>
          <div className="text-sm text-muted-foreground">
            Map columns after preview. Phone will be saved as digits-only during import.
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Phone (required)</Label>
              <Select value={mapping.phone || '__none__'} onValueChange={(v) => setMap('phone', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- Select --</SelectItem>
                  {headerSelectItems}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Name (optional)</Label>
              <Select value={mapping.name || '__none__'} onValueChange={(v) => setMap('name', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- None --</SelectItem>
                  {headerSelectItems}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Email (optional)</Label>
              <Select value={mapping.email || '__none__'} onValueChange={(v) => setMap('email', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- None --</SelectItem>
                  {headerSelectItems}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Company (optional)</Label>
              <Select value={mapping.company || '__none__'} onValueChange={(v) => setMap('company', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- None --</SelectItem>
                  {headerSelectItems}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Source (optional)</Label>
              <Select value={mapping.source || '__none__'} onValueChange={(v) => setMap('source', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- None --</SelectItem>
                  {headerSelectItems}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-4">
            <div className="font-medium">Step 4: Lead Assignment</div>
            <div className="text-sm text-muted-foreground">
              Choose a sales rep (or None), then click Assign. Existing rows will be imported now, and future rows will auto-sync with the same assignment.
            </div>

            <div className="space-y-3">
              <div className="space-y-2 md:w-96">
                <Label>Assign to</Label>
                <Select value={sheetAssignee || '__none__'} onValueChange={(v) => setSheetAssignee(v === '__none__' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select sales rep (or None)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None (Unassigned)</SelectItem>
                    {salesTeam.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} {u.email ? `(${u.email})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="w-fit"
                onClick={fetchLeadsWithAssignment}
                disabled={isAssignDisabled}
                title={
                  !mapping.phone
                    ? 'Map the Phone column first'
                    : !assignmentChanged && !hasUnsavedChanges
                      ? 'Already assigned with these settings'
                      : 'Import rows and set assignment'
                }
              >
                {isAssigningSheet ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  'Assign'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 5 (Imported Leads table) intentionally removed per updated UX */}
    </div>
  )
}

