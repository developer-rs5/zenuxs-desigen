import mongoose, { Document, Schema } from 'mongoose'

export interface IUserSettings extends Document {
  ownerSub: string
  credentials: Record<string, string>
  aiModelSettings: Record<string, unknown>
  mcpServers: Record<string, unknown>
  skills: Record<string, unknown>
  updatedAt: Date
}

const UserSettingsSchema = new Schema<IUserSettings>(
  {
    ownerSub: { type: String, required: true, unique: true, index: true },
    credentials: { type: Schema.Types.Mixed, default: {} },
    aiModelSettings: { type: Schema.Types.Mixed, default: {} },
    mcpServers: { type: Schema.Types.Mixed, default: {} },
    skills: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
)

export const UserSettings = mongoose.model<IUserSettings>('UserSettings', UserSettingsSchema)
