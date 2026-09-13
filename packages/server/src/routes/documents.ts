import { Router } from 'express'
import { DesignDocument } from '../db/models/Document.js'

export const documentsRouter = Router()

/**
 * GET /api/documents
 * List all documents for a given owner or all documents if unauthenticated/public
 */
documentsRouter.get('/', async (req, res) => {
  try {
    const ownerSub = (req.query.ownerSub as string) || (req.headers['x-user-sub'] as string)
    const query = ownerSub ? { ownerSub } : {}
    const docs = await DesignDocument.find(query).sort({ updatedAt: -1 }).select('-payload')
    return res.json({ success: true, documents: docs })
  } catch (error) {
    console.error('[Documents List Error]', error)
    return res.status(500).json({ error: 'Failed to list documents' })
  }
})

/**
 * GET /api/documents/:id
 * Retrieve full document payload by ID
 */
documentsRouter.get('/:id', async (req, res) => {
  try {
    const doc = await DesignDocument.findOne({ documentId: req.params.id })
    if (!doc) return res.status(404).json({ error: 'Document not found' })
    return res.json({ success: true, document: doc })
  } catch (error) {
    console.error('[Document Get Error]', error)
    return res.status(500).json({ error: 'Failed to get document' })
  }
})

/**
 * POST /api/documents
 * Create or save a design document
 */
documentsRouter.post('/', async (req, res) => {
  try {
    const { documentId, title, payload, previewDataUrl, ownerSub } = req.body
    if (!documentId || !payload) {
      return res.status(400).json({ error: 'Missing documentId or payload' })
    }

    const sub = ownerSub || (req.headers['x-user-sub'] as string) || 'anonymous'
    const doc = await DesignDocument.findOneAndUpdate(
      { documentId },
      {
        documentId,
        ownerSub: sub,
        title: title || 'Untitled Document',
        payload,
        ...(previewDataUrl && { previewDataUrl }),
        $inc: { version: 1 }
      },
      { upsert: true, new: true }
    )

    return res.json({ success: true, document: doc })
  } catch (error) {
    console.error('[Document Save Error]', error)
    return res.status(500).json({ error: 'Failed to save document' })
  }
})

/**
 * DELETE /api/documents/:id
 * Delete a document by ID
 */
documentsRouter.delete('/:id', async (req, res) => {
  try {
    const result = await DesignDocument.deleteOne({ documentId: req.params.id })
    return res.json({ success: true, deletedCount: result.deletedCount })
  } catch (error) {
    console.error('[Document Delete Error]', error)
    return res.status(500).json({ error: 'Failed to delete document' })
  }
})
