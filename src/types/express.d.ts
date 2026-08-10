declare global {
  namespace Express {
    interface Request {
      requestId: string
      accessToken?: string
      admin?: {
        id: string
        authUserId: string
        email: string
        displayName: string | null
        role: 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR'
        active: boolean
      }
    }
  }
}

export {}
