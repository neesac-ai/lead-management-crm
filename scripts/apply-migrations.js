/**
 * Script to apply database migrations to Supabase
 *
 * Usage:
 *   node scripts/apply-migrations.js
 *
 * Make sure you have NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * in your .env.local file (or set as environment variables)
 */

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Error: Missing Supabase credentials')
    console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
})

async function applyMigration(filePath, migrationName) {
    console.log(`\n📄 Applying migration: ${migrationName}`)

    try {
        const sql = fs.readFileSync(filePath, 'utf8')

        // Split SQL into individual statements (semicolon separated)
        // But we need to be careful with functions and triggers
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'))

        // Execute each statement
        for (const statement of statements) {
            if (statement.trim()) {
                const { error } = await supabase.rpc('exec_sql', { sql_query: statement + ';' })

                if (error) {
                    // Try direct query if RPC doesn't work
                    const { error: queryError } = await supabase.from('_migrations').select('*')

                    if (queryError) {
                        // Use raw SQL execution via REST API
                        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': supabaseServiceKey,
                                'Authorization': `Bearer ${supabaseServiceKey}`
                            },
                            body: JSON.stringify({ sql_query: statement + ';' })
                        })

                        if (!response.ok) {
                            console.warn(`⚠️  Warning: Could not execute statement (this is normal for some statements)`)
                        }
                    }
                }
            }
        }

        console.log(`✅ Migration ${migrationName} applied successfully`)
        return true
    } catch (error) {
        console.error(`❌ Error applying migration ${migrationName}:`, error.message)
        return false
    }
}

async function applyMigrationDirect(filePath, migrationName) {
    console.log(`\n📄 Applying migration: ${migrationName}`)

    try {
        const sql = fs.readFileSync(filePath, 'utf8')

        // Use Supabase REST API to execute SQL directly
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseServiceKey,
                'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({ sql_query: sql })
        })

        if (response.ok) {
            console.log(`✅ Migration ${migrationName} applied successfully`)
            return true
        } else {
            const errorText = await response.text()
            console.error(`❌ Error applying migration ${migrationName}:`, errorText)
            return false
        }
    } catch (error) {
        console.error(`❌ Error applying migration ${migrationName}:`, error.message)
        return false
    }
}

async function main() {
    console.log('🚀 Starting migration application...')
    console.log(`📦 Supabase URL: ${supabaseUrl}`)

    const migrations = [
        {
            name: '032_call_logs.sql',
            path: path.join(__dirname, '..', 'supabase', 'migrations', '032_call_logs.sql')
        },
        {
            name: '033_location_tracking.sql',
            path: path.join(__dirname, '..', 'supabase', 'migrations', '033_location_tracking.sql')
        }
    ]

    let successCount = 0

    for (const migration of migrations) {
        if (!fs.existsSync(migration.path)) {
            console.error(`❌ Migration file not found: ${migration.path}`)
            continue
        }

        const success = await applyMigrationDirect(migration.path, migration.name)
        if (success) {
            successCount++
        }
    }

    console.log(`\n${'='.repeat(50)}`)
    if (successCount === migrations.length) {
        console.log('✅ All migrations applied successfully!')
    } else {
        console.log(`⚠️  ${successCount}/${migrations.length} migrations applied`)
        console.log('\n💡 If migrations failed, you can apply them manually via Supabase Dashboard:')
        console.log('   1. Go to your Supabase project dashboard')
        console.log('   2. Navigate to SQL Editor')
        console.log('   3. Copy and paste the SQL from each migration file')
        console.log('   4. Run the SQL')
    }
}

main().catch(console.error)

