import { Router } from 'express'
import { healthRouter } from './health.routes.js'
import { adminAuthRouter } from './admin-auth.routes.js'
import { paymentsRouter } from './payments.routes.js'
import { publicationsRouter } from './publications.routes.js'
import { downloadsRouter } from './downloads.routes.js'
import { adminPublicationsRouter } from './admin-publications.routes.js'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/admin/auth', adminAuthRouter)
apiRouter.use('/publications', publicationsRouter)
apiRouter.use('/payments', paymentsRouter)
apiRouter.use('/downloads', downloadsRouter)
apiRouter.use('/admin/publications', adminPublicationsRouter)
