export * from './database.types'

// Extended types with relations
export interface UserWithOrg {
  id: string
  auth_id: string
  email: string
  name: string
  avatar_url: string | null
  role: import('./database.types').UserRole
  lead_allocation_percent: number
  is_approved: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  organization: {
    id: string
    name: string
    slug: string
    logo_url: string | null
    status: import('./database.types').OrgStatus
  } | null
}

export interface LeadWithDetails {
  id: string
  org_id: string
  name: string
  email: string | null
  phone: string | null
  source: string
  status: import('./database.types').LeadStatus
  custom_fields: import('./database.types').Json
  created_at: string
  updated_at: string
  assigned_user: {
    id: string
    name: string
    email: string
    avatar_url: string | null
  } | null
  activities_count: number
  last_activity: string | null
}

export interface CustomerSubscriptionWithLead {
  id: string
  org_id: string
  start_date: string
  end_date: string
  validity_days: number
  status: import('./database.types').SubscriptionStatus
  deal_value: number
  amount_credited: number
  amount_pending: number
  notes: string | null
  created_at: string
  lead: {
    id: string
    name: string
    email: string | null
    phone: string | null
  }
  days_remaining: number
}

export interface OrganizationWithSubscription {
  id: string
  name: string
  slug: string
  logo_url: string | null
  status: import('./database.types').OrgStatus
  settings: import('./database.types').Json
  created_at: string
  subscription: {
    id: string
    plan_id: string
    plan_name: string
    billing_cycle: import('./database.types').BillingCycle
    status: import('./database.types').OrgSubscriptionStatus
    end_date: string
  } | null
  users_count: number
  leads_count: number
}

// Auth context type
export interface AuthUser {
  id: string
  email: string
  name: string
  avatar_url: string | null
  role: import('./database.types').UserRole
  org_id: string | null
  org_slug: string | null
  is_approved: boolean
  is_impersonating?: boolean
  impersonated_by?: string
}

// Navigation items
export interface NavItem {
  title: string
  href: string
  icon: string
  badge?: string | number
  children?: NavItem[]
}

// API Response types
export interface ApiResponse<T> {
  data: T | null
  error: string | null
  success: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// Form types
export interface LoginFormData {
  email: string
  password: string
}

export interface RegisterFormData {
  email: string
  password: string
  name: string
  organization_name?: string
}

export interface LeadFormData {
  name: string
  email?: string
  phone?: string
  source: string
  status?: import('./database.types').LeadStatus
  custom_fields?: Record<string, string>
}

export interface DemoFormData {
  lead_id: string
  scheduled_at: string
  notes?: string
}

export interface SubscriptionFormData {
  lead_id: string
  validity_days: number
  start_date: string
  deal_value: number
  notes?: string
}

export interface PaymentFormData {
  subscription_id: string
  amount: number
  payment_date: string
  payment_method: import('./database.types').PaymentMethod
  transaction_ref?: string
  notes?: string
}



