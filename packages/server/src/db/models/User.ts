import mongoose, { Document, Schema } from 'mongoose'

export interface IUser extends Document {
  sub: string
  email?: string
  name?: string
  picture?: string
  lastLoginAt: Date
  createdAt: Date
  updatedAt: Date
}

const UserSchema = new Schema<IUser>(
  {
    sub: { type: String, required: true, unique: true, index: true },
    email: { type: String, index: true },
    name: { type: String },
    picture: { type: String },
    lastLoginAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
)

export const User = mongoose.model<IUser>('User', UserSchema)
