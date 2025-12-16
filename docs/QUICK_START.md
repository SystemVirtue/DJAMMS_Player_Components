# Quick Start - Running the React Migration

## ⚠️ Important: Run from the Correct Directory

The React migration is in the `DJAMMS_PLAYER_REACT_MIGRATION` subdirectory. You **must** run commands from there.

## Steps to Run Dev Server

1. **Navigate to the React migration directory:**
   ```bash
   cd DJAMMS_PLAYER_REACT_MIGRATION
   ```

2. **Install dependencies (if not already done):**
   ```bash
   npm install
   ```

3. **Run the dev server:**
   ```bash
   npm run dev
   ```

   This will:
   - Start Vite dev server on `http://localhost:3000`
   - Build the Electron main process (TypeScript → JavaScript)
   - Wait for Vite server to be ready
   - Launch Electron app pointing to `http://localhost:3000`

## What You Should See

- Vite dev server starting on port 3000
- Electron window opening
- React app loading (not the old player.html)
- Console logs from React app initialization

## If It Still Hangs

If the app hangs at "Initializing" in the React app:

1. **Check browser console** (DevTools should auto-open)
   - Look for errors or warnings
   - Check if Supabase initialization is blocking

2. **Check terminal output:**
   - Look for Vite compilation errors
   - Check for TypeScript errors
   - Verify Electron main process compiled successfully

3. **Verify Player ID:**
   - The app should now use "DJAMMS_DEMO" as default
   - Should not hang waiting for Player ID

## Building for Distribution

Once dev mode works:

```bash
cd DJAMMS_PLAYER_REACT_MIGRATION
npm run build:electron
```

This will:
- Build the React app (Vite)
- Build the component library (Rollup)
- Build the Electron main process (TypeScript)
- Package with electron-builder

## Troubleshooting

**Problem:** App loads old player.html instead of React app
- **Solution:** Make sure you're in `DJAMMS_PLAYER_REACT_MIGRATION` directory

**Problem:** Vite server doesn't start
- **Solution:** Check if port 3000 is already in use: `lsof -i :3000`

**Problem:** Electron doesn't connect to Vite
- **Solution:** Wait for "VITE ready" message before Electron launches

