#!/bin/bash
# Build script for Render.com web admin deployment
echo "Building DJAMMS Web Admin for Render.com..."

# Change to web admin directory
cd src/web/admin

# Install dependencies
echo "Installing dependencies..."
npm install

# Build the application
echo "Building application..."
npm run build

echo "Build completed successfully!"
