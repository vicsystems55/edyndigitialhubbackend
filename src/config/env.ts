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
  RESEND_API_KEY: z.string().default(''),
  RESEND_FROM_EMAIL: z.string().default(''),
  RESEND_REPLY_TO: z.union([z.email(), z.literal('')]).default(''),
  API_PUBLIC_URL: z.url().default('http://localhost:5001'),
  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),
  CLOUDINARY_UPLOAD_PRESET: z.string().default(''),
  CLOUDINARY_EBOOK_FOLDER: z.string().default('edyndigitalhub/ebooks'),
  CLOUDINARY_DOWNLOAD_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
  CLOUDINARY_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().max(104_857_600).default(10_485_760),
  EBOOK_GRANT_TTL_DAYS: z.coerce.number().int().positive().max(365).default(30),
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
