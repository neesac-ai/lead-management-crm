# Testing Guide: Hierarchical Manager-Reportee System

This guide provides step-by-step instructions to test the manager-reportee hierarchy feature.

## Prerequisites

1. **Run the Migration**
   ```bash
   # Make sure you have Supabase CLI installed and configured
   # Run the migration to create the hierarchy tables and functions
   npx supabase migration up
   ```
   
   Or if using Supabase Dashboard:
   - Go to SQL Editor
   - Copy contents of `supabase/migrations/031_manager_hierarchy.sql`
   - Execute the SQL

2. **Test Users Setup**
   - You need at least one admin account
   - Create multiple sales rep accounts (at least 3-4 for testing hierarchy)
   - Ensure all users are in the same organization

## Test Scenarios

### Test 1: Basic Manager Assignment

**Objective**: Verify admins can assign managers to sales reps

**Steps**:
1. Login as **Admin**
2. Navigate to **Team Management** page (`/[orgSlug]/team`)
3. Find a sales rep in the "Active Team Members" section
4. Click the **three dots (⋮)** menu next to the sales rep
5. Click **"Assign Manager"**
6. In the dialog:
   - Verify current manager is shown (if any)
   - Select a manager from the dropdown (should show available admins/sales)
   - Click **"Assign Manager"**
7. Verify success toast appears
8. Refresh the page
9. Verify the manager's name appears below the sales rep's email

**Expected Result**: 
- Manager assignment dialog opens
- Manager can be selected and assigned
- Manager name appears in team list
- Success message displayed

---

### Test 2: Remove Manager Assignment

**Objective**: Verify admins can remove manager assignments

**Steps**:
1. Login as **Admin**
2. Navigate to **Team Management** page
3. Find a sales rep that has a manager assigned
4. Click the **three dots (⋮)** menu
5. Click **"Assign Manager"**
6. In the dialog:
   - Verify current manager is displayed
   - Click **"Remove Manager"** button
7. Verify success toast appears
8. Refresh the page
9. Verify manager name is no longer shown

**Expected Result**:
- Manager can be removed
- Manager name disappears from team list
- Success message displayed

---

### Test 3: Circular Reference Prevention

**Objective**: Verify system prevents circular manager assignments

**Setup**:
- User A has manager B
- User B has manager C

**Steps**:
1. Login as **Admin**
2. Navigate to **Team Management**
3. Try to assign User A as manager of User C (who manages B, who manages A)
4. Click **"Assign Manager"**

**Expected Result**:
- Error message: "Cannot create circular reference: this user is already a reportee of the target manager"
- Assignment is prevented

**Additional Test**:
- Try to assign a user as their own manager
- Should show error: "User cannot be their own manager"

---

### Test 4: Manager Can View Reportees' Leads

**Objective**: Verify managers can see leads assigned to their reportees

**Setup**:
1. Assign Manager M to Sales Rep S
2. Create or assign some leads to Sales Rep S

**Steps**:
1. Login as **Sales Rep S**
2. Navigate to **Leads** page
3. Note the leads visible to Sales Rep S
4. Logout
5. Login as **Manager M** (or Admin who assigned M as manager)
6. Navigate to **Leads** page
7. Verify you can see the same leads that Sales Rep S sees

**Expected Result**:
- Manager can see all leads assigned to their reportees
- Leads appear in the leads list
- Manager can open and view lead details

---

### Test 5: Manager Can Edit Reportees' Leads

**Objective**: Verify managers can edit leads assigned to their reportees

**Setup**:
- Manager M manages Sales Rep S
- Sales Rep S has at least one assigned lead

**Steps**:
1. Login as **Manager M**
2. Navigate to **Leads** page
3. Find a lead assigned to Sales Rep S
4. Click on the lead to open detail dialog
5. Click **"Edit"** button
6. Modify lead details (name, phone, email, company, source)
7. Click **"Save"**
8. Verify success message
9. Verify changes are saved

