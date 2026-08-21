import { env } from '../config/env.js'
import { ApiError } from '../middleware/error-handler.js'

const paypalBaseUrl = env.PAYPAL_ENV === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com'

export function paypalConfigured() {
  return Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET)
}

async function accessToken() {
  if (!paypalConfigured()) throw new ApiError(503, 'PayPal is not configured')
  const credentials = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64')
  let response: Response
  try {
    response = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new ApiError(502, 'PayPal is temporarily unavailable')
  }
  const payload = await response.json().catch(() => null) as { access_token?: string; error_description?: string } | null
  if (!response.ok || !payload?.access_token) throw new ApiError(502, payload?.error_description || 'PayPal authentication failed')
  return payload.access_token
}

async function paypalRequest<T>(path: string, init: RequestInit) {
  const token = await accessToken()
  let response: Response
  try {
    response = await fetch(`${paypalBaseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new ApiError(502, 'PayPal is temporarily unavailable')
  }
  const payload = await response.json().catch(() => null) as (T & { message?: string; details?: Array<{ description?: string }> }) | null
  if (!response.ok || !payload) throw new ApiError(502, payload?.details?.[0]?.description || payload?.message || 'PayPal could not process this request')
  return payload
}

type PayPalOrder = {
  id: string
  status: string
  links: Array<{ href: string; rel: string; method: string }>
}

type PayPalCapture = {
  id: string
  status: string
  purchase_units: Array<{
    custom_id?: string
    invoice_id?: string
    payments?: { captures?: Array<{ id: string; status: string; create_time?: string; amount: { value: string; currency_code: string } }> }
  }>
}

function callbackUrl(base: string, reference: string) {
  const url = new URL(base)
  url.searchParams.set('provider', 'paypal')
  url.searchParams.set('reference', reference)
  return url.toString()
}

export async function createPayPalOrder(input: { reference: string; amountMinor: number; bookTitle: string }) {
  const order = await paypalRequest<PayPalOrder>('/v2/checkout/orders', {
    method: 'POST',
    headers: { 'PayPal-Request-Id': `create-${input.reference}` },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: input.reference,
        custom_id: input.reference,
        invoice_id: input.reference,
        description: input.bookTitle.slice(0, 127),
        amount: { currency_code: 'USD', value: (input.amountMinor / 100).toFixed(2) },
      }],
      payment_source: { paypal: { experience_context: { user_action: 'PAY_NOW', return_url: callbackUrl(env.PAYPAL_RETURN_URL, input.reference), cancel_url: env.PAYPAL_CANCEL_URL } } },
    }),
  })
  const approvalUrl = order.links.find((link) => link.rel === 'payer-action' || link.rel === 'approve')?.href
  if (!approvalUrl) throw new ApiError(502, 'PayPal did not return an approval link')
  return { id: order.id, approvalUrl }
}

export async function capturePayPalOrder(providerOrderId: string, reference: string) {
  const result = await paypalRequest<PayPalCapture>(`/v2/checkout/orders/${encodeURIComponent(providerOrderId)}/capture`, {
    method: 'POST',
    headers: { 'PayPal-Request-Id': `capture-${reference}` },
  })
  const unit = result.purchase_units[0]
  const capture = unit?.payments?.captures?.[0]
  if (!capture) throw new ApiError(409, 'PayPal payment has not been captured')
  return {
    id: capture.id,
    status: capture.status === 'COMPLETED' ? 'success' : capture.status.toLowerCase(),
    reference: unit.custom_id || unit.invoice_id || reference,
    amount: Math.round(Number(capture.amount.value) * 100),
    currency: capture.amount.currency_code,
    paid_at: capture.create_time || null,
    providerOrderId: result.id,
  }
}
