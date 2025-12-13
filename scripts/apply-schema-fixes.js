#!/usr/bin/env node
/**
 * Apply schema fixes to Supabase using Management API
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SUPABASE_URL = 'https://lfvhgdbnecjeuciadimx.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmdmhnZGJuZWNqZXVjaWFkaW14Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzY5NzYyMiwiZXhwIjoyMDc5MjczNjIyfQ.ZGqeZ56AR5xAXduI18JybMczl-EQr4ZtWhSWGgr2lGA';
const PROJECT_REF = 'lfvhgdbnecjeuciadimx';

async function executeSQL(sql) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`);
    
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({ query: sql }));
    req.end();
  });
}

async function main() {
  try {
    const sqlFile = path.join(__dirname, '../db/schema-fixes.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    console.log('📄 Reading schema-fixes.sql...');
    console.log('⚠️  Note: Supabase Management API has limited DDL support.');
    console.log('📝 For best results, please run the SQL manually in Supabase Dashboard:');
    console.log(`   https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new\n`);
    
    // Split into statements and try to execute
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.match(/^SELECT/i));
    
    console.log(`Found ${statements.length} statements to execute\n`);
    
    // The Management API doesn't support DDL directly, so we'll provide instructions
    console.log('❌ Direct execution via API is not supported for DDL statements.');
    console.log('✅ Please use the Supabase Dashboard SQL Editor instead.\n');
    console.log('📋 Steps:');
    console.log('1. Open: https://supabase.com/dashboard/project/lfvhgdbnecjeuciadimx/sql/new');
    console.log('2. Copy contents of db/schema-fixes.sql');
    console.log('3. Paste and run');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();