**Expected Result**:
- Manager can edit lead details
- Changes are saved successfully
- Updated information appears in lead list

---

### Test 6: Reportees Filter in Leads Page

**Objective**: Verify managers can filter between their leads and reportees' leads

**Setup**:
- Manager M manages Sales Rep S1 and S2
- Manager M has some leads assigned to them
- S1 and S2 have leads assigned to them

**Steps**:
1. Login as **Manager M**
2. Navigate to **Leads** page
3. Look for **"Lead Source"** filter dropdown (should appear if manager has reportees)
4. Select **"All Leads"** - verify all leads (yours + reportees) are shown
5. Select **"My Leads"** - verify only leads assigned to Manager M are shown
6. Select **"My Reportees' Leads"** - verify only leads assigned to S1 and S2 are shown

**Expected Result**:
- Filter dropdown appears for managers with reportees
- Filter correctly separates "My Leads" vs "Reportees' Leads"
- Lead counts update based on filter selection

---

### Test 7: Manager Can Assign Leads to Reportees

**Objective**: Verify managers can assign leads to their reportees

**Setup**:
- Manager M manages Sales Rep S
- There are unassigned leads in the system

**Steps**:
1. Login as **Manager M**
2. Navigate to **Lead Assignment** page (`/[orgSlug]/assignment`)
3. Verify Sales Rep S appears in the sales team dropdown
4. Select one or more unassigned leads
5. Select Sales Rep S from the dropdown
6. Click **"Assign Selected Leads"**
7. Verify success message
8. Navigate to **Leads** page
9. Verify the leads are now assigned to Sales Rep S

**Expected Result**:
- Manager sees their reportees in the assignment dropdown
- Manager can assign leads to reportees
- Leads are successfully assigned
- Leads appear in reportees' lead lists

---

### Test 8: Multi-Level Hierarchy

**Objective**: Verify unlimited depth hierarchy works correctly

**Setup**:
- Admin manages Manager M1
- Manager M1 manages Sales Rep S1
- Sales Rep S1 manages Sales Rep S2 (if allowed)

**Steps**:
1. Login as **Admin**
2. Assign Manager M1 to Sales Rep S1
3. Assign Sales Rep S1 to Sales Rep S2 (if your system allows sales to have reportees)
4. Create leads and assign to S2
5. Login as **Manager M1**
6. Navigate to **Leads** page
7. Verify you can see leads assigned to both S1 and S2 (indirect reportees)

**Expected Result**:
- Multi-level hierarchy is supported
- Managers can see leads from indirect reportees
- RLS policies work correctly for nested hierarchies

---

### Test 9: Dashboard Metrics Include Reportees' Leads

**Objective**: Verify dashboard shows reportees' leads in metrics

**Setup**:
- Manager M manages Sales Rep S
- Sales Rep S has several leads in different statuses

**Steps**:
1. Login as **Manager M**
2. Navigate to **Dashboard**
3. Check the **"Total Leads"** metric
4. Verify it includes leads from Sales Rep S
5. Check other metrics (New Leads, etc.)
6. Verify they include reportees' data

**Expected Result**:
- Dashboard metrics include reportees' leads
- Counts are accurate
- Metrics update when reportees' leads change

---

### Test 10: API Endpoints

**Objective**: Verify all API endpoints work correctly

**Test Endpoints**:

1. **Get Reportees**
   ```bash
   # Replace {userId} with a manager's user ID
   GET /api/admin/team/{userId}/reportees
   ```
   - Should return list of all reportees (direct and indirect)

2. **Get Manager**
   ```bash
   # Replace {userId} with a sales rep's user ID
   GET /api/admin/team/{userId}/manager
   ```
   - Should return manager details if assigned, or null

3. **Get Hierarchy**
   ```bash
   GET /api/admin/team/hierarchy?orgId={orgId}
   ```
   - Should return full organizational hierarchy tree

4. **Assign Manager**
   ```bash
   POST /api/admin/team/{userId}/assign-manager
   Body: { "managerId": "manager-user-id" }
   ```
   - Should assign manager successfully

