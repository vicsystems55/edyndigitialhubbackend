import { Resend } from 'resend'
import { env } from '../config/env.js'

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] || character)
}

export function emailDeliveryConfigured() {
  return Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL)
}

export async function sendContactNotification(input: {
  id: string
  name: string
  email: string
  business: string | null
  service: string | null
  budget: string | null
  message: string
  createdAt: Date
}) {
  if (!emailDeliveryConfigured() || !env.CONTACT_NOTIFICATION_EMAIL) {
    return { sent: false as const, reason: 'not_configured' as const }
  }

  const resend = new Resend(env.RESEND_API_KEY)
  const { data, error } = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: [env.CONTACT_NOTIFICATION_EMAIL],
    replyTo: input.email,
    subject: `New Edyn project enquiry from ${input.name}`,
    html: `<!doctype html><html><body style="margin:0;background:#f8f6ee;font-family:Arial,sans-serif;color:#111"><div style="max-width:640px;margin:0 auto;padding:30px 18px"><div style="background:#fff;border:1px solid #e8e8e3;border-radius:16px;overflow:hidden"><div style="background:#0b5d1e;color:#fff;padding:24px"><div style="color:#ffc400;font-size:12px;font-weight:700;letter-spacing:1.4px">EDYN DIGITAL HUB</div><h1 style="font-size:24px;margin:9px 0 0">New project enquiry</h1></div><div style="padding:26px"><p><strong>Name:</strong> ${escapeHtml(input.name)}</p><p><strong>Email:</strong> ${escapeHtml(input.email)}</p><p><strong>Business:</strong> ${escapeHtml(input.business || 'Not provided')}</p><p><strong>Service:</strong> ${escapeHtml(input.service || 'Not specified')}</p><p><strong>Budget:</strong> ${escapeHtml(input.budget || 'Not specified')}</p><div style="background:#f5f9f1;border-radius:10px;margin-top:20px;padding:18px;white-space:pre-wrap">${escapeHtml(input.message)}</div><p style="color:#667085;font-size:12px;margin-top:22px">Submitted ${input.createdAt.toUTCString()}</p></div></div></div></body></html>`,
    text: `New Edyn project enquiry\n\nName: ${input.name}\nEmail: ${input.email}\nBusiness: ${input.business || 'Not provided'}\nService: ${input.service || 'Not specified'}\nBudget: ${input.budget || 'Not specified'}\n\n${input.message}`,
  }, { idempotencyKey: `edyn-contact-${input.id}` })

  if (error) throw new Error(`Resend contact notification failed: ${error.message}`)
  return { sent: true as const, id: data?.id }
}

export async function sendPurchaseEmail(input: {
  orderId: string
  reference: string
  customerName: string | null
  customerEmail: string
  bookTitle: string
  amountMinor: number
  currency: string
  downloadToken: string
  expiresAt: Date
  maxDownloads: number
}) {
  if (!emailDeliveryConfigured()) return { sent: false as const, reason: 'not_configured' as const }

  const resend = new Resend(env.RESEND_API_KEY)
  const downloadUrl = `${env.API_PUBLIC_URL.replace(/\/$/, '')}${env.API_PREFIX}/downloads/${input.downloadToken}`
  const name = escapeHtml(input.customerName || 'Reader')
  const title = escapeHtml(input.bookTitle)
  const amount = new Intl.NumberFormat('en-NG', {
    style: 'currency', currency: input.currency, maximumFractionDigits: 0,
  }).format(input.amountMinor / 100)

  const { data, error } = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: [input.customerEmail],
    ...(env.RESEND_REPLY_TO ? { replyTo: env.RESEND_REPLY_TO } : {}),
    subject: `Your copy of ${input.bookTitle} is ready`,
    html: `<!doctype html><html><body style="margin:0;background:#f8f6ee;font-family:Arial,sans-serif;color:#111"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border:1px solid #e8e8e3;border-radius:18px;overflow:hidden"><div style="background:#0b5d1e;padding:28px;color:#fff"><div style="color:#ffc400;font-size:12px;font-weight:700;letter-spacing:1.5px">EDYN DIGITAL HUB</div><h1 style="margin:10px 0 0;font-size:28px">Your ebook is ready</h1></div><div style="padding:30px"><p>Hello ${name},</p><p>Thank you for purchasing <strong>${title}</strong>. Your payment of <strong>${amount}</strong> has been confirmed.</p><p style="margin:28px 0"><a href="${downloadUrl}" style="display:inline-block;background:#ffc400;color:#111;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:9px">Download your ebook</a></p><p style="color:#667085;font-size:13px;line-height:1.6">This access expires on ${input.expiresAt.toUTCString()} and can be used up to ${input.maxDownloads} times. Keep this email private.</p><hr style="border:0;border-top:1px solid #e8e8e3;margin:24px 0"><p style="color:#667085;font-size:12px">Order reference: ${escapeHtml(input.reference)}</p></div></div></div></body></html>`,
    text: `Hello ${input.customerName || 'Reader'},\n\nThank you for purchasing ${input.bookTitle}. Your payment of ${amount} has been confirmed.\n\nDownload your ebook: ${downloadUrl}\n\nThis access expires on ${input.expiresAt.toUTCString()} and can be used up to ${input.maxDownloads} times.\n\nOrder reference: ${input.reference}`,
  }, { idempotencyKey: `edyn-order-${input.orderId}-receipt` })

  if (error) throw new Error(`Resend delivery failed: ${error.message}`)
  return { sent: true as const, id: data?.id }
}
