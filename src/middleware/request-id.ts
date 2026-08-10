import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

export function requestId(request: Request, response: Response, next: NextFunction) {
  const id = request.get('x-request-id') || randomUUID()
  request.requestId = id
  response.setHeader('x-request-id', id)
  next()
}
