import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;

// Shared list-query contract: ?page=1&pageSize=25&sort=-createdAt&q=term
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
  sort: z.string().max(64).optional(),
  q: z.string().trim().max(200).optional(),
});

export function toSkipTake({ page, pageSize }) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

// "-createdAt" → { createdAt: 'desc' }; only whitelisted fields are accepted.
export function toOrderBy(sort, allowed, fallback = { createdAt: 'desc' }) {
  if (!sort) return fallback;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  if (!allowed.includes(field)) return fallback;
  return { [field]: desc ? 'desc' : 'asc' };
}
