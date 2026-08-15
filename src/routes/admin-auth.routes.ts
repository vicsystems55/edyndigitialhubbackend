import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../config/prisma.js'
import { createSupabaseAuthClient } from '../config/supabase.js'
import { requireAdmin } from '../middleware/admin-auth.js'
import { ApiError } from '../middleware/error-handler.js'

export const adminAuthRouter = Router()

const credentialsSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128),
})

const refreshSchema = z.object({ refreshToken: z.string().min(20) })

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: 'Too many login attempts. Please try again later.' },
  },
})

function publicAdmin(admin: { id: string; email: string; displayName: string | null; role: string }) {
  return {
    id: admin.id,
    email: admin.email,
    name: admin.displayName || 'Edyn Administrator',
    role: admin.role,
  }
}

adminAuthRouter.post('/login', loginLimiter, async (request, response, next) => {
  try {
    const parsed = credentialsSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError(400, 'Enter a valid email address and password')

    const auth = createSupabaseAuthClient()
    const { data, error } = await auth.auth.signInWithPassword(parsed.data)

    // Keep this generic so callers cannot discover registered admin emails.
    if (error || !data.user || !data.session) {
      if (process.env.NODE_ENV !== 'production' && error) {
        console.warn('Supabase administrator login failed:', error.message)
      }
      throw new ApiError(401, 'Invalid email or password')
    }

    const admin = await prisma.adminProfile.findUnique({
      where: { authUserId: data.user.id },
      select: { id: true, email: true, displayName: true, role: true, active: true },
    })

    if (!admin?.active) {
      throw new ApiError(403, 'This account does not have active administrator access')
    }

    await prisma.auditLog.create({
      data: {
        adminId: admin.id,
        action: 'ADMIN_LOGIN',
        resourceType: 'AdminProfile',
        resourceId: admin.id,
        metadata: { requestId: request.requestId },
      },
    })

    response.json({
      success: true,
      data: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in,
        admin: publicAdmin(admin),
      },
    })
  } catch (error) {
    next(error)
  }
})

adminAuthRouter.post('/refresh', async (request, response, next) => {
  try {
    const parsed = refreshSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError(400, 'A valid refresh token is required')

    const auth = createSupabaseAuthClient()
    const { data, error } = await auth.auth.refreshSession({ refresh_token: parsed.data.refreshToken })
    if (error || !data.user || !data.session) {
      throw new ApiError(401, 'Your session could not be refreshed')
    }

    const admin = await prisma.adminProfile.findUnique({
      where: { authUserId: data.user.id },
      select: { id: true, email: true, displayName: true, role: true, active: true },
    })
    if (!admin?.active) throw new ApiError(403, 'Administrator access is inactive')

    response.json({
      success: true,
      data: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in,
        admin: publicAdmin(admin),
      },
    })
  } catch (error) {
    next(error)
  }
})

adminAuthRouter.get('/me', requireAdmin, (request, response) => {
  response.json({ success: true, data: { admin: publicAdmin(request.admin!) } })
})
