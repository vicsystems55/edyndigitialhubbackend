import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { env } from '../config/env.js'
import { prisma } from '../config/prisma.js'
import { ApiError } from '../middleware/error-handler.js'
import { initializePaystackTransaction, verifyPaystackTransaction } from '../services/paystack.js'
import { recordSuccessfulPayment } from '../services/orders.js'
import { ensureDownloadGrantForOrder } from '../services/download-grants.js'
import { internationalPaymentsEnabled } from '../services/payment-settings.js'
import { capturePayPalOrder, createPayPalOrder, paypalConfigured } from '../services/paypal.js'

export const paymentsRouter = Router()

const initializeSchema = z.object({
  bookSlug: z.string().min(1).max(100),
  customerName: z.string().trim().min(2).max(100),
  customerEmail: z.email().transform((value) => value.trim().toLowerCase()),
  paymentProvider: z.enum(['paystack', 'paypal']).default('paystack'),
})

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

paymentsRouter.post('/initialize', paymentLimiter, async (request, response, next) => {
  let orderId: string | undefined

  try {
    const parsed = initializeSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError(400, 'Enter a valid name and email address')

    const book = await prisma.book.findUnique({ where: { slug: parsed.data.bookSlug } })
    if (!book || book.status !== 'PUBLISHED') throw new ApiError(404, 'Publication was not found')
    if (
      !book.purchasesEnabled || !book.downloadsEnabled || !book.ebookAssetId
    ) {
      throw new ApiError(409, 'This publication is not currently available for online purchase')
    }

    const isPayPal = parsed.data.paymentProvider === 'paypal'
    const amountMinor = isPayPal ? book.paypalPriceMinor : book.priceMinor
    const currency = isPayPal ? 'USD' : book.currency
    if (!amountMinor || amountMinor < 1) throw new ApiError(409, `${isPayPal ? 'PayPal' : 'Paystack'} pricing is not available`)
    if (isPayPal && !(await internationalPaymentsEnabled())) throw new ApiError(409, 'International payments are currently unavailable')
    if (isPayPal && !paypalConfigured()) throw new ApiError(503, 'PayPal is not currently available')

    const reference = `EDYN-${Date.now()}-${randomBytes(6).toString('hex')}`
    const order = await prisma.order.create({
      data: {
        reference,
        customerName: parsed.data.customerName,
        customerEmail: parsed.data.customerEmail,
        bookId: book.id,
        amountMinor,
        currency,
        paymentProvider: isPayPal ? 'PAYPAL' : 'PAYSTACK',
      },
    })
    orderId = order.id

    if (isPayPal) {
      const paypalOrder = await createPayPalOrder({ reference: order.reference, amountMinor: order.amountMinor, bookTitle: book.title })
      await prisma.order.update({ where: { id: order.id }, data: { providerOrderId: paypalOrder.id } })
      return response.status(201).json({ success: true, data: { authorizationUrl: paypalOrder.approvalUrl, reference: order.reference, provider: 'paypal' } })
    }

    const transaction = await initializePaystackTransaction({ email: order.customerEmail, amount: order.amountMinor, currency: order.currency, reference: order.reference, customerName: order.customerName || parsed.data.customerName, orderId: order.id, bookSlug: book.slug })

    response.status(201).json({
      success: true,
      data: {
        authorizationUrl: transaction.authorization_url,
        accessCode: transaction.access_code,
        reference: order.reference,
      },
    })
  } catch (error) {
    if (orderId) {
      await prisma.order.update({ where: { id: orderId }, data: { status: 'FAILED' } }).catch(() => undefined)
    }
    next(error)
  }
})

paymentsRouter.get('/verify/:reference', async (request, response, next) => {
  try {
    const reference = request.params.reference
    const order = await prisma.order.findUnique({
      where: { reference },
      include: { book: { select: { slug: true, title: true, downloadsEnabled: true } } },
    })
    if (!order) throw new ApiError(404, 'Order was not found')
    if (order.paymentProvider !== 'PAYSTACK') throw new ApiError(409, 'Use the PayPal confirmation endpoint for this order')

    if (order.status !== 'PAID') {
      const transaction = await verifyPaystackTransaction(reference)
      await recordSuccessfulPayment(
        order,
        transaction,
        `verify:${reference}:${String(transaction.id)}`,
        'transaction.verify',
        transaction,
      )
    }

    const currentOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    const downloadAccess = currentOrder.status === 'PAID'
      ? await ensureDownloadGrantForOrder(currentOrder.id)
      : null
    response.json({
      success: true,
      data: {
        reference: currentOrder.reference,
        status: currentOrder.status,
        amountMinor: currentOrder.amountMinor,
        currency: currentOrder.currency,
        customerEmail: currentOrder.customerEmail,
        book: order.book,
        downloadPath: downloadAccess ? `${env.API_PREFIX}/downloads/${downloadAccess.token}` : null,
      },
    })
  } catch (error) {
    next(error)
  }
})

const captureSchema = z.object({ reference: z.string().min(1), paypalOrderId: z.string().min(1) })

paymentsRouter.post('/paypal/capture', paymentLimiter, async (request, response, next) => {
  try {
    const parsed = captureSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError(400, 'Invalid PayPal confirmation details')
    const order = await prisma.order.findUnique({ where: { reference: parsed.data.reference }, include: { book: { select: { slug: true, title: true, downloadsEnabled: true } } } })
    if (!order || order.paymentProvider !== 'PAYPAL') throw new ApiError(404, 'PayPal order was not found')
    if (order.providerOrderId !== parsed.data.paypalOrderId) throw new ApiError(409, 'PayPal order reference mismatch')

    if (order.status !== 'PAID') {
      const transaction = await capturePayPalOrder(parsed.data.paypalOrderId, order.reference)
      await recordSuccessfulPayment(order, transaction, `paypal:capture:${transaction.id}`, 'PAYMENT.CAPTURE.COMPLETED', transaction, 'PAYPAL')
    }

    const currentOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    const downloadAccess = currentOrder.status === 'PAID' ? await ensureDownloadGrantForOrder(currentOrder.id) : null
    response.json({ success: true, data: { reference: currentOrder.reference, status: currentOrder.status, amountMinor: currentOrder.amountMinor, currency: currentOrder.currency, customerEmail: currentOrder.customerEmail, book: order.book, downloadPath: downloadAccess ? `${env.API_PREFIX}/downloads/${downloadAccess.token}` : null } })
  } catch (error) { next(error) }
})
