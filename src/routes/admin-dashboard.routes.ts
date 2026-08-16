import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../config/prisma.js'
import { requireAdmin } from '../middleware/admin-auth.js'
import { ApiError } from '../middleware/error-handler.js'
import { emailDeliveryConfigured } from '../services/email.js'

export const adminDashboardRouter = Router()
adminDashboardRouter.use(requireAdmin)

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

adminDashboardRouter.get('/overview', async (_request, response, next) => {
  try {
    const now = new Date()
    const trafficStart = startOfDay(new Date(now.getTime() - 6 * 86_400_000))

    const [
      websiteViews, paidSales, unreadMessages, activeSubscribers, recentOrders,
      recentMessages, publishedBooks, comingSoonBooks, totalBooks, downloadTotals,
      recentViews,
    ] = await Promise.all([
      prisma.pageView.count(),
      prisma.order.aggregate({ where: { status: 'PAID' }, _sum: { amountMinor: true }, _count: true }),
      prisma.contactMessage.count({ where: { status: 'UNREAD' } }),
      prisma.newsletterSubscriber.count({ where: { status: 'ACTIVE' } }),
      prisma.order.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
        include: {
          book: { select: { title: true } },
          downloadGrants: { take: 1, orderBy: { createdAt: 'desc' }, select: { downloadCount: true, maxDownloads: true } },
        },
      }),
      prisma.contactMessage.findMany({ take: 4, orderBy: { createdAt: 'desc' } }),
      prisma.book.count({ where: { status: 'PUBLISHED' } }),
      prisma.book.count({ where: { status: 'COMING_SOON' } }),
      prisma.book.count(),
      prisma.downloadGrant.aggregate({ _sum: { downloadCount: true } }),
      prisma.pageView.findMany({ where: { viewedAt: { gte: trafficStart } }, select: { viewedAt: true } }),
    ])

    const trafficMap = new Map<string, number>()
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(trafficStart.getTime() + offset * 86_400_000)
      trafficMap.set(date.toISOString().slice(0, 10), 0)
    }
    for (const view of recentViews) {
      const key = view.viewedAt.toISOString().slice(0, 10)
      trafficMap.set(key, (trafficMap.get(key) || 0) + 1)
    }

    response.json({
      success: true,
      data: {
        summary: {
          websiteViews,
          paidOrders: paidSales._count,
          bookRevenueMinor: paidSales._sum.amountMinor || 0,
          unreadMessages,
          activeSubscribers,
        },
        library: {
          total: totalBooks,
          published: publishedBooks,
          comingSoon: comingSoonBooks,
          downloads: downloadTotals._sum.downloadCount || 0,
        },
        integrations: { resend: emailDeliveryConfigured(), paystack: true },
        traffic: [...trafficMap].map(([date, views]) => ({ date, views })),
        recentOrders: recentOrders.map((order) => ({
          id: order.id,
          reference: order.reference,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          bookTitle: order.book.title,
          amountMinor: order.amountMinor,
          currency: order.currency,
          status: order.status,
          paidAt: order.paidAt,
          receiptEmailSentAt: order.receiptEmailSentAt,
          receiptEmailError: order.receiptEmailError,
          createdAt: order.createdAt,
          downloadCount: order.downloadGrants[0]?.downloadCount || 0,
          maxDownloads: order.downloadGrants[0]?.maxDownloads || 0,
        })),
        recentMessages: recentMessages.map((message) => ({
          id: message.id,
          name: message.name,
          email: message.email,
          service: message.service,
          message: message.message,
          status: message.status,
          createdAt: message.createdAt,
        })),
      },
    })
  } catch (error) { next(error) }
})

const orderQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  status: z.enum(['ALL', 'PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED']).default('ALL'),
})

adminDashboardRouter.get('/orders', async (request, response, next) => {
  try {
    const parsed = orderQuerySchema.safeParse(request.query)
    if (!parsed.success) throw new ApiError(400, 'Invalid order filters')
    const pageSize = 20
    const where = parsed.data.status === 'ALL' ? {} : { status: parsed.data.status }
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        take: pageSize,
        skip: (parsed.data.page - 1) * pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          book: { select: { title: true } },
          downloadGrants: { take: 1, orderBy: { createdAt: 'desc' }, select: { downloadCount: true, maxDownloads: true, expiresAt: true, revokedAt: true } },
        },
      }),
      prisma.order.count({ where }),
    ])

    response.json({
      success: true,
      data: {
        orders: orders.map((order) => ({
          ...order,
          book: order.book,
          downloadGrant: order.downloadGrants[0] || null,
          downloadGrants: undefined,
        })),
        pagination: { page: parsed.data.page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) },
      },
    })
  } catch (error) { next(error) }
})
