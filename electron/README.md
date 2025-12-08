# Electron Main Process

## TypeScript Migration

This directory contains the Electron main process code. We're in the process of migrating from JavaScript to TypeScript.

### Current Status

- **main.cjs** - Current working CommonJS file (used in production)
- **main.ts** - TypeScript source (for future migration)

### Building

The TypeScript source compiles to `main.js` (CommonJS format). To use the TypeScript version:

1. Run `npm run build:electron-main` to compile TypeScript
2. The compiled `main.js` will be created
3. Update `package.json` `main` field to `electron/main.js` when ready

### Migration Path

1. ✅ TypeScript source created (`main.ts`)
2. ✅ TypeScript config created (`tsconfig.json`)
3. ⏳ Gradually migrate functionality from `main.cjs` to `main.ts`
4. ⏳ Update `package.json` to use compiled `main.js`
5. ⏳ Remove `main.cjs` once migration is complete

### Development

For now, `main.cjs` remains the active file. The TypeScript version is available for:
- Type checking during development
- Gradual migration of features
- Better IDE support and autocomplete

