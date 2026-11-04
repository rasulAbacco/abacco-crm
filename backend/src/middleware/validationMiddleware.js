// validate({ body, query, params }) parses each part with its Zod schema and
// stores the cleaned result on req.valid so handlers never touch raw input.
import { AppError } from '../utils/errors.js';
import { formatZod } from './errorMiddleware.js';

export function validate(schemas) {
  return (req, _res, next) => {
    req.valid = req.valid ?? {};
    for (const part of ['params', 'query', 'body']) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        return next(new AppError(422, 'VALIDATION_ERROR', 'Some fields are invalid.', formatZod(result.error)));
      }
      req.valid[part] = result.data;
    }
    return next();
  };
}

export default validate;
