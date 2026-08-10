import { Router } from 'express'
import { healthRouter } from './health.routes.js'
import { adminAuthRouter } from './admin-auth.routes.js'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/admin/auth', adminAuthRouter)
