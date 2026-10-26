// A ready library for the OpenUI CLI, which needs a file that exports one:
//   npx @openuidev/cli generate node_modules/orlune/dist/openui/library.js --spec
// It is its own entry point because building a library makes random ids. Cloudflare Workers forbid that when a module
// loads, so 'orlune/openui' builds nothing at import and this file is for Node and build steps only.
import { buildOrluneLibrary } from './index.js'

export const orluneLibrary = buildOrluneLibrary()
