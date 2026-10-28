import { KIND_COMPONENT, type OrluneSources, type SourceKind } from './SourcesContext.js'

export type CatalogEntry = { name: string; source: SourceKind; props: { source: 'string'; title: 'string' }; ids: string[] }

/**
 * What a model is allowed to place, as plain data you can hand to another catalog format or a prompt. Each entry names a
 * component, the kind of source it reads, and the ids you hold. A model chooses an entry and an id; the figures stay yours.
 */
export function orluneCatalog(sources: OrluneSources): CatalogEntry[] {
  return (Object.keys(sources) as SourceKind[])
    .filter((k) => Object.keys(sources[k] ?? {}).length > 0)
    .map((k) => ({ name: KIND_COMPONENT[k], source: k, props: { source: 'string', title: 'string' }, ids: Object.keys(sources[k]!) }))
}

/**
 * A tool definition that points at a UI resource, in the shape MCP Apps uses (`_meta.ui.resourceUri`). The resource itself,
 * a page that renders the component in a sandboxed frame, is yours to serve at the `ui://` address.
 */
export function mcpAppTool(t: { name: string; description: string; inputSchema: Record<string, unknown>; resourceUri: `ui://${string}` }) {
  return { name: t.name, description: t.description, inputSchema: t.inputSchema, _meta: { ui: { resourceUri: t.resourceUri } } }
}
