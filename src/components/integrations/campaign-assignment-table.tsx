'use client'

import { useState, useEffect } from 'react'
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
import { Plus, Loader2, Edit, Trash2, Users, RefreshCw, XCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { CampaignAssignmentDialog } from './campaign-assignment-dialog'

type Integration = {
  id: string
  config?: Record<string, unknown> | null
}

type CampaignAssignment = {
  id: string
  campaign_id: string
  campaign_name: string
  assigned_to: string
  is_active: boolean
  assigned_user: {
    id: string
    name: string
    email: string
  } | null
}

interface CampaignAssignmentTableProps {
  integrationId: string
}

export function CampaignAssignmentTable({ integrationId }: CampaignAssignmentTableProps) {
  const [assignments, setAssignments] = useState<CampaignAssignment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<CampaignAssignment | null>(null)
  const [isFetchingCampaigns, setIsFetchingCampaigns] = useState(false)

  useEffect(() => {
    fetchAssignments()
  }, [integrationId])

  const fetchAssignments = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/integrations/${integrationId}/campaign-assignments`)
      if (!response.ok) {
        throw new Error('Failed to fetch campaign assignments')
      }
      const data = await response.json()
      setAssignments(data.assignments || [])
    } catch (error) {
      console.error('Error fetching campaign assignments:', error)
      toast.error('Failed to load campaign assignments')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFetchCampaigns = async () => {
    setIsFetchingCampaigns(true)
    try {
      // Fetch current integration config (so PATCH doesn't overwrite other config fields)
      const integrationRes = await fetch(`/api/integrations/${integrationId}`)
      if (!integrationRes.ok) {
        throw new Error('Failed to fetch integration config')
      }
      const integrationJson = (await integrationRes.json()) as { integration?: Integration }
      const existingConfig = (integrationJson.integration?.config || {}) as Record<string, unknown>

      // Fetch campaigns from platform using current credentials/config
      const response = await fetch(`/api/integrations/${integrationId}/campaigns`)
      if (!response.ok) {
        throw new Error('Failed to fetch campaigns')
      }
      const data = (await response.json()) as { campaigns?: Array<{ id: string; name: string }> }

      // Persist campaigns into integration config so both Settings + Assignments use the same list
      const saveRes = await fetch(`/api/integrations/${integrationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            ...existingConfig,
            available_campaigns: data.campaigns || [],
          },
        }),
      })
      if (!saveRes.ok) {
        throw new Error('Failed to save campaigns')
      }

      toast.success(`Updated campaigns: ${data.campaigns?.length || 0} found`)
    } catch (error) {
      console.error('Error fetching campaigns:', error)
      toast.error('Failed to fetch campaigns from platform')
    } finally {
      setIsFetchingCampaigns(false)
    }
  }

  const handleDelete = async (assignmentId: string) => {
    if (!confirm('Are you sure you want to delete this campaign assignment?')) {
      return
    }

    try {
      const response = await fetch(
        `/api/integrations/${integrationId}/campaign-assignments/${assignmentId}`,
        { method: 'DELETE' }
      )
      if (!response.ok) {
        throw new Error('Failed to delete assignment')
      }
      toast.success('Campaign assignment deleted')
      fetchAssignments()
    } catch (error) {
      console.error('Error deleting assignment:', error)
      toast.error('Failed to delete campaign assignment')
    }
  }

  const handleToggleActive = async (assignment: CampaignAssignment) => {
    try {
      const response = await fetch(
        `/api/integrations/${integrationId}/campaign-assignments/${assignment.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: !assignment.is_active }),
        }
      )
      if (!response.ok) {
        throw new Error('Failed to update assignment')
      }
      toast.success(`Campaign assignment ${!assignment.is_active ? 'activated' : 'deactivated'}`)
      fetchAssignments()
    } catch (error) {
      console.error('Error updating assignment:', error)
      toast.error('Failed to update campaign assignment')
    }
  }

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
            <CardTitle>Campaign Assignments</CardTitle>
            <CardDescription>
              Map campaigns to sales reps for automatic lead assignment
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleFetchCampaigns}
              disabled={isFetchingCampaigns}
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
        {assignments.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Campaign Assignments</h3>
            <p className="text-muted-foreground mb-4">
              Create assignments to automatically route leads from specific campaigns to sales reps
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
                <TableHead>Campaign</TableHead>
                <TableHead>Campaign ID</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell className="font-medium">{assignment.campaign_name}</TableCell>
                  <TableCell className="font-mono text-xs">{assignment.campaign_id}</TableCell>
                  <TableCell>
                    {assignment.assigned_user ? (
                      <div>
                        <div className="font-medium">{assignment.assigned_user.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {assignment.assigned_user.email}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Unknown</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={assignment.is_active ? 'default' : 'secondary'}>
                      {assignment.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleActive(assignment)}
                      >
                        {assignment.is_active ? (
                          <XCircle className="w-4 h-4" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingAssignment(assignment)
                          setIsDialogOpen(true)
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(assignment.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <CampaignAssignmentDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        integrationId={integrationId}
        assignment={editingAssignment}
        onSuccess={fetchAssignments}
      />
    </Card>
  )
}

