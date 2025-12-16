#!/bin/bash
# Build script for Render.com web admin deployment
echo "Building DJAMMS Web Admin for Render.com..."

# Ensure we're in the project root
if [ ! -f "package.json" ]; then
    echo "Error: Not in project root directory"
    exit 1
fi

# Change to web admin directory
echo "Changing to web admin directory..."
cd src/web/admin

# Verify we're in the right place
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
    echo "Error: Not in web admin directory"
    exit 1
fi

# Clean any existing node_modules to ensure fresh install
echo "Cleaning existing node_modules..."
rm -rf node_modules package-lock.json

# Install dependencies
echo "Installing dependencies..."
npm install

# Verify supabase dependency is installed
if [ ! -d "node_modules/@supabase" ]; then
    echo "Error: Supabase dependency not installed"
    exit 1
fi

# Build the application
echo "Building application..."
npm run build

# Verify build output
if [ ! -d "dist" ]; then
    echo "Error: Build did not create dist directory"
    exit 1
fi

echo "Build completed successfully!"
ls -la dist/

