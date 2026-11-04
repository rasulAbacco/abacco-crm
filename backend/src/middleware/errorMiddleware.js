import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors.js';
import logger from '../config/logger.js';

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { code: 'ROUTE_NOT_FOUND', message: `No route for ${req.method} ${req.path}`, requestId: req.id },
  });
}

function translate(err) {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    return new AppError(422, 'VALIDATION_ERROR', 'Some fields are invalid.', formatZod(err));
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return new AppError(409, 'DUPLICATE', 'A record with the same unique value already exists.', {
        fields: err.meta?.target ?? err.meta?.driverAdapterError?.cause?.constraint?.fields,
      });
    }
    if (err.code === 'P2025') return new AppError(404, 'NOT_FOUND', 'Record not found.');
    if (err.code === 'P2003') return new AppError(409, 'RELATION_CONSTRAINT', 'A related record prevents this change.');
  }
  if (err?.type === 'entity.parse.failed') return new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
  if (err?.type === 'entity.too.large') return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  return null;
}

export function formatZod(err) {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

// Never leaks stack traces, SQL or secrets: unknown errors become a generic 500
// and the detail goes only to the (redacting) log, tagged with the request id.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const known = translate(err);
  if (!known) {
    (req.log ?? logger).error({ err, requestId: req.id }, 'unhandled error');
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.', requestId: req.id },
    });
  }
  if (known.status >= 500) (req.log ?? logger).error({ err, requestId: req.id }, known.message);
  const body = { code: known.code, message: known.message, requestId: req.id };
  if (known.details !== undefined) body.details = known.details;
  return res.status(known.status).json({ success: false, error: body });
}
