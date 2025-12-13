#!/usr/bin/env node
/**
 * Script to run schema-fixes.sql on Supabase
 * Uses Supabase Management API to execute SQL
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Get Supabase URL and service role key from environment or use defaults
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lfvhgdbnecjeuciadimx.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.error('   Get it from: Supabase Dashboard → Settings → API → service_role key');
  process.exit(1);
}

async function runSchemaFixes() {
  try {
    // Read the SQL file
    const sqlFile = path.join(__dirname, '../db/schema-fixes.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    console.log('📄 Read schema-fixes.sql');
    console.log('🔌 Connecting to Supabase...');

    // Create Supabase client with service role key (has admin privileges)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false
      }
    });

    // Split SQL into individual statements (basic splitting by semicolon)
    // Note: This is a simple approach. For production, use a proper SQL parser
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📊 Executing ${statements.length} SQL statements...`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip comment-only lines and verification queries
      if (statement.startsWith('--') || statement.match(/^SELECT/i)) {
        continue;
      }

      try {
        // Use RPC to execute SQL (if available) or use REST API
        // Note: Supabase REST API doesn't directly support DDL, so we'll use psql approach
        console.log(`\n[${i + 1}/${statements.length}] Executing statement...`);
        
        // For DDL statements, we need to use the database connection directly
        // This script requires psql or the Management API
        console.log('⚠️  Direct SQL execution via REST API is limited.');
        console.log('   Please run the SQL in Supabase Dashboard → SQL Editor');
        break;
      } catch (error) {
        console.error(`❌ Error executing statement ${i + 1}:`, error.message);
        errorCount++;
      }
    }

    if (errorCount === 0 && successCount > 0) {
      console.log(`\n✅ Successfully executed ${successCount} statements`);
    } else {
      console.log(`\n⚠️  Completed with ${errorCount} errors`);
    }

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Alternative: Use Supabase Management API
async function runViaManagementAPI() {
  console.log('📝 Note: Supabase REST API has limited DDL support.');
  console.log('📝 For best results, run db/schema-fixes.sql in Supabase Dashboard → SQL Editor');
  console.log('\n🔗 Dashboard URL: https://supabase.com/dashboard/project/lfvhgdbnecjeuciadimx/sql/new');
}

if (require.main === module) {
  runViaManagementAPI();
}

module.exports = { runSchemaFixes };

