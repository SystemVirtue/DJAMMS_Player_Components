# Supabase Implementation Consolidation Plan

## Current State

Three Supabase implementations exist:

1. **`src/services/SupabaseService.ts`** (TypeScript, Electron app)
   - Full-featured singleton service
   - Command listening, state sync, heartbeat
   - Used by: Electron PlayerWindow

2. **`web/shared/supabase-client.ts`** (TypeScript, Web apps)
   - Command sending, state reading
   - Used by: Web Admin, Web Kiosk

3. **`src/integration/supabase-adapter.js`** (Legacy, CommonJS)
   - Basic adapter (outside active codebase)
   - Used by: Legacy QueueOrchestrator (if still used)

## Architecture Principles

- **Electron App = PRIMARY source of truth**
  - All queue state, player state, preferences stored locally
  - Loaded from local profile/state on startup
  - Supabase is SYNC layer only

- **Supabase = SYNC bridge**
  - WEB UI/KIOSK → Commands → Electron (via Supabase)
  - Electron → State Updates → WEB UI/KIOSK (via Supabase)
  - Stores: Active Queue, Priority Queue, Playlists, Preferences

## Consolidation Strategy

### Phase 1: Shared Interface (✅ Completed)
- Created `src/services/SupabaseAdapter.ts` with unified interface
- Shared client factory function
- Common utilities

### Phase 2: Gradual Migration
1. Update `SupabaseService` to implement `ISupabaseAdapter`
2. Update `web/shared/supabase-client.ts` to use shared client factory
3. Extract common operations to shared utilities
4. Maintain backward compatibility during migration

### Phase 3: Full Consolidation
1. Single source of truth for client creation
2. Shared types and interfaces
3. Unified error handling
4. Consistent logging

## Implementation Notes

- Keep Electron and Web implementations separate (different environments)
- Share configuration, types, and utilities
- Maintain clear separation: Electron = server, Web = client
- Use environment variables for all credentials (✅ Completed)

## Benefits

- Consistent behavior across implementations
- Easier maintenance (single source for common logic)
- Better type safety
- Reduced code duplication

