'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, AlertTriangle, X, UserCheck, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'

type ParsedLead = {
  name?: string
  company?: string
  email?: string
  phone?: string
  source?: string
}

type DuplicateInfo = {
  lead: ParsedLead
  existingId: string
  existingName: string
  assignedTo: string | null
  assigneeName: string | null
}

type ImportPreview = {
  newLeads: ParsedLead[]
  duplicates: DuplicateInfo[]
}

type UserProfile = {
  id: string
  role: string
  org_id: string
}

export default function ImportPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; failed: number; skipped: number } | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)

  // Import preview state (for admin)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [selectedDuplicates, setSelectedDuplicates] = useState<Set<string>>(new Set())

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()

      // Get org
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single()

      if (org) setOrgId(org.id)

      // Get user profile
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('id, role, org_id')
          .eq('auth_id', user.id)
          .single()

        if (profile) {
          setUserProfile(profile as UserProfile)
        }
      }
    }
    fetchData()
  }, [orgSlug])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  // Normalize phone number for comparison
  const normalizePhone = (phone: string): string => {
    const cleaned = phone.replace(/[^\d+]/g, '')
    if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
      return '+91' + cleaned
    }
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
      return '+' + cleaned
    }
    if (!cleaned.startsWith('+') && cleaned.length > 10) {
      return '+' + cleaned
    }
    return cleaned
  }

  const processFile = async (file: File) => {
    if (!orgId || !userProfile) {
      toast.error('Organization not found')
      return
    }

    const validTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    if (!validTypes.includes(file.type) && !file.name.endsWith('.csv') && !file.name.endsWith('.xlsx')) {
      toast.error('Please upload a CSV or Excel file')
      return
    }

    setIsProcessing(true)
    setImportResult(null)
    setImportPreview(null)

    try {
      const text = await file.text()
      const leads = parseCSV(text)

      if (leads.length === 0) {
        toast.error('No valid leads found in file')
        setIsProcessing(false)
        return
      }

      const supabase = createClient()

      // Fetch existing leads to check for duplicates
      const { data: existingLeads } = await supabase
        .from('leads')
        .select('id, name, phone, assigned_to')
        .eq('org_id', orgId)

      // Get user names for assigned leads
      const assignedUserIds = new Set(existingLeads?.filter(l => l.assigned_to).map(l => l.assigned_to) || [])
      let userNames: Record<string, string> = {}
      if (assignedUserIds.size > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, name')
          .in('id', Array.from(assignedUserIds))
        users?.forEach(u => { userNames[u.id] = u.name })
      }

      // Build phone lookup map
      const phoneToExisting = new Map<string, { id: string; name: string; assigned_to: string | null }>()
      existingLeads?.forEach(lead => {
        if (lead.phone) {
          phoneToExisting.set(normalizePhone(lead.phone), {
            id: lead.id,
            name: lead.name,
            assigned_to: lead.assigned_to,
          })
        }
      })

      // Categorize leads
      const newLeads: ParsedLead[] = []
      const duplicates: DuplicateInfo[] = []

      for (const lead of leads) {
        if (lead.phone) {
          const normalized = normalizePhone(lead.phone)
          const existing = phoneToExisting.get(normalized)
          if (existing) {
            duplicates.push({
              lead,
              existingId: existing.id,
              existingName: existing.name,
              assignedTo: existing.assigned_to,
              assigneeName: existing.assigned_to ? userNames[existing.assigned_to] || null : null,
            })
            continue
          }
        }
        newLeads.push(lead)
      }

      // For admin - show preview if there are duplicates
      if (userProfile.role === 'admin' && duplicates.length > 0) {
        setImportPreview({ newLeads, duplicates })
        setIsProcessing(false)
        return
      }

      // For sales or no duplicates - import directly
      await importLeads(newLeads, duplicates.length)
    } catch (error) {
      console.error('Import error:', error)
      toast.error('Failed to process file')
    }

    setIsProcessing(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const importLeads = async (leads: ParsedLead[], skippedCount: number = 0) => {
    if (!orgId || !userProfile) return

    setIsProcessing(true)
    const supabase = createClient()
    let success = 0
    let failed = 0

    for (const lead of leads) {
      const { error } = await supabase
        .from('leads')
        .insert({
          org_id: orgId,
          name: (lead.name || 'Unknown').trim() || 'Unknown',
          email: lead.email || null,
          phone: lead.phone || null,
          source: lead.source || 'import',
          status: 'new',
          custom_fields: { company: lead.company || null },
          created_by: userProfile.id,
        })

      if (error) {
        failed++
        console.error('Failed to import lead:', lead.name, error)
      } else {
        success++
      }
    }

    setImportResult({ success, failed, skipped: skippedCount })
    setImportPreview(null)
    setSelectedDuplicates(new Set())

    if (success > 0) {
      toast.success(`Imported ${success} leads successfully`)
    }
    if (skippedCount > 0) {
      toast.info(`${skippedCount} duplicate leads skipped`)
    }
    if (failed > 0) {
      toast.error(`Failed to import ${failed} leads`)
    }

    setIsProcessing(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleImportWithDuplicates = async () => {
    if (!importPreview) return

    // Get selected duplicates to add anyway
    const leadsToImport = [
      ...importPreview.newLeads,
      ...importPreview.duplicates
        .filter(d => selectedDuplicates.has(d.existingId))
        .map(d => d.lead)
    ]

    const skipped = importPreview.duplicates.length - selectedDuplicates.size
    await importLeads(leadsToImport, skipped)
  }

  const toggleDuplicateSelection = (id: string) => {
    setSelectedDuplicates(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const parseCSV = (text: string): ParsedLead[] => {
    const lines = text.split('\n').filter(line => line.trim())
    if (lines.length < 2) return []

    const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''))
    const nameIndex = headers.findIndex(h => h.includes('name') && !h.includes('company'))
    const companyIndex = headers.findIndex(h => h.includes('company') || h.includes('organization'))
    const emailIndex = headers.findIndex(h => h.includes('email'))
    const phoneIndex = headers.findIndex(h => h.includes('phone') || h.includes('mobile'))
    const sourceIndex = headers.findIndex(h => h.includes('source'))

    if (phoneIndex === -1) {
      toast.error('CSV must have a "phone" column')
      return []
    }

    const leads: ParsedLead[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''))
      const phone = values[phoneIndex]
      if (!phone) continue

      const name = nameIndex >= 0 ? values[nameIndex] : ''
      leads.push({
        name: name || undefined,
        company: companyIndex >= 0 ? values[companyIndex] : undefined,
        email: emailIndex >= 0 ? values[emailIndex] : undefined,
        phone,
        source: sourceIndex >= 0 ? values[sourceIndex] : undefined,
      })
    }

    return leads
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="Import Leads"
        description="Import leads from CSV, Excel, or integrations"
      />

      <div className="flex-1 p-4 lg:p-6 space-y-4 lg:space-y-6">
        <Card>
          <CardHeader className="px-4 lg:px-6">
            <CardTitle>Upload File</CardTitle>
            <CardDescription>Import leads from CSV or Excel files</CardDescription>
          </CardHeader>
          <CardContent className="px-4 lg:px-6">
            <div
              className={`border-2 border-dashed rounded-lg p-6 lg:p-12 text-center transition-colors ${
                isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-12 w-12 mx-auto mb-4 text-primary animate-spin" />
                  <p className="text-lg font-medium mb-2">Processing file...</p>
                  <p className="text-sm text-muted-foreground">
                    Please wait while we import your leads
                  </p>
                </>
              ) : importPreview ? (
                <div className="text-left">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle className="h-6 w-6 text-amber-500" />
                    <h3 className="text-lg font-medium">Import Preview</h3>
                  </div>

                  {/* Summary */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-center gap-2 text-green-700">
                        <CheckCircle className="h-5 w-5" />
                        <span className="font-medium">{importPreview.newLeads.length} New Leads</span>
                      </div>
                      <p className="text-sm text-green-600 mt-1">Ready to import</p>
                    </div>
                    <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="flex items-center gap-2 text-amber-700">
                        <AlertTriangle className="h-5 w-5" />
                        <span className="font-medium">{importPreview.duplicates.length} Duplicates</span>
                      </div>
                      <p className="text-sm text-amber-600 mt-1">Phone already exists</p>
                    </div>
                  </div>

                  {/* Duplicates List */}
                  {importPreview.duplicates.length > 0 && (
                    <div className="mb-6">
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Duplicate Leads (select to add anyway)
                      </h4>
                      <div className="max-h-[200px] overflow-y-auto space-y-2 border rounded-lg p-2">
                        {importPreview.duplicates.map((dup, idx) => (
                          <div
                            key={idx}
                            className={`p-3 rounded-lg border ${
                              selectedDuplicates.has(dup.existingId)
                                ? 'bg-primary/5 border-primary'
                                : 'bg-muted/50'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={selectedDuplicates.has(dup.existingId)}
                                onCheckedChange={() => toggleDuplicateSelection(dup.existingId)}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium truncate">{dup.lead.name}</span>
                                  <Badge variant="outline" className="shrink-0">
                                    {dup.lead.phone}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                  Existing: <span className="text-foreground">{dup.existingName}</span>
                                  {dup.assignedTo && (
                                    <span className="ml-2">
                                      → <UserCheck className="inline h-3 w-3" /> {dup.assigneeName}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {selectedDuplicates.size} selected to add, {importPreview.duplicates.length - selectedDuplicates.size} will be skipped
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-3 justify-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setImportPreview(null)
                        setSelectedDuplicates(new Set())
                      }}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                    <Button onClick={handleImportWithDuplicates}>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Import {importPreview.newLeads.length + selectedDuplicates.size} Leads
                    </Button>
                  </div>
                </div>
              ) : importResult ? (
                <>
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p className="text-lg font-medium mb-2">Import Complete</p>
                  <div className="text-sm text-muted-foreground mb-4 space-y-1">
                    <p className="text-green-600">{importResult.success} leads imported successfully</p>
                    {importResult.skipped > 0 && (
                      <p className="text-amber-600">{importResult.skipped} duplicates skipped</p>
                    )}
                    {importResult.failed > 0 && (
                      <p className="text-red-600">{importResult.failed} failed to import</p>
                    )}
                  </div>
                  <Button onClick={() => setImportResult(null)}>
                    Import More
                  </Button>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium mb-2">Drop your file here</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Supports CSV and XLSX files. Must have a &quot;phone&quot; column.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" />
                    Choose File
                  </Button>
                </>
              )}
            </div>

            <div className="mt-6 p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4" />
                CSV Format Guide
              </h4>
              <p className="text-sm text-muted-foreground mb-2">
                Your CSV should have the following columns (phone is required):
              </p>
              <code className="text-xs bg-background px-2 py-1 rounded">
                phone, name, company, email, source
              </code>
              <p className="text-xs text-muted-foreground mt-2">
                Example: +1234567890, John Doe, Acme Inc., john@example.com, website
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-4 lg:px-6">
            <CardTitle>Integrations</CardTitle>
            <CardDescription>Connect to lead sources</CardDescription>
          </CardHeader>
          <CardContent className="px-4 lg:px-6">
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              {['Facebook', 'Instagram', 'LinkedIn', 'WhatsApp'].map((platform) => (
                <div
                  key={platform}
                  className="p-4 border rounded-lg text-center opacity-50"
                >
                  <p className="font-medium">{platform}</p>
                  <p className="text-xs text-muted-foreground mt-1">Coming soon</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
