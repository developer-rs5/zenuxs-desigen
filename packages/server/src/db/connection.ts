import mongoose from 'mongoose'

export async function connectDB(mongoUri?: string): Promise<typeof mongoose> {
  const uri = mongoUri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/zenuxs-desigen'
  try {
    const conn = await mongoose.connect(uri)
    console.log(`[MongoDB] Connected to database: ${conn.connection.host}/${conn.connection.name}`)
    return conn
  } catch (error) {
    console.error('[MongoDB] Connection error:', error)
    throw error
  }
}
