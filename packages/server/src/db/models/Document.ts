import mongoose, { Document, Schema } from 'mongoose'

export interface IDesignDocument extends Document {
  documentId: string
  ownerSub: string
  title: string
  payload: Record<string, unknown>
  previewDataUrl?: string
  version: number
  createdAt: Date
  updatedAt: Date
}

const DesignDocumentSchema = new Schema<IDesignDocument>(
  {
    documentId: { type: String, required: true, unique: true, index: true },
    ownerSub: { type: String, required: true, index: true },
    title: { type: String, required: true, default: 'Untitled Document' },
    payload: { type: Schema.Types.Mixed, required: true, default: {} },
    previewDataUrl: { type: String },
    version: { type: Number, default: 1 }
  },
  { timestamps: true }
)

export const DesignDocument = mongoose.model<IDesignDocument>('DesignDocument', DesignDocumentSchema)
