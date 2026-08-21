import { Router } from 'express'
import { prisma } from '../config/prisma.js'
import { ApiError } from '../middleware/error-handler.js'
import { internationalPaymentsEnabled } from '../services/payment-settings.js'
import { paypalConfigured } from '../services/paypal.js'

export const publicationsRouter = Router()

publicationsRouter.get('/:slug', async (request, response, next) => {
  try {
    const [book, internationalEnabled] = await Promise.all([prisma.book.findUnique({
      where: { slug: request.params.slug },
      select: {
        slug: true,
        title: true,
        subtitle: true,
        author: true,
        shortDescription: true,
        priceMinor: true,
        currency: true,
        paypalPriceMinor: true,
        status: true,
        purchasesEnabled: true,
        downloadsEnabled: true,
        ebookAssetId: true,
      },
    }), internationalPaymentsEnabled()])

    if (!book || book.status !== 'PUBLISHED') throw new ApiError(404, 'Publication was not found')

    response.json({
      success: true,
      data: {
        slug: book.slug,
        title: book.title,
        subtitle: book.subtitle,
        author: book.author,
        shortDescription: book.shortDescription,
        priceMinor: book.priceMinor,
        currency: book.currency,
        paypalPriceMinor: book.paypalPriceMinor,
        status: book.status,
        purchasesEnabled: book.purchasesEnabled,
        downloadsEnabled: book.downloadsEnabled,
        paymentProviders: {
          paystack: { enabled: book.priceMinor !== null && book.priceMinor > 0, priceMinor: book.priceMinor, currency: book.currency },
          paypal: { enabled: internationalEnabled && paypalConfigured() && book.paypalPriceMinor !== null && book.paypalPriceMinor > 0, priceMinor: book.paypalPriceMinor, currency: 'USD' },
        },
        canPurchase: book.purchasesEnabled && book.downloadsEnabled && Boolean(book.ebookAssetId)
          && ((book.priceMinor !== null && book.priceMinor > 0)
            || (internationalEnabled && paypalConfigured() && book.paypalPriceMinor !== null && book.paypalPriceMinor > 0)),
      },
    })
  } catch (error) {
    next(error)
  }
})
