export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, code = 'APP_ERROR', details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, message, 'BAD_REQUEST', details);
}

export function unauthorized(message = 'برای ادامه باید وارد شوید.'): AppError {
  return new AppError(401, message, 'UNAUTHORIZED');
}

export function forbidden(message = 'دسترسی لازم برای این عملیات را ندارید.'): AppError {
  return new AppError(403, message, 'FORBIDDEN');
}

export function notFound(message = 'موردی پیدا نشد.'): AppError {
  return new AppError(404, message, 'NOT_FOUND');
}

export function conflict(message: string): AppError {
  return new AppError(409, message, 'CONFLICT');
}
