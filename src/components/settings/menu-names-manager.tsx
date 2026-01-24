'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Pencil, X, Save, Menu as MenuIcon } from 'lucide-react'
import { toast } from 'sonner'

interface MenuName {
  id: string | null
  label: string
}

interface MenuNamesManagerProps {
  orgSlug: string
  isAdmin: boolean
}

// Default menu items in order
const MENU_ITEMS = [
  { key: 'dashboard', defaultLabel: 'Dashboard' },
  { key: 'leads', defaultLabel: 'Leads' },
  { key: 'follow-ups', defaultLabel: 'Follow-ups' },
  { key: 'meetings', defaultLabel: 'Meetings' },
  { key: 'subscriptions', defaultLabel: 'Subscriptions' },
  { key: 'analytics', defaultLabel: 'Analytics' },
  { key: 'call-tracking', defaultLabel: 'Call Tracking' },
  { key: 'locations', defaultLabel: 'Locations' },
  { key: 'assignment', defaultLabel: 'Lead Assignment' },
  { key: 'integrations', defaultLabel: 'Integrations' },
  { key: 'products', defaultLabel: 'Products' },
  { key: 'team', defaultLabel: 'Team' },
  { key: 'payments', defaultLabel: 'Payments' },
  { key: 'invoices', defaultLabel: 'Invoices' },
  { key: 'settings', defaultLabel: 'Settings' },
]

export function MenuNamesManager({ orgSlug, isAdmin }: MenuNamesManagerProps) {
  const [menuNames, setMenuNames] = useState<Record<string, MenuName>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)

  useEffect(() => {
    fetchMenuNames()
  }, [])

  const fetchMenuNames = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/menu-names')
      if (!response.ok) throw new Error('Failed to fetch menu names')
      const data = await response.json()
      setMenuNames(data.menuNames || {})
    } catch (error) {
      console.error('Error fetching menu names:', error)
      toast.error('Failed to load menu names')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = (menuKey: string) => {
    const menuName = menuNames[menuKey]
    setEditingKey(menuKey)
    setEditingLabel(menuName?.label || MENU_ITEMS.find(m => m.key === menuKey)?.defaultLabel || '')
  }

  const handleSave = async () => {
    if (!editingKey) return

    if (!editingLabel || editingLabel.trim() === '') {
      toast.error('Menu label cannot be empty')
      return
    }

    try {
      setIsSaving(true)
      const response = await fetch('/api/menu-names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menu_key: editingKey,
          custom_label: editingLabel.trim(),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save menu name')
      }

      toast.success('Menu name updated successfully')
      setEditingKey(null)
      setEditingLabel('')
      await fetchMenuNames()

      // Notify sidebar to refresh
      window.dispatchEvent(new CustomEvent('menu-names-updated'))
    } catch (error: any) {
      toast.error(error.message || 'Failed to save menu name')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (menuKey: string) => {
    const menuName = menuNames[menuKey]
    if (!menuName?.id) {
      toast.error('This menu item is using the default name')
      return
    }

    if (!confirm(`Revert "${menuName.label}" back to "${MENU_ITEMS.find(m => m.key === menuKey)?.defaultLabel}"?`)) {
      return
    }

    try {
      setIsDeleting(menuKey)
      const response = await fetch(`/api/menu-names/${menuName.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete menu name')
      }

      toast.success('Menu name reverted to default')
      await fetchMenuNames()

      // Notify sidebar to refresh
      window.dispatchEvent(new CustomEvent('menu-names-updated'))
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete menu name')
    } finally {
      setIsDeleting(null)
    }
  }

  if (!isAdmin) {
    return null
  }

  return (
    <Card>
      <CardHeader className="px-4 lg:px-6">
        <div className="flex items-center gap-2">
          <MenuIcon className="h-5 w-5 text-blue-500" />
          <CardTitle>Sidebar Menu Names</CardTitle>
        </div>
        <CardDescription>
          Customize the labels displayed in the sidebar menu. Changes will be visible to all users in your organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 lg:px-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            {MENU_ITEMS.map((menuItem) => {
              const menuName = menuNames[menuItem.key] || { id: null, label: menuItem.defaultLabel }
              const isCustom = menuName.id !== null
              const isEditing = editingKey === menuItem.key

              return (
                <div
                  key={menuItem.key}
                  className="flex items-center gap-3 p-3 border rounded-lg bg-card"
                >
                  {isEditing ? (
                    <>
                      <div className="flex-1">
                        <div className="space-y-1">
                          <Label className="text-xs font-medium">Menu Label</Label>
                          <Input
                            value={editingLabel}
                            onChange={(e) => setEditingLabel(e.target.value)}
                            className="h-9"
                            placeholder="Enter menu label"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={handleSave}
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
                            setEditingKey(null)
                            setEditingLabel('')
                          }}
                          title="Cancel editing"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{menuName.label}</span>
                          {isCustom && (
                            <span className="text-xs text-muted-foreground font-mono">
                              ({menuItem.key})
                            </span>
                          )}
                          {!isCustom && (
                            <span className="text-xs text-muted-foreground italic">
                              Default
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(menuItem.key)}
                          title="Edit menu name"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {isCustom && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(menuItem.key)}
                            disabled={isDeleting === menuItem.key}
                            title="Revert to default"
                          >
                            {isDeleting === menuItem.key ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4 text-destructive" />
                            )}
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
