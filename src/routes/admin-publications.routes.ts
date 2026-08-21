import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { env } from '../config/env.js'
import { prisma } from '../config/prisma.js'
import { requireAdmin } from '../middleware/admin-auth.js'
import { ApiError } from '../middleware/error-handler.js'
import { deleteEbook, uploadEbook } from '../services/cloudinary-ebooks.js'
import { INTERNATIONAL_PAYMENTS_SETTING_KEY, internationalPaymentsEnabled } from '../services/payment-settings.js'
import { paypalConfigured } from '../services/paypal.js'

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
  paypalPriceMinor: z.number().int().positive().nullable().optional(),
  purchasesEnabled: z.boolean().optional(),
  downloadsEnabled: z.boolean().optional(),
  internationalPaymentsEnabled: z.boolean().optional(),
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
    const [books, internationalEnabled] = await Promise.all([prisma.book.findMany({
      orderBy: [{ featured: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true, slug: true, title: true, author: true, status: true, featured: true,
        priceMinor: true, currency: true, paypalPriceMinor: true, purchasesEnabled: true, downloadsEnabled: true,
        ebookProvider: true, ebookAssetId: true, ebookFormat: true, ebookBytes: true,
        ebookOriginalName: true, ebookUploadedAt: true, updatedAt: true,
      },
    }), internationalPaymentsEnabled()])
    response.json({
      success: true,
      data: {
        books,
        settings: {
          internationalPaymentsEnabled: internationalEnabled,
          paypalConfigured: paypalConfigured(),
          paypalEnvironment: env.PAYPAL_ENV,
        },
      },
    })
  } catch (error) { next(error) }
})

adminPublicationsRouter.patch('/:slug', async (request, response, next) => {
  try {
    const slug = routeParam(request.params.slug, 'publication slug')
    const parsed = updateSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError(400, 'Invalid publication settings')

    const existing = await prisma.book.findUnique({ where: { slug } })
    if (!existing) throw new ApiError(404, 'Publication was not found')
    const {
      internationalPaymentsEnabled: internationalEnabled,
      ...bookSettings
    } = parsed.data
    const effectivePrice = parsed.data.priceMinor === undefined ? existing.priceMinor : parsed.data.priceMinor
    const effectivePaypalPrice = parsed.data.paypalPriceMinor === undefined ? existing.paypalPriceMinor : parsed.data.paypalPriceMinor
    const effectiveDownloads = parsed.data.downloadsEnabled === undefined ? existing.downloadsEnabled : parsed.data.downloadsEnabled

    if (parsed.data.downloadsEnabled && !existing.ebookAssetId) {
      throw new ApiError(409, 'Upload the ebook before enabling downloads')
    }
    if (parsed.data.purchasesEnabled && !effectivePrice) {
      throw new ApiError(409, 'Set a valid price before enabling purchases')
    }
    if (parsed.data.purchasesEnabled && (!existing.ebookAssetId || !effectiveDownloads)) {
      throw new ApiError(409, 'Upload the ebook and enable downloads before enabling purchases')
    }
    if (internationalEnabled && !effectivePaypalPrice) {
      throw new ApiError(409, 'Set a valid PayPal USD price before enabling international payments')
    }
    if (internationalEnabled && !paypalConfigured()) {
      throw new ApiError(409, 'Configure PayPal credentials before enabling international payments')
    }

    const book = await prisma.$transaction(async (transaction) => {
      const updatedBook = await transaction.book.update({ where: { id: existing.id }, data: bookSettings })
      if (internationalEnabled !== undefined) {
        await transaction.siteSetting.upsert({
          where: { key: INTERNATIONAL_PAYMENTS_SETTING_KEY },
          update: { value: internationalEnabled },
          create: {
            key: INTERNATIONAL_PAYMENTS_SETTING_KEY,
            value: internationalEnabled,
            description: 'Shows and authorizes PayPal checkout for international customers.',
          },
        })
      }
      await transaction.auditLog.create({ data: { adminId: request.admin!.id, action: 'PUBLICATION_UPDATED', resourceType: 'Book', resourceId: updatedBook.id, metadata: { slug: updatedBook.slug, internationalPaymentsEnabled: internationalEnabled } } })
      return updatedBook
    })
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
