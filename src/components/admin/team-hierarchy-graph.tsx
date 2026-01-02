'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  Handle,
  Position,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Expand, Minimize2, Users, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface HierarchyUser {
  id: string
  name: string
  email: string
  role: string
  manager_id: string | null
  reporteeCount: number
  level: number
  leadCount?: number
}

interface HierarchyData {
  hierarchy: Array<{
    user: HierarchyUser
    reportees: any[]
    level: number
  }>
  flat: HierarchyUser[]
}

interface TeamHierarchyGraphProps {
  orgId: string
}

// Custom node component
function CustomNode({ data }: { data: any }) {
  const { role, name, email, reporteeCount, leadCount, avatar_url } = data
  const isExpanded = data.isExpanded ?? true

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-500'
      case 'sales': return 'bg-blue-500'
      case 'accountant': return 'bg-green-500'
      default: return 'bg-gray-500'
    }
  }

  const isSelected = data.isSelected
  const isManager = data.isManager
  const isReportee = data.isReportee

  return (
    <div className={`px-4 py-3 bg-white dark:bg-gray-800 rounded-lg shadow-md border-2 ${isSelected
        ? 'border-blue-600 shadow-lg ring-2 ring-blue-500 ring-opacity-50'
        : isManager || isReportee
          ? 'border-blue-400 shadow-md'
          : isExpanded
            ? 'border-blue-500'
            : 'border-gray-300'
      } min-w-[200px] relative transition-all`}>
      {/* Source handle (bottom) - for edges coming from this node */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="source"
        style={{
          background: '#60a5fa',
          width: '8px',
          height: '8px',
          border: '2px solid white',
          borderRadius: '50%',
        }}
      />

      {/* Target handle (top) - for edges going to this node */}
      <Handle
        type="target"
        position={Position.Top}
        id="target"
        style={{
          background: '#60a5fa',
          width: '8px',
          height: '8px',
          border: '2px solid white',
          borderRadius: '50%',
        }}
      />

      <div className="flex items-center gap-2 mb-2">
        <Avatar className="h-8 w-8">
          <AvatarImage src={avatar_url || undefined} />
          <AvatarFallback className={getRoleColor(role)}>
            {name?.charAt(0).toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{name}</p>
          <p className="text-xs text-muted-foreground truncate">{email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge className={`${getRoleColor(role)} text-white text-xs`}>
          {role}
        </Badge>
        {reporteeCount > 0 && (
          <Badge variant="outline" className="text-xs">
            {reporteeCount} reportee{reporteeCount !== 1 ? 's' : ''}
          </Badge>
        )}
        {leadCount !== undefined && leadCount > 0 && (
          <Badge variant="outline" className="text-xs">
            {leadCount} lead{leadCount !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>
    </div>
  )
}

// Define nodeTypes outside component to prevent React Flow warnings
// This must be a stable reference - defined at module level, never recreated
const nodeTypes = {
  custom: CustomNode,
}

function HierarchyGraphContent({ orgId }: { orgId: string }) {
  const [hierarchyData, setHierarchyData] = useState<HierarchyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const { fitView, getNode } = useReactFlow()

  useEffect(() => {
    fetchHierarchy()
  }, [orgId])

  const fetchHierarchy = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/admin/team/hierarchy?orgId=${orgId}`)
      if (!response.ok) throw new Error('Failed to fetch hierarchy')
      const data = await response.json()
      setHierarchyData(data)
      // Expand all nodes by default
      const allNodeIds = new Set(data.flat.map((u: HierarchyUser) => u.id))
      setExpandedNodes(allNodeIds)
    } catch (error) {
      console.error('Error fetching hierarchy:', error)
    } finally {
      setLoading(false)
    }
  }

  const buildGraph = useMemo(() => {
    if (!hierarchyData) return { nodes: [], edges: [] }

    const nodes: Node[] = []
    const edges: Edge[] = []
    const nodePositions: Record<string, { x: number; y: number }> = {}

    // Calculate positions using a hierarchical layout
    const calculatePositions = (
      user: HierarchyUser,
      x: number,
      y: number,
      visited: Set<string> = new Set()
    ) => {
      if (visited.has(user.id)) return
      visited.add(user.id)

      nodePositions[user.id] = { x, y }

      // Find direct reportees (only if parent is expanded)
      const reportees = hierarchyData.flat.filter(
        (u) => u.manager_id === user.id && expandedNodes.has(user.id)
      )

      if (reportees.length > 0) {
        // If only one reportee, position it directly below parent (same X) for vertical line
        if (reportees.length === 1) {
          const reporteeY = y + 200
          calculatePositions(reportees[0], x, reporteeY, visited)
        } else {
          // Multiple reportees - space them out horizontally
          const spacing = 320
          const startX = x - ((reportees.length - 1) * spacing) / 2

          reportees.forEach((reportee, index) => {
            const reporteeX = startX + index * spacing
            const reporteeY = y + 200
            calculatePositions(reportee, reporteeX, reporteeY, visited)
          })
        }
      }
    }

    // Start from root nodes (users without managers)
    const rootNodes = hierarchyData.flat.filter((u) => !u.manager_id)
    rootNodes.forEach((root, index) => {
      calculatePositions(root, index * 500, 0)
    })

    // Create nodes for all expanded users first
    hierarchyData.flat.forEach((user) => {
      if (!expandedNodes.has(user.id)) return

      const position = nodePositions[user.id] || { x: 0, y: 0 }
      nodes.push({
        id: user.id,
        type: 'custom',
        position,
        data: {
          ...user,
          isExpanded: expandedNodes.has(user.id),
        },
      })
    })

    // Create edges - connect manager to reportee if both are expanded and positioned
    // Only create edges for nodes that exist in the nodes array
    const nodeIds = new Set(nodes.map(n => n.id))

    // Count how many reportees each manager has (for branching logic)
    const managerReporteeCount = new Map<string, number>()
    hierarchyData.flat.forEach((user) => {
      if (user.manager_id && expandedNodes.has(user.id) && expandedNodes.has(user.manager_id)) {
        managerReporteeCount.set(
          user.manager_id,
          (managerReporteeCount.get(user.manager_id) || 0) + 1
        )
      }
    })

    hierarchyData.flat.forEach((user) => {
      if (
        user.manager_id &&
        nodeIds.has(user.id) &&
        nodeIds.has(user.manager_id) &&
        nodePositions[user.id] &&
        nodePositions[user.manager_id]
      ) {
        // Check if this node has any reportees (is a terminal/leaf node)
        const hasReportees = hierarchyData.flat.some(
          (u) => u.manager_id === user.id && expandedNodes.has(u.id)
        )

        // Check if parent has multiple reportees (needs branching)
        const parentReporteeCount = managerReporteeCount.get(user.manager_id) || 0
        const needsBranching = parentReporteeCount > 1

        // Use step edges for all cases - this is the standard org chart style
        // Step edges handle varying card widths gracefully with 90-degree bends
        // Highlight edges connected to selected user
        // Edge is highlighted if it connects:
        // 1. The selected user to their manager (user.id === selectedUserId)
        // 2. The selected user to their reportees (user.manager_id === selectedUserId)
        const isSelectedEdge = selectedUserId && (
          user.id === selectedUserId ||
          user.manager_id === selectedUserId
        )

        edges.push({
          id: `edge-${user.manager_id}-${user.id}`,
          source: user.manager_id,
          target: user.id,
          sourceHandle: 'source',
          targetHandle: 'target',
          type: 'step',
          animated: false,
          style: {
            stroke: isSelectedEdge ? '#2563eb' : '#60a5fa',
            strokeWidth: isSelectedEdge ? 3 : 2,
            strokeOpacity: isSelectedEdge ? 1 : 0.7,
          },
          markerEnd: {
            type: 'arrowclosed',
            width: isSelectedEdge ? 15 : 12,
            height: isSelectedEdge ? 15 : 12,
            color: isSelectedEdge ? '#2563eb' : '#60a5fa',
          },
        })
      }
    })

    return { nodes, edges }
  }, [hierarchyData, expandedNodes, selectedUserId])

  const { nodes, edges } = buildGraph

  // Filter users based on search query
  const filteredUsers = useMemo(() => {
    if (!hierarchyData || !searchQuery.trim()) return []

    const query = searchQuery.toLowerCase().trim()
    return hierarchyData.flat.filter((user) =>
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query)
    )
  }, [hierarchyData, searchQuery])

  // Handle search selection
  const handleSearchSelect = (userId: string) => {
    setSelectedUserId(userId)
    // Expand all nodes to show the selected user and their relationships
    if (hierarchyData) {
      const allNodeIds = new Set(hierarchyData.flat.map((u: HierarchyUser) => u.id))
      setExpandedNodes(allNodeIds)
    }

    // Focus on the selected node after a short delay
    setTimeout(() => {
      const node = getNode(userId)
      if (node) {
        fitView({
          nodes: [{ id: userId }],
          padding: 0.3,
          duration: 500
        })
      }
    }, 100)
  }

  // Clear search
  const clearSearch = () => {
    setSearchQuery('')
    setSelectedUserId(null)
  }

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes)

    // Always keep the clicked node expanded
    newExpanded.add(nodeId)

    // Check if node currently has expanded reportees
    const hasExpandedReportees = hierarchyData?.flat.some(
      (u) => u.manager_id === nodeId && newExpanded.has(u.id)
    )

    if (hasExpandedReportees) {
      // Collapse: collapse all direct and indirect reportees, but keep the clicked node
      const collapseReportees = (managerId: string) => {
        hierarchyData?.flat
          .filter((u) => u.manager_id === managerId)
          .forEach((reportee) => {
            newExpanded.delete(reportee.id)
            // Recursively collapse all indirect reportees
            collapseReportees(reportee.id)
          })
      }
      collapseReportees(nodeId)
    } else {
      // Expand: expand all direct reportees
      const directReportees = hierarchyData?.flat.filter((u) => u.manager_id === nodeId) || []
      directReportees.forEach((reportee) => {
        newExpanded.add(reportee.id)
      })
    }

    setExpandedNodes(newExpanded)
  }

  const expandAll = () => {
    if (hierarchyData) {
      setExpandedNodes(new Set(hierarchyData.flat.map((u) => u.id)))
      // Re-fit view after expand
      setTimeout(() => fitView({ padding: 0.2 }), 100)
    }
  }

  const collapseAll = () => {
    // Keep only root nodes expanded
    if (hierarchyData) {
      const rootNodes = hierarchyData.flat.filter((u) => !u.manager_id)
      setExpandedNodes(new Set(rootNodes.map((u) => u.id)))
      // Re-fit view after collapse
      setTimeout(() => fitView({ padding: 0.2 }), 100)
    }
  }

  useEffect(() => {
    if (nodes.length > 0 && edges.length >= 0) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        setTimeout(() => {
          fitView({ padding: 0.2, duration: 300 })
        }, 100)
      })
    }
  }, [nodes.length, edges.length, fitView])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Team Hierarchy</CardTitle>
          <CardDescription>Loading organizational structure...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!hierarchyData || hierarchyData.flat.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Team Hierarchy</CardTitle>
          <CardDescription>No team members found</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="text-center text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No team members to display</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Team Hierarchy</CardTitle>
              <CardDescription>Visual representation of your organizational structure</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={expandAll}>
                <Expand className="h-4 w-4 mr-2" />
                Expand All
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>
                <Minimize2 className="h-4 w-4 mr-2" />
                Collapse All
              </Button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search employee by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {/* Search Results Dropdown */}
            {searchQuery && filteredUsers.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                {filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSearchSelect(user.id)}
                    className={`w-full text-left px-4 py-2 hover:bg-accent transition-colors ${selectedUserId === user.id ? 'bg-accent' : ''
                      }`}
                  >
                    <div className="font-medium">{user.name}</div>
                    <div className="text-sm text-muted-foreground">{user.email}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {user.role} • {user.reporteeCount} reportee{user.reporteeCount !== 1 ? 's' : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchQuery && filteredUsers.length === 0 && (
              <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg p-4 text-center text-muted-foreground">
                No employees found matching "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[600px] w-full border rounded-lg bg-gray-50 dark:bg-gray-900 relative [&_.react-flow__edge-path]:stroke-blue-400 [&_.react-flow__edge-path]:stroke-[2.5px] [&_.react-flow__edge-path]:opacity-80 [&_.react-flow__arrowhead]:fill-blue-400">
          <ReactFlow
            key={`flow-${nodes.length}-${edges.length}`}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(event, node) => {
              event.stopPropagation()
              toggleNode(node.id)
            }}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            attributionPosition="bottom-left"
            defaultEdgeOptions={{
              type: 'step',
              animated: false,
              style: {
                stroke: '#60a5fa',
                strokeWidth: 2,
                strokeOpacity: 0.7,
              },
              markerEnd: {
                type: 'arrowclosed',
                width: 12,
                height: 12,
                color: '#60a5fa',
              },
            }}
            connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 2 }}
            snapToGrid={false}
            nodesDraggable={true}
            nodesConnectable={false}
            elementsSelectable={true}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#e5e7eb" gap={16} />
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                const role = node.data?.role
                if (role === 'admin') return '#9333ea'
                if (role === 'sales') return '#3b82f6'
                if (role === 'accountant') return '#10b981'
                return '#6b7280'
              }}
              maskColor="rgba(0, 0, 0, 0.1)"
            />
          </ReactFlow>
        </div>
        <div className="mt-4 text-sm text-muted-foreground">
          <p>Click on a node to expand/collapse its reportees. Use the search bar to find employees and highlight their manager and reportees. Blue lines show manager-reportee relationships.</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function TeamHierarchyGraph({ orgId }: TeamHierarchyGraphProps) {
  return (
    <ReactFlowProvider>
      <HierarchyGraphContent orgId={orgId} />
    </ReactFlowProvider>
  )
}

