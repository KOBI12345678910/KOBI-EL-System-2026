/**
 * onyx-ai/src/index.ts — re-export shim (Agent-218 consolidation).
 *
 * Historical:
 *   This file used to be a 3048-line second copy of OnyxPlatform that drifted
 *   from src/onyx-platform.ts. Agent-03 audit identified it as a stale duplicate
 *   that nonetheless held all bridge endpoints. Agent-218 ported the endpoints
 *   into onyx-platform.ts and demoted this file to a re-export shim so that:
 *     - package.json `"main": "dist/index.js"` keeps working
 *     - `node dist/index.js` keeps booting
 *     - any external `require('onyx-ai')` import keeps resolving
 *
 * The bootstrap logic now lives in onyx-platform.ts as `bootstrap()`. We call
 * it here when this file is the main module so `node dist/index.js` keeps
 * booting the platform exactly as before.
 */
import { bootstrap } from './onyx-platform';
export * from './onyx-platform';

if (require.main === module) {
  bootstrap();
}