5. **Remove Manager**
   ```bash
   DELETE /api/admin/team/{userId}/remove-manager
   ```
   - Should remove manager assignment

**Expected Result**:
- All endpoints return correct data
- Proper error handling for invalid requests
- Authentication and authorization work correctly

---

### Test 11: RLS Policy Verification

**Objective**: Verify Row Level Security policies work correctly

**Steps**:
1. Login as **Sales Rep S** (with no manager)
2. Note which leads are visible
3. Assign Manager M to Sales Rep S
4. Login as **Manager M**
5. Verify Manager M can now see Sales Rep S's leads
6. Remove Manager M from Sales Rep S
7. Login as **Manager M** again
8. Verify Manager M can no longer see Sales Rep S's leads

**Expected Result**:
- RLS policies automatically grant/revoke access based on manager assignments
- No manual permission updates needed
- Access is immediate after assignment changes

---

### Test 12: Cross-Organization Prevention

**Objective**: Verify managers can only manage users in same organization

**Steps**:
1. Login as **Admin** from Organization A
2. Try to assign a manager from Organization B to a user in Organization A
3. Verify error message appears

**Expected Result**:
- Error: "Users must be in same organization"
- Assignment is prevented

---

## Common Issues & Troubleshooting

### Issue: Manager assignment dialog doesn't show available managers

**Solution**:
- Check if there are active users in the organization
- Verify users have roles 'admin' or 'sales'
- Check browser console for errors

### Issue: Managers can't see reportees' leads

**Solution**:
- Verify migration `031_manager_hierarchy.sql` was run
- Check RLS policies are active in Supabase
- Verify manager assignment was successful (check `users.manager_id` in database)

### Issue: Circular reference error when it shouldn't

**Solution**:
- Check the hierarchy tree using `/api/admin/team/hierarchy`
- Verify no existing relationships create a cycle
- Clear manager assignments and rebuild hierarchy

### Issue: Reportees filter doesn't appear

**Solution**:
- Verify the user has reportees (check `get_all_reportees` function)
- Check if `reportees.length > 0` in the leads page
- Verify user role is 'sales'

---

## Database Verification Queries

Run these queries in Supabase SQL Editor to verify the setup:

```sql
-- Check manager assignments
SELECT 
  u1.name as employee,
  u1.role as employee_role,
  u2.name as manager,
  u2.role as manager_role
FROM users u1
LEFT JOIN users u2 ON u1.manager_id = u2.id
WHERE u1.org_id = 'your-org-id'
ORDER BY u2.name NULLS LAST, u1.name;

-- Test get_all_reportees function
SELECT * FROM get_all_reportees('manager-user-id-here');

-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'leads';

-- Verify indexes exist
SELECT indexname FROM pg_indexes 
WHERE tablename = 'users' 
AND indexname LIKE '%manager%';
```

---

## Success Criteria Checklist

- [ ] Admins can assign managers to sales reps
- [ ] Admins can remove manager assignments
- [ ] Circular references are prevented
- [ ] Managers can view reportees' leads
- [ ] Managers can edit reportees' leads
- [ ] Reportees filter works in leads page
- [ ] Managers can assign leads to reportees
- [ ] Multi-level hierarchy works (3+ levels)
- [ ] Dashboard includes reportees' metrics
- [ ] API endpoints return correct data
- [ ] RLS policies work automatically
- [ ] Cross-org assignments are prevented
- [ ] Self-management is prevented

---

## Notes

- **RLS Policies**: The system uses Row Level Security, so managers automatically get access to reportees' leads without manual permission grants
- **Unlimited Depth**: The hierarchy supports unlimited depth (Admin → Manager → Sales Rep → Sub-Sales Rep, etc.)
- **Performance**: The recursive function `get_all_reportees()` is optimized with indexes for efficient queries
- **Security**: All manager assignments are validated server-side to prevent security issues

