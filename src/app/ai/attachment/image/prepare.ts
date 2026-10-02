import type {
  ImageAttachmentMediaType,
  PreparedImageAttachment
} from '@/app/ai/attachment/image/types'
import { boundedImageScale } from '@/app/ai/tools/vision'

const MAX_IMAGE_FILE_BYTES = 20 * 1024 * 1024
const MAX_IMAGE_PIXELS = 40_000_000
export const IMAGE_ATTACHMENT_MAX_EDGE = 1280

/** Failure categories for image preparation so callers can map them to clear copy. */
export type ImageAttachmentErrorCode =
  | 'unsupported-type'
  | 'file-too-large'
  | 'decode-failed'
  | 'too-many-pixels'
  | 'invalid-dimensions'
  | 'unavailable'

const IMAGE_ATTACHMENT_ERROR_MESSAGES: Record<ImageAttachmentErrorCode, string> = {
  'unsupported-type': 'Choose a PNG, JPEG, or WebP image.',
  'file-too-large': 'Images must be 20 MB or smaller.',
  'decode-failed': 'This image could not be read. It may be corrupted or not an image.',
  'too-many-pixels': 'Image dimensions are too large. Use an image under 40 megapixels.',
  'invalid-dimensions': 'Image has invalid dimensions.',
  unavailable: 'Image attachments are unavailable in this environment.'
}

export class ImageAttachmentError extends Error {
  readonly code: ImageAttachmentErrorCode

  constructor(code: ImageAttachmentErrorCode) {
    super(IMAGE_ATTACHMENT_ERROR_MESSAGES[code])
    this.name = 'ImageAttachmentError'
    this.code = code
  }
}

/** User-facing copy for a preparation failure; never includes raw error details. */
export function imageAttachmentErrorMessage(error: unknown): string {
  if (error instanceof ImageAttachmentError) return error.message
  return IMAGE_ATTACHMENT_ERROR_MESSAGES['decode-failed']
}

export function createImagePreviewURL(blob: Blob): string {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new TypeError('Image attachments are unavailable in this environment.')
  }
  return URL.createObjectURL(blob)
}

export function revokeImagePreviewURL(url: string): void {
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url)
  }
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const

/**
 * Content-based type detection: the declared `file.type` and file name are
 * untrusted, so the media type comes from magic bytes and drives re-encoding.
 */
async function sniffImageMediaType(file: File): Promise<ImageAttachmentMediaType> {
  if (file.size > MAX_IMAGE_FILE_BYTES) throw new ImageAttachmentError('file-too-large')
  if (file.size === 0) throw new ImageAttachmentError('unsupported-type')
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...head.subarray(start, start + length))
  if (PNG_MAGIC.every((byte, index) => head[index] === byte)) return 'image/png'
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp'
  throw new ImageAttachmentError('unsupported-type')
}

/**
 * Attachment-time validation: size, magic bytes, and a real decode, so spoofed
 * MIME types and truncated files are rejected before they enter the drafts.
 */
export async function validateImageAttachmentFile(file: File): Promise<string | null> {
  try {
    await sniffImageMediaType(file)
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file)
      try {
        if (bitmap.width === 0 || bitmap.height === 0)
          throw new ImageAttachmentError('decode-failed')
        if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
          throw new ImageAttachmentError('too-many-pixels')
        }
      } finally {
        bitmap.close()
      }
    }
    // ponytail: without createImageBitmap, decode/pixel checks still run at send time in prepareImageAttachment.
    return null
  } catch (error) {
    return imageAttachmentErrorMessage(error)
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new ImageAttachmentError('decode-failed'))
    image.src = url
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mediaType: ImageAttachmentMediaType,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new ImageAttachmentError('decode-failed'))
      },
      mediaType,
      quality
    )
  })
}

export async function prepareImageAttachment(
  file: File,
  maxEdge = IMAGE_ATTACHMENT_MAX_EDGE
): Promise<PreparedImageAttachment> {
  if (
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    typeof Image === 'undefined' ||
    typeof document === 'undefined'
  ) {
    throw new ImageAttachmentError('unavailable')
  }

  const mediaType = await sniffImageMediaType(file)
  const sourceURL = createImagePreviewURL(file)
  try {
    const image = await loadImage(sourceURL)
    if (image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS) {
      throw new ImageAttachmentError('too-many-pixels')
    }
    const scale = boundedImageScale(image.naturalWidth, image.naturalHeight, maxEdge)
    if (scale <= 0) throw new ImageAttachmentError('invalid-dimensions')

    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new ImageAttachmentError('unavailable')
    context.drawImage(image, 0, 0, width, height)
    const blob = await canvasToBlob(canvas, mediaType, mediaType === 'image/png' ? undefined : 0.88)

    return {
      data: new Uint8Array(await blob.arrayBuffer()),
      blob,
      mediaType,
      originalWidth: image.naturalWidth,
      originalHeight: image.naturalHeight,
      width,
      height
    }
  } finally {
    revokeImagePreviewURL(sourceURL)
  }
}
