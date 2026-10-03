import copy, { type Options as ClipboardCopyOptions } from 'copy-to-clipboard'

import type { Vector } from '@open-pencil/scene-graph/primitives'

import type { EditorStore } from '@/app/editor/active-store'
import { isDesignClipboardHTML } from '@/app/editor/clipboard/html'
import {
  clearInMemoryClipboardHTML,
  getInMemoryClipboardHTML,
  setInMemoryClipboardHTML
} from '@/app/editor/clipboard/memory'
import { createClipboardTransfer } from '@/app/editor/clipboard/system/transfer'
import type {
  BrowserClipboardIO,
  BrowserClipboardReadResult,
  ClipboardPayload,
  SystemClipboard
} from '@/app/editor/clipboard/system/types'

function clipboardItem(payload: ClipboardPayload): ClipboardItem | undefined {
  if (typeof Blob === 'undefined' || typeof ClipboardItem === 'undefined') return undefined
  const itemData: Record<string, Blob> = {}
  if (payload.html) itemData['text/html'] = new Blob([payload.html], { type: 'text/html' })
  if (payload.plainText) {
    itemData['text/plain'] = new Blob([payload.plainText], { type: 'text/plain' })
  }
  return new ClipboardItem(itemData)
}

function populateLegacyClipboard(data: DataTransfer, payload: ClipboardPayload): void {
  if (payload.html) data.setData('text/html', payload.html)
  if (payload.plainText) data.setData('text/plain', payload.plainText)
}

function customizeClipboardPayload(
  payload: ClipboardPayload
): NonNullable<ClipboardCopyOptions['onCopy']> {
  return (data) => {
    if (typeof DataTransfer !== 'undefined' && data instanceof DataTransfer) {
      populateLegacyClipboard(data, payload)
      return undefined
    }
    return clipboardItem(payload)
  }
}

async function writeBrowserClipboard(payload: ClipboardPayload): Promise<boolean> {
  const text = payload.html || payload.plainText
  return copy(text, {
    format: payload.html ? 'text/html' : 'text/plain',
    onCopy: customizeClipboardPayload(payload)
  })
}

async function readBrowserClipboardHTML(): Promise<BrowserClipboardReadResult> {
  if (
    typeof navigator === 'undefined' ||
    typeof (navigator as Partial<Navigator>).clipboard?.read !== 'function'
  ) {
    return { available: false }
  }
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      if (!item.types.includes('text/html')) continue
      return { available: true, html: await (await item.getType('text/html')).text() }
    }
    return { available: true, html: null }
  } catch (error) {
    console.warn('Browser clipboard read failed', error)
    return { available: false }
  }
}

// Mirrors the raster types accepted by placeImageFiles; other image flavors are
// skipped so a paste never reports success without inserting anything.
const RASTER_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif'
])

async function readBrowserClipboardImage(): Promise<File | null> {
  if (
    typeof navigator === 'undefined' ||
    typeof (navigator as Partial<Navigator>).clipboard?.read !== 'function'
  ) {
    return null
  }
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      const type = item.types.find((candidate) => RASTER_IMAGE_TYPES.has(candidate))
      if (!type) continue
      const blob = await item.getType(type)
      const extension = type === 'image/jpeg' ? 'jpg' : type.slice('image/'.length)
      return new File([blob], `pasted-image.${extension}`, { type })
    }
    return null
  } catch (error) {
    console.warn('Browser clipboard image read failed', error)
    return null
  }
}

const browserClipboardIO: BrowserClipboardIO = {
  write: writeBrowserClipboard,
  readHTML: readBrowserClipboardHTML,
  readImage: readBrowserClipboardImage
}

async function copySelection(store: EditorStore, io: BrowserClipboardIO): Promise<boolean> {
  try {
    const transfer = createClipboardTransfer()
    await store.writeCopyData(transfer)
    const payload: ClipboardPayload = {
      html: transfer.getData('text/html'),
      plainText: transfer.getData('text/plain')
    }
    if (!payload.html && !payload.plainText) return false
    if (payload.html) setInMemoryClipboardHTML(payload.html, payload.plainText)
    else clearInMemoryClipboardHTML()

    return await io.write(payload)
  } catch (error) {
    console.warn('Browser clipboard copy failed', error)
    return false
  }
}

async function pasteSelection(
  store: EditorStore,
  cursorPos: Vector | undefined,
  io: BrowserClipboardIO
): Promise<boolean> {
  const result = await io.readHTML()
  if (result.available) {
    if (result.html && isDesignClipboardHTML(result.html)) {
      await store.pasteFromHTML(result.html, cursorPos)
      return true
    }
    if (io.readImage) {
      const image = await io.readImage()
      if (image) {
        const { panX, panY, zoom } = store.state
        const cx = cursorPos?.x ?? (-panX + window.innerWidth / 2) / zoom
        const cy = cursorPos?.y ?? (-panY + window.innerHeight / 2) / zoom
        await store.placeImageFiles([image], cx, cy)
        return true
      }
    }
    return false
  }

  const memoryHTML = getInMemoryClipboardHTML()
  if (memoryHTML && isDesignClipboardHTML(memoryHTML)) {
    await store.pasteFromHTML(memoryHTML, cursorPos)
    return true
  }

  return false
}

export function createBrowserSystemClipboard(
  io: BrowserClipboardIO = browserClipboardIO
): SystemClipboard {
  return {
    copy: (store) => copySelection(store, io),
    paste: (store, cursorPos) => pasteSelection(store, cursorPos, io)
  }
}

export const browserSystemClipboard = createBrowserSystemClipboard()
