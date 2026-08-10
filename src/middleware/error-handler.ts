import type { NextFunction, Request, Response } from 'express'

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
  }
}

export function notFound(request: Request, _response: Response, next: NextFunction) {
  next(new ApiError(404, `Route ${request.method} ${request.originalUrl} was not found`))
}

export function errorHandler(
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction,
) {
  const apiError = error instanceof ApiError ? error : new ApiError(500, 'Internal server error')

  if (apiError.statusCode >= 500) {
    console.error(`[${request.requestId}]`, error)
  }

  response.status(apiError.statusCode).json({
    success: false,
    error: {
      message: apiError.message,
      ...(apiError.details === undefined ? {} : { details: apiError.details }),
    },
    requestId: request.requestId,
  })
}
