'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type User = {
  id: string
  name: string
  email: string
  role: string
}

type LeadForm = {
  id: string
  name: string
}

interface FormAssignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  integrationId: string
  availableForms?: LeadForm[]
  prefillForm?: LeadForm | null
  assignment?: {
    id: string
    form_id: string
    form_name: string
    assigned_to: string
    is_active: boolean
  } | null
  onSuccess: () => void
}

export function FormAssignmentDialog({
  open,
  onOpenChange,
  integrationId,
  availableForms: availableFormsProp,
  prefillForm,
  assignment,
  onSuccess,
}: FormAssignmentDialogProps) {
  const [formId, setFormId] = useState('')
  const [formName, setFormName] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [users, setUsers] = useState<User[]>([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [availableForms, setAvailableForms] = useState<LeadForm[]>([])
  const [selectedFormOption, setSelectedFormOption] = useState<string>('')

  const isLoadingForms = open && !assignment && availableFormsProp === undefined

  useEffect(() => {
    if (!open) return

    fetchUsers()
    setAvailableForms(Array.isArray(availableFormsProp) ? availableFormsProp : [])

    if (assignment) {
      setFormId(assignment.form_id)
      setFormName(assignment.form_name)
      setAssignedTo(assignment.assigned_to)
      setIsActive(assignment.is_active)
      setSelectedFormOption(assignment.form_id)
    } else if (prefillForm?.id) {
      setFormId(prefillForm.id)
      setFormName(prefillForm.name || prefillForm.id)
      setSelectedFormOption(prefillForm.id)
    } else {
      setFormId('')
      setFormName('')
      setAssignedTo('')
      setIsActive(true)
      setSelectedFormOption('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assignment, prefillForm?.id])

  const fetchUsers = async () => {
    setIsLoadingUsers(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('users')
        .select('org_id')
        .eq('auth_id', user.id)
        .single()

      if (!profile) return

      const { data: usersData, error } = await supabase
        .from('users')
        .select('id, name, email, role')
        .eq('org_id', profile.org_id)
        .eq('role', 'sales')
        .eq('is_approved', true)
        .eq('is_active', true)
        .order('name')

      if (error) throw error
      setUsers(usersData || [])
    } catch (error) {
      console.error('Error fetching users:', error)
      toast.error('Failed to load sales team')
    } finally {
      setIsLoadingUsers(false)
    }
  }

  // Forms are provided from Step 2 (Integration Settings) cache to avoid refetching here.

  const handleFormSelect = (value: string) => {
    setSelectedFormOption(value)
    if (!value || value === '__custom__') {
      setFormId('')
      setFormName('')
      return
    }
    const selected = availableForms.find((f) => f.id === value)
    if (selected) {
      setFormId(selected.id)
      setFormName(selected.name)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formId || !formName || !assignedTo) {
      toast.error('Please fill in all required fields')
      return
    }

    setIsSaving(true)
    try {
      const url = assignment
        ? `/api/integrations/${integrationId}/form-assignments/${assignment.id}`
        : `/api/integrations/${integrationId}/form-assignments`

      const method = assignment ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_id: formId,
          form_name: formName,
          assigned_to: assignedTo,
          is_active: isActive,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save assignment')
      }

      toast.success(assignment ? 'Lead form assignment updated' : 'Lead form assignment created')
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error('Error saving assignment:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save lead form assignment')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {assignment ? 'Edit Lead Form Assignment' : 'New Lead Form Assignment'}
          </DialogTitle>
          <DialogDescription>
            Route leads from a specific Meta Instant Form to a sales rep
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {!assignment && (
              <div className="space-y-2">
                <Label>Lead Form</Label>
                {prefillForm?.id ? (
                  <div className="text-sm">
                    <span className="font-medium">{prefillForm.name}</span>
                    <span className="text-xs text-muted-foreground"> • {prefillForm.id}</span>
                  </div>
                ) : isLoadingForms ? (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                ) : availableForms.length > 0 ? (
                  <Select value={selectedFormOption} onValueChange={handleFormSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a fetched lead form (recommended)" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableForms.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom__">Custom (enter manually)</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    No lead forms loaded yet. Go to <strong>Step 2</strong> and click <strong>Fetch Lead Forms</strong>, then come back here.
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="formId">Form ID *</Label>
              <Input
                id="formId"
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
                placeholder="e.g., 123456789"
                required
                disabled={!!assignment}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="formName">Form Name *</Label>
              <Input
                id="formName"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., Book a Demo (Instant Form)"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="assignedTo">Assign To *</Label>
              {isLoadingUsers ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : (
                <Select value={assignedTo} onValueChange={setAssignedTo} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select sales rep" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="isActive"
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
              />
              <Label htmlFor="isActive" className="cursor-pointer">
                Active (route leads from this form)
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : assignment ? (
                'Update'
              ) : (
                'Create'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}


