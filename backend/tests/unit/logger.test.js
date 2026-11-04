import { describe, it, expect } from 'vitest';
import pino from 'pino';
import { REDACT_PATHS } from '../../src/config/logger.js';

describe('log redaction', () => {
  it('never writes passwords, tokens or credentials', () => {
    const lines = [];
    const log = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, { write: (l) => lines.push(l) });
    log.info({ password: 'p1', body: { password: 'p2', token: 't', credentials: { pass: 'c' } }, req: { headers: { authorization: 'Bearer abc', cookie: 'abacco_rt=xyz' } } }, 'x');
    const out = lines.join('');
    for (const secret of ['p1', 'p2', '"t"', 'Bearer abc', 'abacco_rt=xyz', '"c"']) expect(out).not.toContain(secret);
  });
});
