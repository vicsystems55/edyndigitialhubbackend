import { v2 as cloudinary } from 'cloudinary'
import { env } from './env.js'
import { ApiError } from '../middleware/error-handler.js'

export const isCloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME
  && env.CLOUDINARY_API_KEY
  && env.CLOUDINARY_API_SECRET
  && env.CLOUDINARY_UPLOAD_PRESET,
)

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  })
}

export function requireCloudinaryConfiguration() {
  if (!isCloudinaryConfigured) {
    throw new ApiError(503, 'Cloudinary ebook storage is not configured')
  }
  return cloudinary
}
