# BharatCRM

**Digitising MSMEs of Bharat** - A product of [neesac.ai](https://neesac.ai)

A modern, multi-tenant Lead Management CRM built with Next.js and Supabase, designed specifically for Indian MSMEs.

## Features

- **Multi-tenant SaaS Architecture** - Support for multiple organizations with complete data isolation
- **4 User Roles** - Super Admin, Admin, Sales, Accountant with granular permissions
- **Lead Management** - Import leads via CSV/XLSX, manual entry, platform integrations
- **Sales Pipeline** - Kanban board view, status tracking, follow-ups, demo scheduling
- **Google Calendar Integration** - Schedule demos with automatic Google Meet links
- **Subscription Management** - Track customer subscriptions, validity, and renewal dates
- **Finance Module** - Payment tracking, invoice generation, financial reports
- **Notifications** - Email, SMS, and WhatsApp notifications
- **Platform Management** - Super Admin dashboard for managing organizations and billing

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **UI Components**: shadcn/ui
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **State Management**: Zustand
- **Notifications**: Resend (Email), Twilio (SMS), WhatsApp Business API

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd crm
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
   - Copy `.env.example` to `.env.local`
   - Fill in your Supabase credentials and other API keys

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=BharatCRM
```

4. Set up the database:
   - Go to your Supabase project dashboard
   - Navigate to SQL Editor
   - Run the migration script from `supabase/migrations/001_initial_schema.sql`

5. Create your Super Admin user:
   - Register a new account through the app
   - In Supabase SQL Editor, run:
   ```sql
   UPDATE users 
   SET role = 'super_admin', is_approved = true, org_id = NULL 
   WHERE email = 'your-email@example.com';
   ```

6. Start the development server:
```bash
npm run dev
```

7. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
crm/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # Auth pages (login, register)
│   │   ├── (super-admin)/            # Super Admin routes
│   │   ├── (dashboard)/              # Organization dashboard routes
│   │   │   └── [orgSlug]/            # Dynamic org routing
│   │   └── api/                      # API routes
│   ├── components/
│   │   ├── ui/                       # shadcn/ui components
│   │   └── layout/                   # Layout components
│   ├── lib/
│   │   ├── supabase/                 # Supabase client
│   │   └── store/                    # Zustand stores
│   ├── hooks/                        # Custom React hooks
│   └── types/                        # TypeScript types
├── supabase/
│   └── migrations/                   # Database migrations
└── public/
```

## User Roles

| Role | Description |
|------|-------------|
| **Super Admin** | Platform owner - manages organizations, billing, can impersonate users |
| **Admin** | Organization admin - manages team, leads, settings |
| **Sales** | Sales team member - works on assigned leads, schedules demos |
| **Accountant** | Finance role - manages payments, invoices, reminders |

## Database Schema

The CRM uses a multi-tenant architecture with two levels:

1. **Platform Level** (Super Admin)
   - `platform_plans` - SaaS pricing tiers
   - `organizations` - Tenant organizations
   - `org_subscriptions` - Organization billing
   - `platform_settings` - Global settings

2. **Organization Level** (Tenants)
   - `users` - Organization users
   - `leads` - Lead records
   - `lead_activities` - Activity timeline
   - `demos` - Demo scheduling
   - `customer_subscriptions` - Customer subscriptions
   - `payments` - Payment records
   - `invoices` - Invoice records

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.
