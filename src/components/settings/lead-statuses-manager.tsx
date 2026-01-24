'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Pencil, Trash2, X, Save, Tag } from 'lucide-react'
import { toast } from 'sonner'
import { LeadStatus, PROTECTED_STATUSES } from '@/lib/lead-statuses'

interface LeadStatusesManagerProps {
  orgSlug: string
  isAdmin: boolean
}

export function LeadStatusesManager({ orgSlug, isAdmin }: LeadStatusesManagerProps) {
  const [statuses, setStatuses] = useState<LeadStatus[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingStatus, setEditingStatus] = useState<Partial<LeadStatus>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null) // Stores status_value of the status being deleted
  const [showAddForm, setShowAddForm] = useState(false)
  const [newStatus, setNewStatus] = useState({ label: '', color: 'bg-gray-500' })

  // Color options
  const colorOptions = [
    { value: 'bg-blue-500', label: 'Blue' },
    { value: 'bg-yellow-500', label: 'Yellow' },
    { value: 'bg-gray-500', label: 'Gray' },
    { value: 'bg-orange-500', label: 'Orange' },
    { value: 'bg-purple-500', label: 'Purple' },
    { value: 'bg-indigo-500', label: 'Indigo' },
    { value: 'bg-emerald-500', label: 'Green' },
    { value: 'bg-red-500', label: 'Red' },
    { value: 'bg-pink-500', label: 'Pink' },
    { value: 'bg-cyan-500', label: 'Cyan' },
  ]

  useEffect(() => {
    fetchStatuses()
  }, [])

  const fetchStatuses = async () => {
    try {
      setIsLoading(true)
      // Add cache-busting to ensure we get fresh data
      const response = await fetch(`/api/lead-statuses?t=${Date.now()}`, {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Failed to fetch statuses')
      const data = await response.json()
      console.log('Fetched statuses:', data.statuses)
      const fetchedStatuses = data.statuses || []
      console.log('Setting statuses state with:', fetchedStatuses.map((s: LeadStatus) => ({
        status_value: s.status_value,
        label: s.label,
        id: s.id
      })))
      setStatuses(fetchedStatuses)
    } catch (error) {
      console.error('Error fetching statuses:', error)
      toast.error('Failed to load lead statuses')
    } finally {
      setIsLoading(false)
    }
  }

  const [editingStatusValue, setEditingStatusValue] = useState<string | null>(null)

  const handleEdit = (status: LeadStatus) => {
    setEditingId(status.id || null)
    setEditingStatusValue(status.status_value) // Store the status_value to identify which status we're editing
    setEditingStatus({
      label: status.label,
      color: status.color,
      display_order: status.display_order,
      is_active: status.is_active,
    })
  }

  const handleSaveEdit = async () => {
    if (!editingStatusValue) return

    // Validate label is not empty
    if (!editingStatus.label || editingStatus.label.trim() === '') {
      toast.error('Status label cannot be empty')
      return
    }

    try {
      setIsSaving(true)

      // Use upsert endpoint for statuses without ID (simpler and more reliable)
      if (!editingId) {
        const payload = {
          status_value: editingStatusValue,
          label: editingStatus.label,
          color: editingStatus.color,
          display_order: editingStatus.display_order,
        }
        console.log('Upserting status:', payload)

        const response = await fetch('/api/lead-statuses/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to save status')
        }

        const result = await response.json()
        console.log('Upsert result:', result)
        toast.success('Status saved successfully')
      } else {
        // Update existing status
        console.log('Updating status:', editingId, editingStatus)
        const response = await fetch(`/api/lead-statuses/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingStatus),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to update status')
        }

        const result = await response.json()
        console.log('Update result:', result)
        toast.success('Status updated successfully')
      }

      // Wait for fetch to complete before closing edit mode
      await fetchStatuses()

      // Notify other components to refresh their status lists
      window.dispatchEvent(new CustomEvent('lead-statuses-updated'))

      // Small delay to ensure state updates
      await new Promise(resolve => setTimeout(resolve, 100))

      setEditingId(null)
      setEditingStatusValue(null)
      setEditingStatus({})
    } catch (error: any) {
      toast.error(error.message || 'Failed to save status')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (status: LeadStatus) => {
    if (!status.id) {
      // This is a default status that hasn't been customized yet - can't delete
      toast.error('This is a default status. Customize it first to enable deletion.')
      return
    }

    if (PROTECTED_STATUSES.includes(status.status_value)) {
      toast.error('This status cannot be deleted because it is linked to Follow-ups, Meetings, or Subscriptions')
      return
    }

    if (!confirm(`Are you sure you want to delete "${status.label}"? This action cannot be undone.`)) {
      return
    }

    try {
      setIsDeleting(status.status_value) // Use status_value as unique identifier
      const response = await fetch(`/api/lead-statuses/${status.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete status')
      }

      toast.success('Status deleted successfully')
      await fetchStatuses()

      // Notify other components to refresh their status lists
      window.dispatchEvent(new CustomEvent('lead-statuses-updated'))
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete status')
    } finally {
      setIsDeleting(null)
    }
  }

  const handleAdd = async () => {
    if (!newStatus.label || newStatus.label.trim() === '') {
      toast.error('Label is required')
      return
    }

    try {
      setIsSaving(true)
      const response = await fetch('/api/lead-statuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newStatus.label,
          color: newStatus.color,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create status')
      }

      toast.success('Status created successfully')
      setShowAddForm(false)
      setNewStatus({ label: '', color: 'bg-gray-500' })
      await fetchStatuses()
    } catch (error: any) {
      toast.error(error.message || 'Failed to create status')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isAdmin) {
    return null
  }

  return (
    <Card>
      <CardHeader className="px-4 lg:px-6">
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-blue-500" />
          <CardTitle>Lead Statuses</CardTitle>
        </div>
        <CardDescription>
          Customize lead status labels and colors. Protected statuses (Follow Up Again, Meeting Booked, Deal Won) cannot be deleted.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 lg:px-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Add New Status Form */}
            {showAddForm ? (
              <div className="p-4 border rounded-lg space-y-4 bg-muted/50">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Add New Status</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowAddForm(false)
                      setNewStatus({ label: '', color: 'bg-gray-500' })
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Label *</Label>
                    <Input
                      value={newStatus.label}
                      onChange={(e) => setNewStatus({ ...newStatus, label: e.target.value })}
                      placeholder="e.g., In Progress"
                    />
                    <p className="text-xs text-muted-foreground">Enter the status name as you want it to appear (e.g., "On Hold", "In Progress")</p>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Color</Label>
                    <div className="flex gap-2 flex-wrap">
                      {colorOptions.map((color) => (
                        <button
                          key={color.value}
                          type="button"
                          onClick={() => setNewStatus({ ...newStatus, color: color.value })}
                          className={`w-8 h-8 rounded ${color.value} border-2 ${
                            newStatus.color === color.value ? 'border-foreground' : 'border-transparent'
                          }`}
                          title={color.label}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <Button onClick={handleAdd} disabled={isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Save className="h-4 w-4 mr-2" />
                  Create Status
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => setShowAddForm(true)}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add New Status
              </Button>
            )}

            {/* Status List */}
            <div className="space-y-2">
              {statuses
                .filter(s => s.is_active !== false)
                .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
                .map((status) => (
                  <div
                    key={`${status.status_value}-${status.id || 'default'}-${status.label}`}
                    className="flex items-center gap-3 p-3 border rounded-lg bg-card"
                  >
                    {(editingId !== null && editingId === status.id) || (editingId === null && editingStatusValue === status.status_value) ? (
                      <>
                        <div className="flex-1 grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Label</Label>
                            <Input
                              value={editingStatus.label || ''}
                              onChange={(e) => setEditingStatus({ ...editingStatus, label: e.target.value })}
                              className="h-9"
                              placeholder="Enter status label"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">Color</Label>
                            <div className="flex gap-1.5 flex-wrap">
                              {colorOptions.slice(0, 8).map((color) => (
                                <button
                                  key={color.value}
                                  type="button"
                                  onClick={() => setEditingStatus({ ...editingStatus, color: color.value })}
                                  className={`w-7 h-7 rounded ${color.value} border-2 transition-all ${
                                    editingStatus.color === color.value ? 'border-foreground scale-110' : 'border-transparent hover:border-muted-foreground/50'
                                  }`}
                                  title={color.label}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            onClick={handleSaveEdit}
                            disabled={isSaving}
                            title="Save changes"
                          >
                            {isSaving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingId(null)
                              setEditingStatusValue(null)
                              setEditingStatus({})
                            }}
                            title="Cancel editing"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className={`w-4 h-4 rounded ${status.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{status.label}</span>
                            {status.is_protected && (
                              <Badge variant="outline" className="text-xs shrink-0">
                                Protected
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground font-mono shrink-0">
                              ({status.status_value})
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(status)}
                            title="Edit status"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {!status.is_protected && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDelete(status)}
                              disabled={isDeleting === status.status_value || !status.id}
                              title={!status.id ? "Save this status first to enable deletion" : "Delete status"}
                            >
                              {isDeleting === status.status_value ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-destructive" />
                              )}
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
