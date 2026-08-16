import { createHash, createHmac } from 'node:crypto'
import { env } from '../config/env.js'
import { prisma } from '../config/prisma.js'
import { ApiError } from '../middleware/error-handler.js'

function deriveToken(orderId: string, reference: string) {
  return createHmac('sha256', env.DOWNLOAD_TOKEN_SECRET)
    .update(`${orderId}:${reference}:ebook-download`)
    .digest('base64url')
}

export function hashDownloadToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function ensureDownloadGrantForOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { book: true },
  })

  if (!order || order.status !== 'PAID') return null
  if (!order.book.downloadsEnabled || !order.book.ebookAssetId || !order.book.ebookFormat) return null

  const token = deriveToken(order.id, order.reference)
  const tokenHash = hashDownloadToken(token)
  const startsAt = order.paidAt || new Date()
  const expiresAt = new Date(startsAt.getTime() + env.EBOOK_GRANT_TTL_DAYS * 86_400_000)

  const grant = await prisma.downloadGrant.upsert({
    where: { tokenHash },
    update: { maxDownloads: env.MAX_EBOOK_DOWNLOADS },
    create: {
      orderId: order.id,
      tokenHash,
      expiresAt,
      maxDownloads: env.MAX_EBOOK_DOWNLOADS,
    },
  })

  return { token, grant, book: order.book }
}

export async function consumeDownloadGrant(token: string) {
  const tokenHash = hashDownloadToken(token)
  const grant = await prisma.downloadGrant.findUnique({
    where: { tokenHash },
    include: { order: { include: { book: true } } },
  })

  if (!grant || grant.order.status !== 'PAID') throw new ApiError(404, 'Download link was not found')
  if (grant.revokedAt) throw new ApiError(410, 'This download access has been revoked')
  if (grant.expiresAt <= new Date()) throw new ApiError(410, 'This download access has expired')
  if (grant.downloadCount >= grant.maxDownloads) throw new ApiError(410, 'The download limit has been reached')

  const book = grant.order.book
  if (!book.downloadsEnabled || !book.ebookAssetId || !book.ebookFormat) {
    throw new ApiError(409, 'This ebook is not currently available for download')
  }

  const update = await prisma.downloadGrant.updateMany({
    where: {
      id: grant.id,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      downloadCount: { lt: grant.maxDownloads },
    },
    data: { downloadCount: { increment: 1 }, lastDownloadAt: new Date() },
  })
  if (update.count !== 1) throw new ApiError(409, 'Download access could not be claimed')

  return { grant, book }
}
