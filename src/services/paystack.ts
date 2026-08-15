import { env } from '../config/env.js'
import { ApiError } from '../middleware/error-handler.js'

type PaystackEnvelope<T> = {
  status: boolean
  message: string
  data: T
}

export type InitializedTransaction = {
  authorization_url: string
  access_code: string
  reference: string
}

export type VerifiedTransaction = {
  id: number | string
  status: string
  reference: string
  amount: number
  currency: string
  paid_at?: string | null
}

async function paystackRequest<T>(path: string, init?: RequestInit) {
  let response: Response

  try {
    response = await fetch(`${env.PAYSTACK_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new ApiError(502, 'The payment provider is temporarily unavailable')
  }

  const body = await response.json().catch(() => null) as PaystackEnvelope<T> | null
  if (!response.ok || !body?.status || !body.data) {
    throw new ApiError(502, body?.message || 'The payment provider could not process this request')
  }

  return body.data
}

export function initializePaystackTransaction(input: {
  email: string
  amount: number
  currency: string
  reference: string
  customerName: string
  orderId: string
  bookSlug: string
}) {
  return paystackRequest<InitializedTransaction>('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      amount: String(input.amount),
      currency: input.currency,
      reference: input.reference,
      callback_url: env.PAYSTACK_CALLBACK_URL,
      metadata: {
        order_id: input.orderId,
        book_slug: input.bookSlug,
        customer_name: input.customerName,
      },
    }),
  })
}

export function verifyPaystackTransaction(reference: string) {
  return paystackRequest<VerifiedTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`)
}
