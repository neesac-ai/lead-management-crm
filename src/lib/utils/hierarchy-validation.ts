import { createClient } from '@/lib/supabase/server'

/**
 * Validates that a manager assignment is valid and doesn't create circular references
 */
export async function validateManagerAssignment(
  userId: string,
  managerId: string
): Promise<{ valid: boolean; error?: string }> {
  const supabase = await createClient()

  // 1. Cannot assign self
  if (userId === managerId) {
    return { valid: false, error: 'User cannot be their own manager' }
  }

  // 2. Get both users to check org_id
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, org_id, role, name')
    .in('id', [userId, managerId])

  if (usersError || !users || users.length !== 2) {
    return { valid: false, error: 'Users not found' }
  }

  const user = users.find(u => u.id === userId)
  const manager = users.find(u => u.id === managerId)

  if (!user || !manager) {
    return { valid: false, error: 'Users not found' }
  }

  // 3. Check same org
  if (user.org_id !== manager.org_id) {
    return { valid: false, error: 'Users must be in same organization' }
  }

  // 4. Check if manager is already a reportee (would create cycle)
  const { data: reportees, error: reporteesError } = await supabase
    .rpc('get_all_reportees', { manager_user_id: userId })

  if (reporteesError) {
    return { valid: false, error: 'Error checking hierarchy' }
  }

  if (reportees && reportees.some((r: { reportee_id: string }) => r.reportee_id === managerId)) {
    return { valid: false, error: 'Cannot create circular reference: this user is already a reportee of the target manager' }
  }

  // 5. Check if manager is inactive
  const { data: managerFull } = await supabase
    .from('users')
    .select('is_active')
    .eq('id', managerId)
    .single()

  if (!managerFull?.is_active) {
    return { valid: false, error: 'Manager must be an active user' }
  }

  return { valid: true }
}

/**
 * Gets all accessible user IDs for a manager (self + all reportees)
 */
export async function getAccessibleUserIds(
  userId: string,
  orgId: string
): Promise<string[]> {
  const supabase = await createClient()

  // Get all reportees
  const { data: reportees } = await supabase
    .rpc('get_all_reportees', { manager_user_id: userId })

  const reporteeIds = reportees?.map((r: { reportee_id: string }) => r.reportee_id) || []

  // Include self + all reportees
  return [userId, ...reporteeIds]
}

