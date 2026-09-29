import mongoose, { type Document, Schema } from 'mongoose'

/**
 * Server-side session record.
 *
 * Only a SHA-256 hash of the session token is persisted, so a database leak
 * does not hand out usable session cookies. The raw token exists solely in the
 * user's `HttpOnly` cookie.
 */
export interface ISession extends Document {
  tokenHash: string
  sub: string
  csrfHash: string
  createdAt: Date
  lastUsedAt: Date
  expiresAt: Date
  revokedAt?: Date
  userAgent?: string
  ip?: string
}

const SessionSchema = new Schema<ISession>(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    sub: { type: String, required: true, index: true },
    csrfHash: { type: String, required: true },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    userAgent: { type: String, maxlength: 512 },
    ip: { type: String, maxlength: 64 }
  },
  { timestamps: true }
)

// Let MongoDB reclaim expired sessions on its own.
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const Session = mongoose.model<ISession>('Session', SessionSchema)
