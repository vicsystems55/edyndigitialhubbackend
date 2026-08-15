import { Router } from 'express'
import { prisma } from '../config/prisma.js'
import { ApiError } from '../middleware/error-handler.js'

export const publicationsRouter = Router()

publicationsRouter.get('/:slug', async (request, response, next) => {
  try {
    const book = await prisma.book.findUnique({
      where: { slug: request.params.slug },
      select: {
        slug: true,
        title: true,
        subtitle: true,
        author: true,
        shortDescription: true,
        priceMinor: true,
        currency: true,
        status: true,
        purchasesEnabled: true,
        downloadsEnabled: true,
      },
    })

    if (!book || book.status !== 'PUBLISHED') throw new ApiError(404, 'Publication was not found')

    response.json({
      success: true,
      data: {
        ...book,
        canPurchase: book.purchasesEnabled && book.priceMinor !== null && book.priceMinor > 0,
      },
    })
  } catch (error) {
    next(error)
  }
})
