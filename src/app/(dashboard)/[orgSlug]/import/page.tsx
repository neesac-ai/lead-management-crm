'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type ParsedLead = {
  name: string
  company?: string
  email?: string
  phone?: string
  source?: string
}

export default function ImportPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)

  useEffect(() => {
    const fetchOrg = async () => {
      const supabase = createClient()
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single()
      
      if (org) setOrgId(org.id)
    }
    fetchOrg()
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

  const processFile = async (file: File) => {
    if (!orgId) {
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

    try {
      const text = await file.text()
      const leads = parseCSV(text)

      if (leads.length === 0) {
        toast.error('No valid leads found in file')
        setIsProcessing(false)
        return
      }

      const supabase = createClient()
      let success = 0
      let failed = 0

      for (const lead of leads) {
        const { error } = await supabase
          .from('leads')
          .insert({
            org_id: orgId,
            name: lead.name,
            email: lead.email || null,
            phone: lead.phone || null,
            source: lead.source || 'import',
            status: 'new',
            custom_fields: { company: lead.company || null },
          })

        if (error) {
          failed++
          console.error('Failed to import lead:', lead.name, error)
        } else {
          success++
        }
      }

      setImportResult({ success, failed })
      
      if (success > 0) {
        toast.success(`Imported ${success} leads successfully`)
      }
      if (failed > 0) {
        toast.error(`Failed to import ${failed} leads`)
      }
    } catch (error) {
      console.error('Import error:', error)
      toast.error('Failed to process file')
    }

    setIsProcessing(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
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

    if (nameIndex === -1) {
      toast.error('CSV must have a "name" column')
      return []
    }

    const leads: ParsedLead[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''))
      const name = values[nameIndex]
      
      if (name) {
        leads.push({
          name,
          company: companyIndex >= 0 ? values[companyIndex] : undefined,
          email: emailIndex >= 0 ? values[emailIndex] : undefined,
          phone: phoneIndex >= 0 ? values[phoneIndex] : undefined,
          source: sourceIndex >= 0 ? values[sourceIndex] : undefined,
        })
      }
    }

    return leads
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title="Import Leads" 
        description="Import leads from CSV, Excel, or integrations"
      />
      
      <div className="flex-1 p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Upload File</CardTitle>
            <CardDescription>Import leads from CSV or Excel files</CardDescription>
          </CardHeader>
          <CardContent>
            <div 
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
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
              ) : importResult ? (
                <>
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p className="text-lg font-medium mb-2">Import Complete</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    {importResult.success} leads imported successfully
                    {importResult.failed > 0 && `, ${importResult.failed} failed`}
                  </p>
                  <Button onClick={() => setImportResult(null)}>
                    Import More
                  </Button>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium mb-2">Drop your file here</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Supports CSV and XLSX files. Must have a &quot;name&quot; column.
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
                Your CSV should have the following columns (name is required):
              </p>
              <code className="text-xs bg-background px-2 py-1 rounded">
                name, company, email, phone, source
              </code>
              <p className="text-xs text-muted-foreground mt-2">
                Example: John Doe, Acme Inc., john@example.com, +1234567890, website
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>Connect to lead sources</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
