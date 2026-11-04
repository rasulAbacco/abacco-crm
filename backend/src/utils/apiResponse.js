// Every endpoint answers with the same envelope:
//   { success: true, data, meta? }  |  { success: false, error: { code, message, details?, requestId } }
export function ok(res, data, meta, status = 200) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export function created(res, data) {
  return ok(res, data, undefined, 201);
}

export function noContent(res) {
  return res.status(204).end();
}

export function paginated(res, items, { page, pageSize, total }) {
  return ok(res, items, {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}
