/**
 * Document endpoints.
 *
 * Previously the owner was taken from `?ownerSub=` / `x-user-sub`, the list
 * returned every document in the collection to an anonymous caller, and reads
 * and deletes were keyed on `documentId` alone. Any visitor could therefore
 * read, overwrite, or destroy another user's design.
 *
 * The owner is now taken exclusively from the verified session, and every query
 * is scoped by it. A document owned by somebody else is reported as missing so
 * the response does not confirm that the id exists.
 */

import { Router, type Response } from 'express'
import * as v from 'valibot'

import type { SessionService } from '../auth/session-service.js'
import { DesignDocument } from '../db/models/Document.js'
import { requireSubject, type AuthenticatedRequest } from '../middleware/auth.js'
import { documentIdSchema, documentSaveSchema, formatIssues } from '../validation/schemas.js'

export interface DocumentsRouterDeps {
  sessions: SessionService
}

export function createDocumentsRouter(_deps: DocumentsRouterDeps): Router {
  const router = Router()

  /** GET /api/documents — lists only the caller's own documents. */
  router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    const sub = requireSubject(req)
    const documents = await DesignDocument.find({ ownerSub: sub })
      .sort({ updatedAt: -1 })
      .select('-payload')
      .lean()
    const formatted = documents.map((doc) => ({
      ...doc,
      previewDataURL: doc.previewDataUrl ?? (doc as { previewDataURL?: string }).previewDataURL
    }))
    res.json({ success: true, documents: formatted })
  })

  /** GET /api/documents/:id — reads a document the caller owns. */
  router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
    const parsed = v.safeParse(documentIdSchema, req.params.id)
    if (!parsed.success) {
      res.status(404).json({ error: 'Document not found' })
      return
    }
    const document = await DesignDocument.findOne({
      documentId: parsed.output,
      ownerSub: requireSubject(req)
    }).lean()
    if (!document) {
      res.status(404).json({ error: 'Document not found' })
      return
    }
    const formatted = {
      ...document,
      previewDataURL:
        document.previewDataUrl ?? (document as { previewDataURL?: string }).previewDataURL
    }
    res.json({ success: true, document: formatted })
  })

  /**
   * POST /api/documents — creates or updates a document owned by the caller.
   *
   * The upsert is scoped by owner as well as id, and an id already held by
   * another user is refused rather than taken over.
   */
  router.post('/', async (req: AuthenticatedRequest, res: Response) => {
    const sub = requireSubject(req)
    const parsed = v.safeParse(documentSaveSchema, req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: 'Invalid document payload', detail: formatIssues(parsed.issues) })
      return
    }
    const { documentId, title, payload, previewDataURL } = parsed.output

    const existing = await DesignDocument.findOne({ documentId }).select('ownerSub').lean()
    if (existing && existing.ownerSub !== sub) {
      res.status(409).json({ error: 'Document id already in use' })
      return
    }

    const fields: Record<string, unknown> = {
      title: title ?? 'Untitled Document',
      payload
    }
    // The API uses canonical `previewDataURL`; the stored field keeps its
    // original name so existing documents remain readable.
    if (previewDataURL !== undefined) fields.previewDataUrl = previewDataURL

    const document = await DesignDocument.findOneAndUpdate(
      { documentId, ownerSub: sub },
      {
        $set: fields,
        $setOnInsert: { documentId, ownerSub: sub }
      },
      { upsert: true, new: true, runValidators: true }
    ).lean()

    res.json({ success: true, document })
  })

  /** DELETE /api/documents/:id — deletes a document the caller owns. */
  router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
    const parsed = v.safeParse(documentIdSchema, req.params.id)
    if (!parsed.success) {
      res.status(404).json({ error: 'Document not found' })
      return
    }
    const result = await DesignDocument.deleteOne({
      documentId: parsed.output,
      ownerSub: requireSubject(req)
    })
    if (result.deletedCount === 0) {
      res.status(404).json({ error: 'Document not found' })
      return
    }
    res.json({ success: true, deletedCount: result.deletedCount })
  })

  return router
}
