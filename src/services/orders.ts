import type { Order } from '../generated/prisma/client.js'
import { prisma } from '../config/prisma.js'
import { ApiError } from '../middleware/error-handler.js'
import type { VerifiedTransaction } from './paystack.js'
import { ensureDownloadGrantForOrder } from './download-grants.js'
import { sendPurchaseEmail } from './email.js'

export function validatePaidTransaction(order: Order, transaction: VerifiedTransaction) {
  if (transaction.reference !== order.reference) throw new ApiError(409, 'Payment reference mismatch')
  if (transaction.amount !== order.amountMinor) throw new ApiError(409, 'Payment amount mismatch')
  if (transaction.currency.toUpperCase() !== order.currency.toUpperCase()) {
    throw new ApiError(409, 'Payment currency mismatch')
  }
}

export async function recordSuccessfulPayment(
  order: Order,
  transaction: VerifiedTransaction,
  eventKey: string,
  eventType: string,
  payload: object,
) {
  validatePaidTransaction(order, transaction)
  if (transaction.status !== 'success') return order

  const updatedOrder = await prisma.$transaction(async (database) => {
    const paidOrder = await database.order.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        paystackTransactionId: String(transaction.id),
        paidAt: transaction.paid_at ? new Date(transaction.paid_at) : new Date(),
      },
    })

    await database.paymentEvent.upsert({
      where: { eventKey },
      update: { processed: true, processedAt: new Date(), orderId: order.id },
      create: {
        eventKey,
        eventType,
        reference: order.reference,
        orderId: order.id,
        payload,
        processed: true,
        processedAt: new Date(),
      },
    })

    return paidOrder
  })

  const downloadAccess = await ensureDownloadGrantForOrder(updatedOrder.id)
  if (order.status !== 'PAID' && downloadAccess) {
    try {
      const email = await sendPurchaseEmail({
        orderId: updatedOrder.id,
        reference: updatedOrder.reference,
        customerName: updatedOrder.customerName,
        customerEmail: updatedOrder.customerEmail,
        bookTitle: downloadAccess.book.title,
        amountMinor: updatedOrder.amountMinor,
        currency: updatedOrder.currency,
        downloadToken: downloadAccess.token,
        expiresAt: downloadAccess.grant.expiresAt,
        maxDownloads: downloadAccess.grant.maxDownloads,
      })
      if (email.sent) {
        await prisma.order.update({
          where: { id: updatedOrder.id },
          data: { receiptEmailSentAt: new Date(), receiptEmailId: email.id || null, receiptEmailError: null },
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown email delivery error'
      console.error(`Purchase email failed for order ${updatedOrder.reference}:`, error)
      await prisma.order.update({
        where: { id: updatedOrder.id },
        data: { receiptEmailError: message.slice(0, 1000) },
      }).catch(() => undefined)
    }
  }
  return updatedOrder
}
