import type { UploadApiResponse } from 'cloudinary'
import { env } from '../config/env.js'
import { requireCloudinaryConfiguration } from '../config/cloudinary.js'

export type EbookAsset = {
  publicId: string
  version: string
  format: string
  bytes: number
  originalName: string
}

export function uploadEbook(buffer: Buffer, originalName: string, slug: string) {
  const cloudinary = requireCloudinaryConfiguration()

  return new Promise<EbookAsset>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      resource_type: 'raw',
      type: 'authenticated',
      upload_preset: env.CLOUDINARY_UPLOAD_PRESET,
      folder: env.CLOUDINARY_EBOOK_FOLDER,
      public_id: `${slug}-${Date.now()}`,
      allowed_formats: ['pdf'],
      overwrite: false,
      tags: ['edyn-ebook', slug],
    }, (error, result) => {
      if (error || !result) return reject(error || new Error('Cloudinary returned no upload result'))
      const upload = result as UploadApiResponse
      resolve({
        publicId: upload.public_id,
        version: String(upload.version),
        format: upload.format || 'pdf',
        bytes: upload.bytes,
        originalName,
      })
    })

    stream.end(buffer)
  })
}

export async function deleteEbook(publicId: string) {
  const cloudinary = requireCloudinaryConfiguration()
  await cloudinary.uploader.destroy(publicId, {
    resource_type: 'raw',
    type: 'authenticated',
    invalidate: true,
  })
}

export function createEbookDownloadUrl(publicId: string, format: string) {
  const cloudinary = requireCloudinaryConfiguration()
  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: 'raw',
    type: 'authenticated',
    expires_at: Math.floor(Date.now() / 1000) + env.CLOUDINARY_DOWNLOAD_TTL_SECONDS,
    attachment: true,
  })
}
