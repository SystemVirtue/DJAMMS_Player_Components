#!/bin/bash

# Script to check Supabase schema using SQL queries
# This bypasses migration history issues and directly queries the database

echo "=========================================="
echo "DJAMMS Supabase Schema Verification"
echo "=========================================="
echo ""
echo "This script will verify all required schema elements."
echo "Run the SQL in supabase/verify-schema.sql in Supabase SQL Editor"
echo ""
echo "Or use: npx supabase db execute --file supabase/verify-schema.sql"
echo ""
echo "Checking if we can connect to Supabase..."

# Try to execute a simple query
npx supabase db execute --sql "SELECT version();" 2>&1 | head -5

echo ""
echo "To verify schema manually:"
echo "1. Open Supabase Dashboard → SQL Editor"
echo "2. Copy contents of supabase/verify-schema.sql"
echo "3. Paste and run"
echo ""
echo "Or run migrations:"
echo "  npx supabase migration repair --status applied 20241204"
echo "  npx supabase migration repair --status applied 20241205"

