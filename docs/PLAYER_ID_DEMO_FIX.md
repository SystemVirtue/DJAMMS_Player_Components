# Player ID Default Fix - DJAMMS_DEMO

## Problem
The app was hanging at "Initializing" because it was waiting for a Player ID to be set before continuing initialization. With an empty string as the default, the app couldn't proceed.

## Solution
Changed the default Player ID from empty string (`''`) to `'DJAMMS_DEMO'`. This allows the app to:
- Continue initialization even without a user-set Player ID
- Still prompt the user to change the ID on startup
- Allow users to keep "DJAMMS_DEMO" if they want (but will always be prompted)

## Changes Made

### 1. Default Player ID Updated
- **`src/config/supabase.ts`**: Changed `DEFAULT_PLAYER_ID` from `''` to `'DJAMMS_DEMO'`
- **`src/utils/playerUtils.ts`**: Changed `DEFAULT_PLAYER_ID` from `''` to `'DJAMMS_DEMO'`
- **`web/shared/supabase-client.ts`**: Changed `DEFAULT_PLAYER_ID` from `'DEMO_PLAYER'` to `'DJAMMS_DEMO'`

### 2. Initialization Logic Updated
- **`src/utils/playerUtils.ts`**: `initializePlayerId()` now returns `'DJAMMS_DEMO'` instead of empty string
- **`src/pages/PlayerWindow.tsx`**: 
  - Checks for `'DJAMMS_DEMO'` instead of empty string to trigger prompt
  - Sets Player ID to `'DJAMMS_DEMO'` immediately to allow app to continue
  - Supabase initializes with `'DJAMMS_DEMO'` if no other ID is set

### 3. Reset Application Updated
- **`src/pages/PlayerWindow.tsx`**: `handleResetApplication()` now sets Player ID to `'DJAMMS_DEMO'` instead of clearing it

### 4. Alert Message Updated
- Updated the first-run alert to mention that user is currently using "DJAMMS_DEMO"
- Clarifies that user can keep it but a unique ID is recommended

## Behavior

### On First Run or Reset:
1. App initializes with `'DJAMMS_DEMO'` as Player ID
2. App continues initialization (no hang)
3. Supabase initializes with `'DJAMMS_DEMO'`
4. User is prompted to change Player ID (but app is already running)
5. User can:
   - Enter a new unique Player ID (recommended)
   - Keep "DJAMMS_DEMO" (will be prompted again on next startup)

### On Subsequent Runs:
- If user has set a custom Player ID: Uses that ID, no prompt
- If user kept "DJAMMS_DEMO": Uses "DJAMMS_DEMO", shows prompt again

## Testing

To test:
1. Clear Player ID: `localStorage.removeItem('djamms_player_id')`
2. Restart app: Should initialize with "DJAMMS_DEMO" and show prompt
3. App should NOT hang at "Initializing"
4. Supabase should connect with "DJAMMS_DEMO" Player ID

## Files Modified
- `src/config/supabase.ts`
- `src/utils/playerUtils.ts`
- `src/pages/PlayerWindow.tsx`
- `web/shared/supabase-client.ts`

