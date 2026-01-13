'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Loader2, Edit, Trash2, Users, XCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { FormAssignmentDialog } from './form-assignment-dialog'

type LeadForm = { id: string; name: string }

type LeadFormAssignment = {
  id: string
  form_id: string
  form_name: string
  assigned_to: string | null
  is_active: boolean
  assigned_user: {
    id: string
    name: string
    email: string
  } | null
}

interface FormAssignmentTableProps {
  integrationId: string
  availableForms?: LeadForm[]
}

export function FormAssignmentTable({ integrationId, availableForms }: FormAssignmentTableProps) {
  const [assignments, setAssignments] = useState<LeadFormAssignment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<LeadFormAssignment | null>(null)
  const [prefillForm, setPrefillForm] = useState<LeadForm | null>(null)

  useEffect(() => {
    fetchAssignments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrationId])

  // Listen for custom event to open assignment dialog from Step 2 form selection
  useEffect(() => {
    const handleOpenAssignment = (e: CustomEvent<{ formId: string; formName: string }>) => {
      const { formId, formName } = e.detail
      setEditingAssignment(null)
      setPrefillForm({ id: formId, name: formName || formId })
      setIsDialogOpen(true)
    }

    window.addEventListener('open-form-assignment', handleOpenAssignment as EventListener)
    return () => {
      window.removeEventListener('open-form-assignment', handleOpenAssignment as EventListener)
    }
  }, [])

  const fetchAssignments = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/integrations/${integrationId}/form-assignments`)
      if (!response.ok) throw new Error('Failed to fetch lead form assignments')
      const data = await response.json()
      setAssignments(data.assignments || [])
    } catch (error) {
      console.error('Error fetching lead form assignments:', error)
      toast.error('Failed to load lead form assignments')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (assignmentId: string) => {
    if (!confirm('Are you sure you want to delete this lead form assignment?')) return
    try {
      const response = await fetch(
        `/api/integrations/${integrationId}/form-assignments/${assignmentId}`,
        { method: 'DELETE' }
      )
      if (!response.ok) throw new Error('Failed to delete assignment')
      toast.success('Lead form assignment deleted')
      fetchAssignments()
    } catch (error) {
      console.error('Error deleting assignment:', error)
      toast.error('Failed to delete lead form assignment')
    }
  }

  const handleToggleActive = async (assignment: LeadFormAssignment) => {
    try {
      const response = await fetch(
        `/api/integrations/${integrationId}/form-assignments/${assignment.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: !assignment.is_active }),
        }
      )
      if (!response.ok) throw new Error('Failed to update assignment')
      toast.success(`Lead form assignment ${!assignment.is_active ? 'activated' : 'deactivated'}`)
      fetchAssignments()
    } catch (error) {
      console.error('Error updating assignment:', error)
      toast.error('Failed to update lead form assignment')
    }
  }

  const handleUnassign = async (assignment: LeadFormAssignment) => {
    try {
      const response = await fetch(
        `/api/integrations/${integrationId}/form-assignments/${assignment.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: false }),
        }
      )
      if (!response.ok) throw new Error('Failed to unassign form')
      toast.success('Lead form unassigned')
      fetchAssignments()
    } catch (error) {
      console.error('Error unassigning lead form:', error)
      toast.error('Failed to unassign lead form')
    }
  }

  const rows = (() => {
    const byFormId = new Map<string, LeadFormAssignment>()
    for (const a of assignments) byFormId.set(a.form_id, a)

    // If we have availableForms, show ALL forms (assigned + unassigned) so unassigned forms are visible here too.
    if (Array.isArray(availableForms) && availableForms.length > 0) {
      return availableForms.map((f) => {
        const a = byFormId.get(f.id) || null
        return {
          key: f.id,
          form_id: f.id,
          form_name: f.name,
          assignment: a,
          status: a && a.is_active && a.assigned_to ? 'assigned' : 'unassigned',
        }
      })
    }

    // Fallback: only assignments if no forms were passed in.
    return assignments.map((a) => ({
      key: a.id,
      form_id: a.form_id,
      form_name: a.form_name,
      assignment: a,
      status: a && a.is_active && a.assigned_to ? 'assigned' : 'unassigned',
    }))
  })()

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Lead Form Assignments</CardTitle>
            <CardDescription>
              Route leads from Meta Instant Forms to sales reps (recommended)
            </CardDescription>
            {!availableForms || availableForms.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-2">
                No lead forms loaded yet. Go to <strong>Step 2</strong> and click <strong>Fetch Lead Forms</strong>, then come back here to assign.
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                setEditingAssignment(null)
                setIsDialogOpen(true)
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Assignment
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {rows.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Lead Form Assignments</h3>
            <p className="text-muted-foreground mb-4">
              Create assignments to route incoming instant form leads to the right sales rep
            </p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Assignment
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Form</TableHead>
                <TableHead>Form ID</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const a = r.assignment
                const isAssigned = Boolean(a && a.is_active && a.assigned_to)
                const canEdit = Boolean(a)
                return (
                <TableRow key={r.key}>
                  <TableCell className="font-medium">{r.form_name}</TableCell>
                  <TableCell className="font-mono text-xs">{r.form_id}</TableCell>
                  <TableCell>
                    {isAssigned && a?.assigned_user ? (
                      <div>
                        <div className="font-medium">{a.assigned_user.name}</div>
                        <div className="text-sm text-muted-foreground">{a.assigned_user.email}</div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={isAssigned ? 'default' : 'secondary'}>
                      {isAssigned ? 'Assigned' : 'Unassigned'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {a ? (
                        <>
                          {isAssigned ? (
                            <Button variant="ghost" size="icon" onClick={() => handleUnassign(a)} title="Unassign">
                              <XCircle className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon" onClick={() => handleToggleActive(a)} title="Activate">
                              <CheckCircle2 className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingAssignment(a)
                              setPrefillForm(null)
                              setIsDialogOpen(true)
                            }}
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)} title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingAssignment(null)
                            setPrefillForm({ id: r.form_id, name: r.form_name })
                            setIsDialogOpen(true)
                          }}
                        >
                          Assign
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )})}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <FormAssignmentDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        integrationId={integrationId}
        availableForms={availableForms}
        prefillForm={prefillForm}
        assignment={editingAssignment}
        onSuccess={fetchAssignments}
      />
    </Card>
  )
}


