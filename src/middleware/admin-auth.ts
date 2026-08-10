import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../config/prisma.js'
import { supabaseAdmin } from '../config/supabase.js'
import { ApiError } from './error-handler.js'

export async function requireAdmin(request: Request, _response: Response, next: NextFunction) {
  try {
    const authorization = request.get('authorization')
    const [scheme, accessToken] = authorization?.split(' ') ?? []

    if (scheme?.toLowerCase() !== 'bearer' || !accessToken) {
      throw new ApiError(401, 'Authentication is required')
    }

    const { data, error } = await supabaseAdmin.auth.getUser(accessToken)
    if (error || !data.user) throw new ApiError(401, 'Your session is invalid or has expired')

    const admin = await prisma.adminProfile.findUnique({
      where: { authUserId: data.user.id },
      select: { id: true, authUserId: true, email: true, displayName: true, role: true, active: true },
    })

    if (!admin?.active) {
      throw new ApiError(403, 'This account does not have active administrator access')
    }

    request.admin = admin
    request.accessToken = accessToken
    next()
  } catch (error) {
    next(error)
  }
}
