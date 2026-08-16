import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../config/prisma.js'
import { sendContactNotification } from '../services/email.js'

export const communicationsRouter = Router()
const submissionLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false })

const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().transform((value) => value.trim().toLowerCase()),
  business: z.string().trim().max(150).optional().default(''),
  service: z.string().trim().max(120).optional().default(''),
  budget: z.string().trim().max(100).optional().default(''),
  message: z.string().trim().min(10).max(5000),
  website: z.string().max(0).optional().default(''),
})

communicationsRouter.post('/contact', submissionLimiter, async (request, response, next) => {
  try {
    const parsed = contactSchema.safeParse(request.body)
    if (!parsed.success) return response.status(400).json({ success: false, error: { message: 'Please complete the required contact details' }, requestId: request.requestId })

    const contact = await prisma.contactMessage.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        business: parsed.data.business || null,
        service: parsed.data.service || null,
        budget: parsed.data.budget || null,
        message: parsed.data.message,
      },
    })

    await sendContactNotification(contact).catch(async (error) => {
      console.error(`Contact notification failed for ${contact.id}:`, error)
      await prisma.auditLog.create({
        data: { action: 'CONTACT_EMAIL_FAILED', resourceType: 'ContactMessage', resourceId: contact.id, metadata: { message: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error' } },
      }).catch(() => undefined)
    })

    response.status(201).json({ success: true, data: { id: contact.id, received: true } })
  } catch (error) { next(error) }
})

const subscriberSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().transform((value) => value.trim().toLowerCase()),
  source: z.string().trim().max(80).optional().default('website'),
  website: z.string().max(0).optional().default(''),
})

communicationsRouter.post('/newsletter/subscribe', submissionLimiter, async (request, response, next) => {
  try {
    const parsed = subscriberSchema.safeParse(request.body)
    if (!parsed.success) return response.status(400).json({ success: false, error: { message: 'Enter your full name and a valid email address' }, requestId: request.requestId })

    const subscriber = await prisma.newsletterSubscriber.upsert({
      where: { email: parsed.data.email },
      update: { name: parsed.data.name, status: 'ACTIVE', source: parsed.data.source, subscribedAt: new Date(), unsubscribedAt: null },
      create: { name: parsed.data.name, email: parsed.data.email, source: parsed.data.source },
    })
    response.status(201).json({ success: true, data: { id: subscriber.id, subscribed: true } })
  } catch (error) { next(error) }
})
