import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { env } from '../config/env.js'
import { prisma } from '../config/prisma.js'
import { requireAdmin } from '../middleware/admin-auth.js'
import { ApiError } from '../middleware/error-handler.js'
import { deleteEbook, uploadEbook } from '../services/cloudinary-ebooks.js'

export const adminPublicationsRouter = Router()
adminPublicationsRouter.use(requireAdmin)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: env.CLOUDINARY_MAX_UPLOAD_BYTES },
  fileFilter(_request, file, callback) {
    callback(null, file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf'))
  },
})

const updateSchema = z.object({
  priceMinor: z.number().int().positive().nullable().optional(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
  purchasesEnabled: z.boolean().optional(),
  downloadsEnabled: z.boolean().optional(),
  featured: z.boolean().optional(),
})

function routeParam(value: string | string[] | undefined, name: string) {
  if (typeof value !== 'string' || !value) throw new ApiError(400, `Invalid ${name}`)
  return value
}

function runUpload(request: Request, response: Response, next: NextFunction) {
  upload.single('ebook')(request, response, (error) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      const maximumMb = Math.floor(env.CLOUDINARY_MAX_UPLOAD_BYTES / 1024 / 1024)
      return next(new ApiError(413, `The ebook is too large. Maximum upload size is ${maximumMb} MB`))
    }
    if (error) return next(new ApiError(400, error.message || 'PDF upload failed'))
    next()
  })
}

adminPublicationsRouter.get('/', async (_request, response, next) => {
  try {
    const books = await prisma.book.findMany({
      orderBy: [{ featured: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true, slug: true, title: true, author: true, status: true, featured: true,
        priceMinor: true, currency: true, purchasesEnabled: true, downloadsEnabled: true,
        ebookProvider: true, ebookAssetId: true, ebookFormat: true, ebookBytes: true,
        ebookOriginalName: true, ebookUploadedAt: true, updatedAt: true,
      },
    })
    response.json({ success: true, data: { books } })
  } catch (error) { next(error) }
})

adminPublicationsRouter.patch('/:slug', async (request, response, next) => {
  try {
    const slug = routeParam(request.params.slug, 'publication slug')
    const parsed = updateSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError(400, 'Invalid publication settings')

    const existing = await prisma.book.findUnique({ where: { slug } })
    if (!existing) throw new ApiError(404, 'Publication was not found')
    if (parsed.data.downloadsEnabled && !existing.ebookAssetId) {
      throw new ApiError(409, 'Upload the ebook before enabling downloads')
    }
    if (parsed.data.purchasesEnabled && !(parsed.data.priceMinor || existing.priceMinor)) {
      throw new ApiError(409, 'Set a valid price before enabling purchases')
    }
    if (parsed.data.purchasesEnabled && (!existing.ebookAssetId || parsed.data.downloadsEnabled === false)) {
      throw new ApiError(409, 'Upload the ebook and enable downloads before enabling purchases')
    }

    const book = await prisma.book.update({ where: { id: existing.id }, data: parsed.data })
    await prisma.auditLog.create({ data: { adminId: request.admin!.id, action: 'PUBLICATION_UPDATED', resourceType: 'Book', resourceId: book.id, metadata: { slug: book.slug } } })
    response.json({ success: true, data: { book } })
  } catch (error) { next(error) }
})

adminPublicationsRouter.post('/:slug/ebook', runUpload, async (request, response, next) => {
  try {
    const slug = routeParam(request.params.slug, 'publication slug')
    if (!request.file) throw new ApiError(400, 'Select a PDF file to upload')
    if (request.file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new ApiError(400, 'The selected file is not a valid PDF')
    }

    const existing = await prisma.book.findUnique({ where: { slug } })
    if (!existing) throw new ApiError(404, 'Publication was not found')

    const asset = await uploadEbook(request.file.buffer, request.file.originalname, existing.slug)
    const book = await prisma.book.update({
      where: { id: existing.id },
      data: {
        ebookProvider: 'cloudinary', ebookAssetId: asset.publicId,
        ebookAssetVersion: asset.version, ebookFormat: asset.format,
        ebookBytes: asset.bytes, ebookOriginalName: asset.originalName,
        ebookUploadedAt: new Date(), downloadsEnabled: true,
      },
    })

    if (existing.ebookAssetId && existing.ebookProvider === 'cloudinary') {
      await deleteEbook(existing.ebookAssetId).catch((error) => console.error('Unable to remove replaced ebook asset', error))
    }

    await prisma.auditLog.create({ data: { adminId: request.admin!.id, action: 'EBOOK_UPLOADED', resourceType: 'Book', resourceId: book.id, metadata: { publicId: asset.publicId, bytes: asset.bytes } } })
    response.status(201).json({ success: true, data: { book } })
  } catch (error) { next(error) }
})
