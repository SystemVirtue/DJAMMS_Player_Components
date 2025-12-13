#!/usr/bin/env node
/**
 * Apply schema fixes directly using Supabase client with service role key
 * This uses the REST API to execute SQL statements
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://lfvhgdbnecjeuciadimx.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmdmhnZGJuZWNqZXVjaWFkaW14Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzY5NzYyMiwiZXhwIjoyMDc5MjczNjIyfQ.ZGqeZ56AR5xAXduI18JybMczl-EQr4ZtWhSWGgr2lGA';

async function executeSQLStatement(supabase, sql) {
  // Use RPC to execute SQL - Supabase doesn't expose direct SQL execution via REST
  // So we'll need to use the database connection directly
  // For now, we'll use a workaround with the REST API's query endpoint
  
  try {
    // Try using the REST API's query method (if available)
    // Note: This may not work for all DDL statements
    const response = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (response.error) {
      throw response.error;
    }
    
    return { success: true, data: response.data };
  } catch (error) {
    // Fallback: The REST API doesn't support DDL directly
    // We need to use psql or the Supabase Dashboard
    throw new Error('Direct SQL execution via REST API is not supported. Use Supabase Dashboard SQL Editor or psql.');
  }
}

async function main() {
  try {
    console.log('🔧 Applying Supabase Schema Fixes\n');
    
    // Read SQL file
    const sqlFile = path.join(__dirname, '../db/schema-fixes.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    console.log('📄 Read schema-fixes.sql');
    
    // Create Supabase client with service role key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });
    
    console.log('🔌 Connected to Supabase\n');
    
    // The Supabase REST API doesn't support DDL statements directly
    // We need to use psql or the Dashboard
    console.log('⚠️  Supabase REST API does not support DDL statements (CREATE, ALTER, etc.)');
    console.log('📝 The SQL must be executed via one of these methods:\n');
    
    console.log('✅ METHOD 1: Supabase Dashboard (Recommended)');
    console.log('   1. Open: https://supabase.com/dashboard/project/lfvhgdbnecjeuciadimx/sql/new');
    console.log('   2. Copy contents of: db/schema-fixes.sql');
    console.log('   3. Paste and click "Run"\n');
    
    console.log('✅ METHOD 2: psql (If you have database password)');
    console.log('   Get connection string from: Dashboard → Settings → Database');
    console.log('   Then run: psql "[CONNECTION_STRING]" -f db/schema-fixes.sql\n');
    
    console.log('📋 SQL file location: ' + sqlFile);
    console.log('📋 File size: ' + (sql.length / 1024).toFixed(2) + ' KB');
    console.log('📋 Statements: ~' + (sql.split(';').length - 1) + ' statements\n');
    
    // Try to at least verify the connection works
    console.log('🔍 Testing Supabase connection...');
    const { data, error } = await supabase.from('player_state').select('count').limit(1);
    
    if (error) {
      console.log('❌ Connection test failed:', error.message);
    } else {
      console.log('✅ Connection successful!');
    }
    
    console.log('\n💡 Tip: The fastest way is to use the Supabase Dashboard SQL Editor.');
    console.log('   All SQL statements are in: db/schema-fixes.sql');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();

