import { beforeAll, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

beforeAll(() => {
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('PORT', '5001')
  vi.stubEnv('APP_NAME', 'Edyn Digital Hub API Test')
  vi.stubEnv('API_PREFIX', '/api/v1')
  vi.stubEnv('CLIENT_URL', 'http://localhost:5173')
  vi.stubEnv('CORS_ORIGINS', 'http://localhost:5173')
  vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test')
  vi.stubEnv('DIRECT_URL', 'postgresql://test:test@localhost:5432/test')
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key')
  vi.stubEnv('SUPABASE_SECRET_KEY', 'test-secret-key')
  vi.stubEnv('SUPABASE_EBOOK_BUCKET', 'ebooks-test')
  vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_example')
  vi.stubEnv('PAYSTACK_BASE_URL', 'https://api.paystack.co')
  vi.stubEnv('PAYSTACK_CALLBACK_URL', 'http://localhost:5173/payment/callback')
  vi.stubEnv('DOWNLOAD_TOKEN_SECRET', 'test-secret-that-is-at-least-32-characters')
})

describe('API application', () => {
  it('returns service health', async () => {
    const { app } = await import('./app.js')
    const response = await request(app).get('/api/v1/health')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.status).toBe('ok')
  })

  it('returns a structured 404 response', async () => {
    const { app } = await import('./app.js')
    const response = await request(app).get('/api/v1/missing')

    expect(response.status).toBe(404)
    expect(response.body.success).toBe(false)
    expect(response.body.requestId).toBeTypeOf('string')
  })

  it('rejects malformed administrator login input', async () => {
    const { app } = await import('./app.js')
    const response = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'not-an-email', password: 'short' })

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
    expect(response.body.error.message).toBe('Enter a valid email address and password')
  })

  it('protects the administrator profile endpoint', async () => {
    const { app } = await import('./app.js')
    const response = await request(app).get('/api/v1/admin/auth/me')

    expect(response.status).toBe(401)
    expect(response.body.success).toBe(false)
  })

  it('protects publication and ebook management endpoints', async () => {
    const { app } = await import('./app.js')
    const listResponse = await request(app).get('/api/v1/admin/publications')
    const uploadResponse = await request(app)
      .post('/api/v1/admin/publications/the-healthy-you/ebook')
      .attach('ebook', Buffer.from('%PDF-1.4 test'), 'test.pdf')

    expect(listResponse.status).toBe(401)
    expect(uploadResponse.status).toBe(401)
  })

  it('allows Vite development origins when the local port changes', async () => {
    const { app } = await import('./app.js')
    const response = await request(app)
      .options('/api/v1/admin/auth/login')
      .set('Origin', 'http://localhost:5174')
      .set('Access-Control-Request-Method', 'POST')

    expect(response.status).toBe(204)
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5174')
  })

  it('rejects malformed payment initialization input', async () => {
    const { app } = await import('./app.js')
    const response = await request(app)
      .post('/api/v1/payments/initialize')
      .send({ bookSlug: 'the-healthy-you', customerName: '', customerEmail: 'invalid' })

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
  })

  it('rejects Paystack webhooks with an invalid signature', async () => {
    const { app } = await import('./app.js')
    const response = await request(app)
      .post('/api/v1/payments/webhook')
      .set('x-paystack-signature', 'invalid-signature')
      .send({ event: 'charge.success', data: {} })

    expect(response.status).toBe(401)
    expect(response.body.success).toBe(false)
  })
})
