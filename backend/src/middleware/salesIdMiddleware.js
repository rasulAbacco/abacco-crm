// Resolves the active Sales ID for every scoped request from the X-Sales-Id
// header ("all" or a Sales ID uuid). Ownership is enforced here, on the
// server — the frontend switcher only chooses which header to send.
import { z } from 'zod';
import prisma from '../prisma/client.js';
import { AppError, forbidden } from '../utils/errors.js';

const uuid = z.string().uuid();

export async function salesScope(req, _res, next) {
  const raw = String(req.get('X-Sales-Id') ?? 'all').trim();
  if (raw === '' || raw.toLowerCase() === 'all') {
    req.scope = { accountId: req.accountId, mode: 'all', workspaceId: null, workspace: null };
    return next();
  }
  if (!uuid.safeParse(raw).success) {
    return next(new AppError(400, 'INVALID_SALES_ID', 'X-Sales-Id must be "all" or a Sales ID.'));
  }
  const workspace = await prisma.salesWorkspace.findFirst({
    where: { id: raw, accountId: req.accountId, deletedAt: null },
    select: { id: true, code: true, name: true, status: true },
  });
  if (!workspace) return next(forbidden('This Sales ID does not exist or is not yours.', 'SALES_ID_FORBIDDEN'));
  req.scope = { accountId: req.accountId, mode: 'single', workspaceId: workspace.id, workspace };
  return next();
}

// For creating records: the owner is the selected Sales ID, or — when "All
// Sales IDs" is selected — the ownerWorkspaceId supplied in the request body.
export async function resolveWriteWorkspace(scope, explicitWorkspaceId, db = prisma) {
  const id = scope.mode === 'single' ? scope.workspaceId : explicitWorkspaceId;
  if (!id) {
    throw new AppError(400, 'SALES_ID_REQUIRED', 'Choose a Sales ID for this record.');
  }
  if (scope.mode === 'single' && explicitWorkspaceId && explicitWorkspaceId !== scope.workspaceId) {
    throw forbidden('You can only create records in the selected Sales ID.', 'SALES_ID_MISMATCH');
  }
  const ws = await db.salesWorkspace.findFirst({
    where: { id, accountId: scope.accountId, deletedAt: null },
    select: { id: true, status: true, code: true, name: true },
  });
  if (!ws) throw forbidden('This Sales ID does not exist or is not yours.', 'SALES_ID_FORBIDDEN');
  if (ws.status !== 'ACTIVE') {
    throw new AppError(409, 'SALES_ID_INACTIVE', `Sales ID ${ws.code} is not active. Activate it to add records.`);
  }
  return ws;
}

export default salesScope;
