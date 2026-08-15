import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { consumeDownloadGrant } from '../services/download-grants.js'
import { createEbookDownloadUrl } from '../services/cloudinary-ebooks.js'

export const downloadsRouter = Router()

downloadsRouter.get('/:token', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
}), async (request, response, next) => {
  try {
    const token = request.params.token
    if (typeof token !== 'string' || !token) return response.status(400).json({ success: false, error: { message: 'Invalid download token' } })
    const { book } = await consumeDownloadGrant(token)
    const url = createEbookDownloadUrl(book.ebookAssetId!, book.ebookFormat!)
    response.setHeader('Cache-Control', 'no-store')
    response.redirect(302, url)
  } catch (error) {
    next(error)
  }
})
