export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Enums
export type UserRole = 'super_admin' | 'admin' | 'sales' | 'accountant'
export type OrgStatus = 'pending' | 'active' | 'suspended' | 'deleted'
export type LeadStatus =
  | 'new'
  | 'call_not_picked'
  | 'not_interested'
  | 'follow_up_again'
  | 'demo_booked'
  | 'demo_completed'
  | 'deal_won'
  | 'deal_lost'
export type DemoStatus = 'scheduled' | 'completed' | 'cancelled' | 'rescheduled'
export type SubscriptionStatus = 'active' | 'expiring_soon' | 'expired' | 'cancelled'
export type PaymentMethod = 'cash' | 'bank_transfer' | 'upi' | 'card' | 'cheque' | 'other'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
export type BillingCycle = 'monthly' | 'yearly'
export type OrgSubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'trialing'

export interface Database {
  public: {
    Tables: {
      // Platform-Level Tables
      platform_plans: {
        Row: {
          id: string
          name: string
          description: string | null
          monthly_price: number
          yearly_price: number
          max_users: number
          max_leads_per_month: number
          features: Json
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          monthly_price: number
          yearly_price: number
          max_users: number
          max_leads_per_month: number
          features?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          monthly_price?: number
          yearly_price?: number
          max_users?: number
          max_leads_per_month?: number
          features?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          org_code: string
          logo_url: string | null
          status: OrgStatus
          settings: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          org_code: string
          logo_url?: string | null
          status?: OrgStatus
          settings?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          org_code?: string
          logo_url?: string | null
          status?: OrgStatus
          settings?: Json
          created_at?: string
          updated_at?: string
        }
      }
      org_subscriptions: {
        Row: {
          id: string
          org_id: string
          plan_id: string
          billing_cycle: BillingCycle
          start_date: string
          end_date: string
          status: OrgSubscriptionStatus
          stripe_subscription_id: string | null
          stripe_customer_id: string | null
          amount_due: number
          amount_paid: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          plan_id: string
          billing_cycle: BillingCycle
          start_date: string
          end_date: string
          status?: OrgSubscriptionStatus
          stripe_subscription_id?: string | null
          stripe_customer_id?: string | null
          amount_due?: number
          amount_paid?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          plan_id?: string
          billing_cycle?: BillingCycle
          start_date?: string
          end_date?: string
          status?: OrgSubscriptionStatus
          stripe_subscription_id?: string | null
          stripe_customer_id?: string | null
          amount_due?: number
          amount_paid?: number
          created_at?: string
          updated_at?: string
        }
      }
      users: {
        Row: {
          id: string
          auth_id: string
          org_id: string | null
          email: string
          name: string
          avatar_url: string | null
          role: UserRole
          lead_allocation_percent: number
          is_approved: boolean
          is_active: boolean
          approved_by: string | null
          approved_at: string | null
          google_access_token: string | null
          google_refresh_token: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          auth_id: string
          org_id?: string | null
          email: string
          name: string
          avatar_url?: string | null
          role?: UserRole
          lead_allocation_percent?: number
          is_approved?: boolean
          is_active?: boolean
          approved_by?: string | null
          approved_at?: string | null
          google_access_token?: string | null
          google_refresh_token?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          auth_id?: string
          org_id?: string | null
          email?: string
          name?: string
          avatar_url?: string | null
          role?: UserRole
          lead_allocation_percent?: number
          is_approved?: boolean
          is_active?: boolean
          approved_by?: string | null
          approved_at?: string | null
          google_access_token?: string | null
          google_refresh_token?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      drive_sync_settings: {
        Row: {
          id: string
          user_id: string
          org_id: string
          folder_id: string | null
          folder_name: string | null
          is_enabled: boolean
          last_sync_at: string | null
          last_sync_file_count: number
          sync_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          org_id: string
          folder_id?: string | null
          folder_name?: string | null
          is_enabled?: boolean
          last_sync_at?: string | null
          last_sync_file_count?: number
          sync_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          org_id?: string
          folder_id?: string | null
          folder_name?: string | null
          is_enabled?: boolean
          last_sync_at?: string | null
          last_sync_file_count?: number
          sync_error?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      impersonation_logs: {
        Row: {
          id: string
          super_admin_id: string
          target_user_id: string
          reason: string
          started_at: string
          ended_at: string | null
        }
        Insert: {
          id?: string
          super_admin_id: string
          target_user_id: string
          reason: string
          started_at?: string
          ended_at?: string | null
        }
        Update: {
          id?: string
          super_admin_id?: string
          target_user_id?: string
          reason?: string
          started_at?: string
          ended_at?: string | null
        }
      }
      platform_settings: {
        Row: {
          id: string
          key: string
          value: Json
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          key: string
          value: Json
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          key?: string
          value?: Json
          description?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      // Organization-Level Tables
      leads: {
        Row: {
          id: string
          org_id: string
          assigned_to: string | null
          name: string
          email: string | null
          phone: string | null
          source: string
          status: LeadStatus
          custom_fields: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          assigned_to?: string | null
          name: string
          email?: string | null
          phone?: string | null
          source?: string
          status?: LeadStatus
          custom_fields?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          assigned_to?: string | null
          name?: string
          email?: string | null
          phone?: string | null
          source?: string
          status?: LeadStatus
          custom_fields?: Json
          created_at?: string
          updated_at?: string
        }
      }
      lead_activities: {
        Row: {
          id: string
          lead_id: string
          user_id: string
          action_type: string
          comments: string | null
          action_date: string
          next_followup: string | null
          product_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          user_id: string
          action_type: string
          comments?: string | null
          action_date?: string
          next_followup?: string | null
          product_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          user_id?: string
          action_type?: string
          comments?: string | null
          action_date?: string
          next_followup?: string | null
          product_id?: string | null
          created_at?: string
        }
      }
      products: {
        Row: {
          id: string
          org_id: string
          name: string
          description: string | null
          pitch_points: string[] | null
          images: string[] | null
          demo_link: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          description?: string | null
          pitch_points?: string[] | null
          images?: string[] | null
          demo_link?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          description?: string | null
          pitch_points?: string[] | null
          images?: string[] | null
          demo_link?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      lead_sources: {
        Row: {
          id: string
          org_id: string
          name: string
          type: string
          config: Json
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          type: string
          config?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          type?: string
          config?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      demos: {
        Row: {
          id: string
          lead_id: string
          scheduled_at: string
          google_meet_link: string | null
          calendar_event_id: string | null
          status: DemoStatus
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          scheduled_at: string
          google_meet_link?: string | null
          calendar_event_id?: string | null
          status?: DemoStatus
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          scheduled_at?: string
          google_meet_link?: string | null
          calendar_event_id?: string | null
          status?: DemoStatus
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      customer_subscriptions: {
        Row: {
          id: string
          org_id: string
          lead_id: string
          start_date: string
          end_date: string
          validity_days: number
          status: SubscriptionStatus
          deal_value: number
          amount_credited: number
          amount_pending: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          lead_id: string
          start_date: string
          end_date: string
          validity_days: number
          status?: SubscriptionStatus
          deal_value: number
          amount_credited?: number
          amount_pending?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          lead_id?: string
          start_date?: string
          end_date?: string
          validity_days?: number
          status?: SubscriptionStatus
          deal_value?: number
          amount_credited?: number
          amount_pending?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      payments: {
        Row: {
          id: string
          subscription_id: string
          amount: number
          payment_date: string
          payment_method: PaymentMethod
          transaction_ref: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          subscription_id: string
          amount: number
          payment_date: string
          payment_method: PaymentMethod
          transaction_ref?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          subscription_id?: string
          amount?: number
          payment_date?: string
          payment_method?: PaymentMethod
          transaction_ref?: string | null
          notes?: string | null
          created_at?: string
        }
      }
      invoices: {
        Row: {
          id: string
          subscription_id: string
          invoice_number: string
          amount: number
          issue_date: string
          due_date: string
          status: InvoiceStatus
          pdf_url: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          subscription_id: string
          invoice_number: string
          amount: number
          issue_date: string
          due_date: string
          status?: InvoiceStatus
          pdf_url?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          subscription_id?: string
          invoice_number?: string
          amount?: number
          issue_date?: string
          due_date?: string
          status?: InvoiceStatus
          pdf_url?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      user_role: UserRole
      org_status: OrgStatus
      lead_status: LeadStatus
      demo_status: DemoStatus
      subscription_status: SubscriptionStatus
      payment_method: PaymentMethod
      invoice_status: InvoiceStatus
      billing_cycle: BillingCycle
      org_subscription_status: OrgSubscriptionStatus
    }
  }
}

// Helper types
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']

// Convenience types
export type User = Tables<'users'>
export type Organization = Tables<'organizations'>
export type Lead = Tables<'leads'>
export type LeadActivity = Tables<'lead_activities'>
export type Demo = Tables<'demos'>
export type CustomerSubscription = Tables<'customer_subscriptions'>
export type Payment = Tables<'payments'>
export type Invoice = Tables<'invoices'>
export type PlatformPlan = Tables<'platform_plans'>
export type OrgSubscription = Tables<'org_subscriptions'>
export type ImpersonationLog = Tables<'impersonation_logs'>
export type PlatformSetting = Tables<'platform_settings'>
export type LeadSource = Tables<'lead_sources'>
export type Product = Tables<'products'>
