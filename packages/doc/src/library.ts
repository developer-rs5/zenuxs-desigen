/**
 * Team libraries: published components, styles and variables, and which of
 * them a document has imported. (Converted 1:1 from FigCraft
 * `crates/doc/src/library.rs`.)
 */

import type { NodeId } from './ids'
import type { Paint } from '@zenuxs/color'

/** The invisible node store a document keeps its imported library content in. */
export const STORE_NAME = 'Library components'

/** A published library's manifest (what a link offers). */
export interface LibraryManifest {
  id: string
  name: string
  version: string
}

export interface LibraryAsset {
  /** The key in the publishing document. */
  key: string
  name: string
  description: string
  /** The component set root, for sets with variants. */
  set?: NodeId | null
}

export interface LibraryStyleEntry {
  key: string
  name: string
  folder?: string
}

export interface LibraryCollectionEntry {
  key: string
  name: string
  modes: number
}

export interface LibraryVariableEntry {
  key: string
  name: string
  collection: string
}

/** What a published library contains. */
export interface PublishedLibrary {
  manifest: LibraryManifest
  assets: LibraryAsset[]
  styles: LibraryStyleEntry[]
  collections: LibraryCollectionEntry[]
  variables: LibraryVariableEntry[]
}

/** A library the document links to. */
export interface LibraryLink {
  id: string
  name: string
  /** The published library (from the server or a file), when loaded. */
  published?: PublishedLibrary | null
}

/** An imported component: the local store root and its remote key. */
export interface ImportedComponent {
  root: NodeId
  remote: string
  /** The library the import came from. */
  library: string
}

/** An imported record (styles and variables use id → remote key). */
export interface ImportedRecord {
  local: string
  remote: string
  library: string
}

export type ImportedStyle = ImportedRecord

/** The document's libraries. */
export interface Libraries {
  enabled: LibraryLink[]
  /** The invisible node store holding imported components. */
  store?: NodeId | null
  components: ImportedComponent[]
  styles: ImportedStyle[]
  collections: ImportedRecord[]
  variables: ImportedRecord[]
}

export const Libraries = {
  empty(): Libraries {
    return { enabled: [], store: null, components: [], styles: [], collections: [], variables: [] }
  },

  is_empty(l: Libraries): boolean {
    return (
      l.enabled.length === 0 &&
      l.components.length === 0 &&
      l.styles.length === 0 &&
      l.collections.length === 0 &&
      l.variables.length === 0
    )
  },

  /** Whether no node or binding still uses the libraries (the store can be dropped). */
  is_unused(l: Libraries): boolean {
    return Libraries.is_empty(l)
  },

  /** Enable (or update) a library link. */
  link(l: Libraries, link: LibraryLink): void {
    const at = l.enabled.findIndex((x) => x.id === link.id)
    if (at >= 0) l.enabled[at] = link
    else l.enabled.push(link)
  },

  /** The import record of local component `root`. */
  import_of(l: Libraries, root: NodeId): ImportedComponent | null {
    return l.components.find((c) => c.root === root) ?? null
  },

  /** The import record of local style `id`. */
  style_import(l: Libraries, id: string): ImportedStyle | null {
    return l.styles.find((s) => s.local === id) ?? null
  },

  /** The import record of local variable `id`. */
  variable_import(l: Libraries, id: string): ImportedRecord | null {
    return l.variables.find((s) => s.local === id) ?? null
  }
}

/** Every image hash referenced by `paints`. */
export function paint_images(paints: Paint[]): Set<string> {
  const out = new Set<string>()
  for (const p of paints) {
    if (p.kind.type === 'image') out.add(p.kind.image)
  }
  return out
}
