import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../config/prisma.js'
import { requireAdmin } from '../middleware/admin-auth.js'
import { ApiError } from '../middleware/error-handler.js'

export const adminCommunicationsRouter = Router()
adminCommunicationsRouter.use(requireAdmin)

const pageSchema = z.object({ page: z.coerce.number().int().positive().default(1) })
const messageQuerySchema = pageSchema.extend({ status: z.enum(['ALL', 'UNREAD', 'READ', 'RESOLVED', 'SPAM']).default('ALL') })

adminCommunicationsRouter.get('/notifications', async (_request, response, next) => {
  try {
    const [unreadCount, messages] = await Promise.all([
      prisma.contactMessage.count({ where: { status: 'UNREAD' } }),
      prisma.contactMessage.findMany({ where: { status: 'UNREAD' }, take: 5, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, email: true, service: true, createdAt: true } }),
    ])
    response.json({ success: true, data: { unreadCount, messages } })
  } catch (error) { next(error) }
})

adminCommunicationsRouter.get('/messages', async (request, response, next) => {
  try {
    const parsed = messageQuerySchema.safeParse(request.query)
    if (!parsed.success) throw new ApiError(400, 'Invalid message filters')
    const pageSize = 20
    const where = parsed.data.status === 'ALL' ? {} : { status: parsed.data.status }
    const [messages, total] = await Promise.all([
      prisma.contactMessage.findMany({ where, take: pageSize, skip: (parsed.data.page - 1) * pageSize, orderBy: { createdAt: 'desc' } }),
      prisma.contactMessage.count({ where }),
    ])
    response.json({ success: true, data: { messages, pagination: { page: parsed.data.page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } } })
  } catch (error) { next(error) }
})

const messageUpdateSchema = z.object({ status: z.enum(['UNREAD', 'READ', 'RESOLVED', 'SPAM']).optional(), adminNotes: z.string().trim().max(3000).nullable().optional() })
adminCommunicationsRouter.patch('/messages/:id', async (request, response, next) => {
  try {
    const parsed = messageUpdateSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError(400, 'Invalid message update')
    const message = await prisma.contactMessage.update({ where: { id: request.params.id }, data: parsed.data })
    await prisma.auditLog.create({ data: { adminId: request.admin!.id, action: 'CONTACT_MESSAGE_UPDATED', resourceType: 'ContactMessage', resourceId: message.id, metadata: { status: message.status } } })
    response.json({ success: true, data: { message } })
  } catch (error) { next(error) }
})

const subscriberQuerySchema = pageSchema.extend({ status: z.enum(['ALL', 'ACTIVE', 'UNSUBSCRIBED', 'BOUNCED']).default('ALL') })
adminCommunicationsRouter.get('/subscribers', async (request, response, next) => {
  try {
    const parsed = subscriberQuerySchema.safeParse(request.query)
    if (!parsed.success) throw new ApiError(400, 'Invalid subscriber filters')
    const pageSize = 30
    const where = parsed.data.status === 'ALL' ? {} : { status: parsed.data.status }
    const [subscribers, total, active] = await Promise.all([
      prisma.newsletterSubscriber.findMany({ where, take: pageSize, skip: (parsed.data.page - 1) * pageSize, orderBy: { subscribedAt: 'desc' } }),
      prisma.newsletterSubscriber.count({ where }),
      prisma.newsletterSubscriber.count({ where: { status: 'ACTIVE' } }),
    ])
    response.json({ success: true, data: { subscribers, active, pagination: { page: parsed.data.page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } } })
  } catch (error) { next(error) }
})

const subscriberUpdateSchema = z.object({ status: z.enum(['ACTIVE', 'UNSUBSCRIBED', 'BOUNCED']) })
adminCommunicationsRouter.patch('/subscribers/:id', async (request, response, next) => {
  try {
    const parsed = subscriberUpdateSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError(400, 'Invalid subscriber status')
    const subscriber = await prisma.newsletterSubscriber.update({
      where: { id: request.params.id },
      data: { status: parsed.data.status, unsubscribedAt: parsed.data.status === 'UNSUBSCRIBED' ? new Date() : null },
    })
    response.json({ success: true, data: { subscriber } })
  } catch (error) { next(error) }
})

function csvCell(value: string | Date | null) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

adminCommunicationsRouter.get('/subscribers-export.csv', async (_request, response, next) => {
  try {
    const subscribers = await prisma.newsletterSubscriber.findMany({ orderBy: { subscribedAt: 'desc' } })
    const rows = ['Full Name,Email,Status,Source,Subscribed At', ...subscribers.map((item) => [item.name, item.email, item.status, item.source, item.subscribedAt].map(csvCell).join(','))]
    response.setHeader('Content-Type', 'text/csv; charset=utf-8')
    response.setHeader('Content-Disposition', 'attachment; filename="edyn-newsletter-subscribers.csv"')
    response.send(`\uFEFF${rows.join('\n')}`)
  } catch (error) { next(error) }
})
