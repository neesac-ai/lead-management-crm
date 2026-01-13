'use client'

import { useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type PreviewLead = {
  external_id: string
  created_at?: string
  name: string
  phone?: string | null
  email?: string | null
  company?: string | null
  source: 'facebook' | 'instagram'
  form_id?: string | null
}

type PreviewGroup = {
  assigned_to: string | null
  assigned_user: { id: string; name: string; email: string } | null
  leads: PreviewLead[]
}

export function LeadBackfillDialog({
  open,
  onOpenChange,
  integrationId,
  selectedFormIds,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  integrationId: string
  selectedFormIds: string[]
}) {
  const [windowDays, setWindowDays] = useState<'7' | '30' | '90'>('30')
  const [isFetching, setIsFetching] = useState(false)
  const [isPushing, setIsPushing] = useState(false)
  const [groups, setGroups] = useState<PreviewGroup[]>([])
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({})
  const resultsScrollRef = useRef<HTMLDivElement | null>(null)

  const allLeads = useMemo(() => groups.flatMap((g) => g.leads), [groups])
  const selectableIds = useMemo(() => {
    const ids: string[] = []
    for (const l of allLeads) {
      if ((l.phone || '').trim()) ids.push(l.external_id)
    }
    return ids
  }, [allLeads])

  const selectedCount = useMemo(
    () => Object.keys(selectedIds).filter((k) => selectedIds[k]).length,
    [selectedIds]
  )

  const fetchPreview = async () => {
    if (!selectedFormIds.length) {
      toast.error('Select one or more lead forms first')
      return
    }
    setIsFetching(true)
    try {
      const res = await fetch(`/api/integrations/${integrationId}/preview-leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_ids: selectedFormIds,
          backfill_days: Number(windowDays),
          limit: 500,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.details || data?.error || 'Failed to fetch leads')

      const nextGroups = (data.groups || []) as PreviewGroup[]
      setGroups(nextGroups)
      // Reset selection
      setSelectedIds({})

      const count = nextGroups.reduce((sum, g) => sum + (g.leads?.length || 0), 0)
      if (count === 0) {
        toast.message('No leads found for the selected forms in this duration')
      } else {
        toast.success(`Found ${count} leads`)
      }
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Failed to fetch leads')
    } finally {
      setIsFetching(false)
    }
  }

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds({})
      return
    }
    const next: Record<string, boolean> = {}
    for (const id of selectableIds) next[id] = true
    setSelectedIds(next)
  }

  const pushSelected = async () => {
    if (selectedCount === 0) return
    setIsPushing(true)
    try {
      const selectedSet = new Set(Object.keys(selectedIds).filter((k) => selectedIds[k]))
      const payloadLeads = allLeads
        .filter((l) => selectedSet.has(l.external_id))
        .map((l) => ({
          external_id: l.external_id,
          name: l.name,
          phone: l.phone,
          email: l.email,
          company: l.company,
          form_id: l.form_id,
          created_at: l.created_at,
        }))

      const res = await fetch(`/api/integrations/${integrationId}/import-leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: payloadLeads }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.details || data?.error || 'Failed to import leads')

      toast.success(
        `Pushed ${data.created || 0} leads (duplicates: ${data.skipped_duplicates || 0}, missing phone: ${data.skipped_missing_phone || 0})`
      )
      if (Array.isArray(data.errors) && data.errors.length) {
        toast.message('Some leads had issues', { description: String(data.errors[0]) })
      }
      onOpenChange(false)
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Failed to push leads')
    } finally {
      setIsPushing(false)
    }
  }

  const scrollResultsX = (dir: -1 | 1) => {
    try {
      resultsScrollRef.current?.scrollBy({ left: dir * 360, behavior: 'smooth' })
    } catch {
      // ignore
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0">
        {/* Sticky header */}
        <div className="shrink-0 border-b bg-background px-4 py-4 sm:px-6">
          <DialogHeader className="gap-1">
            <DialogTitle>Fetch older leads (selected forms)</DialogTitle>
            <DialogDescription>
              Fetch leads generated in the selected time window, then push selected leads into BharatCRM.
              <span className="block">
                <strong>Phone is required</strong> to push into Leads.
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm text-muted-foreground">Duration</div>
              <Select value={windowDays} onValueChange={(v) => setWindowDays(v as typeof windowDays)}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={fetchPreview} disabled={isFetching || selectedFormIds.length === 0}>
                {isFetching ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Fetching…
                  </>
                ) : (
                  'Fetch Leads'
                )}
              </Button>
              <Button onClick={pushSelected} disabled={isPushing || selectedCount === 0}>
                {isPushing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Pushing…
                  </>
                ) : (
                  `Push to Leads (${selectedCount})`
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {groups.length > 0 ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  Found {allLeads.length} leads across {groups.length} group(s)
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all"
                    checked={selectedCount > 0 && selectedCount === selectableIds.length}
                    onCheckedChange={(v) => toggleAll(Boolean(v))}
                  />
                  <label htmlFor="select-all" className="text-sm cursor-pointer">
                    Select all with phone ({selectableIds.length})
                  </label>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Tip: Use the left/right buttons (or trackpad) to scroll and view Email/Company/Source/Form.
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => scrollResultsX(-1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Left
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => scrollResultsX(1)}>
                  Right
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>

              {/* Single scroll area for all results (horizontal + vertical) */}
              <div
                ref={resultsScrollRef}
                className="rounded-lg border overflow-auto max-h-[60vh]"
                style={{ scrollbarGutter: 'stable both-edges' }}
              >
                <div className="min-w-[1200px] space-y-4 p-3">
                  {groups.map((g, idx) => (
                    <div key={g.assigned_to || `unassigned-${idx}`} className="rounded-lg border">
                      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b bg-muted/30">
                        <div className="text-sm font-medium">
                          {g.assigned_user?.name
                            ? `${g.assigned_user.name} (${g.leads.length})`
                            : `Unassigned (${g.leads.length})`}
                        </div>
                        {g.assigned_user?.email && (
                          <div className="text-xs text-muted-foreground truncate max-w-[50%]">
                            {g.assigned_user.email}
                          </div>
                        )}
                      </div>

                      <div className="w-full">
                        <table className="w-full caption-bottom text-sm">
                          <thead className="[&_tr]:border-b">
                            <tr className="border-b">
                              <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[40px]" />
                              <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">
                                Name
                              </th>
                              <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">
                                Phone
                              </th>
                              <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">
                                Email
                              </th>
                              <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">
                                Company
                              </th>
                              <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">
                                Source
                              </th>
                              <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">
                                Form
                              </th>
                            </tr>
                          </thead>
                          <tbody className="[&_tr:last-child]:border-0">
                            {g.leads.map((l) => {
                              const hasPhone = Boolean((l.phone || '').trim())
                              const checked = Boolean(selectedIds[l.external_id])
                              const email = l.email || '-'
                              const company = l.company || '-'
                              const source = l.source || '-'
                              const formId = l.form_id ? l.form_id : '-'

                              return (
                                <tr
                                  key={l.external_id}
                                  className="hover:bg-muted/50 border-b transition-colors"
                                >
                                  <td className="p-2 align-middle whitespace-nowrap pr-0">
                                    <Checkbox
                                      checked={checked}
                                      disabled={!hasPhone}
                                      onCheckedChange={(v) =>
                                        setSelectedIds((prev) => ({
                                          ...prev,
                                          [l.external_id]: Boolean(v),
                                        }))
                                      }
                                    />
                                  </td>
                                  <td className="p-2 align-middle whitespace-nowrap font-medium">
                                    {l.name}
                                  </td>
                                  <td className="p-2 align-middle whitespace-nowrap">
                                    {hasPhone ? (
                                      l.phone
                                    ) : (
                                      <Badge variant="secondary">Missing phone</Badge>
                                    )}
                                  </td>
                                  <td className="p-2 align-middle whitespace-nowrap text-muted-foreground max-w-[260px] truncate">
                                    {email}
                                  </td>
                                  <td className="p-2 align-middle whitespace-nowrap text-muted-foreground max-w-[260px] truncate">
                                    {company}
                                  </td>
                                  <td className="p-2 align-middle whitespace-nowrap">
                                    <Badge variant="outline">{source}</Badge>
                                  </td>
                                  <td className="p-2 align-middle whitespace-nowrap text-muted-foreground font-mono text-xs">
                                    {formId}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Select duration and click <strong>Fetch Leads</strong>.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

