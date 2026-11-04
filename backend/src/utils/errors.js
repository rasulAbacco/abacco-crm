// Operational errors carry an HTTP status and a stable machine-readable code.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = true;
  }
}

export const badRequest = (message, details) => new AppError(400, 'BAD_REQUEST', message, details);
export const validationError = (details) =>
  new AppError(422, 'VALIDATION_ERROR', 'Some fields are invalid.', details);
export const unauthorized = (message = 'Authentication required.', code = 'UNAUTHORIZED') =>
  new AppError(401, code, message);
export const forbidden = (message = 'You do not have access to this resource.', code = 'FORBIDDEN') =>
  new AppError(403, code, message);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found.`);
export const conflict = (message, code = 'CONFLICT', details) => new AppError(409, code, message, details);
export const tooMany = (message = 'Too many requests. Please try again later.') =>
  new AppError(429, 'RATE_LIMITED', message);
