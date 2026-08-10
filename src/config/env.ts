import 'dotenv/config'
import { z } from 'zod'

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  APP_NAME: z.string().min(1).default('Edyn Digital Hub API'),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),
  CLIENT_URL: z.url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  SUPABASE_EBOOK_BUCKET: z.string().min(1).default('ebooks'),
  PAYSTACK_SECRET_KEY: z.string().startsWith('sk_'),
  PAYSTACK_BASE_URL: z.url().default('https://api.paystack.co'),
  PAYSTACK_CALLBACK_URL: z.url(),
  DOWNLOAD_TOKEN_SECRET: z.string().min(32),
  EBOOK_LINK_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  MAX_EBOOK_DOWNLOADS: z.coerce.number().int().positive().default(3),
  CONTACT_NOTIFICATION_EMAIL: z.union([z.email(), z.literal('')]).optional(),
})

const parsed = environmentSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment configuration:', z.treeifyError(parsed.error))
  throw new Error('Environment validation failed')
}

export const env = {
  ...parsed.data,
  CORS_ORIGINS: parsed.data.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
}

export type Environment = typeof env
