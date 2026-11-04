import * as s from './emailLists.service.js';
import { importContacts } from '../contacts/contacts.service.js';
import { ok, created, paginated } from '../../utils/apiResponse.js';
import { requestContext } from '../../services/audit/auditService.js';
import { sendTable } from '../../services/files/tabularService.js';

const ctx = requestContext;
export const list = async (req, res) => { const q = req.valid.query; const r = await s.listLists(req.scope, q); return paginated(res, r.items, { ...q, total: r.total }); };
export const get = async (req, res) => ok(res, await s.getList(req.scope, req.valid.params.id));
export const create = async (req, res) => created(res, await s.createList(req.scope, req.valid.body, ctx(req)));
export const update = async (req, res) => ok(res, await s.updateList(req.scope, req.valid.params.id, req.valid.body, ctx(req)));
export const remove = async (req, res) => ok(res, await s.deleteList(req.scope, req.valid.params.id, ctx(req)));
export const members = async (req, res) => { const q = req.valid.query; const r = await s.members(req.scope, req.valid.params.id, q); return paginated(res, r.items, { ...q, total: r.total }); };
export const addMembers = async (req, res) => ok(res, await s.addMembers(req.scope, req.valid.params.id, req.valid.body, ctx(req)));
export const addSegment = async (req, res) => ok(res, await s.addSegment(req.scope, req.valid.params.id, req.valid.body, ctx(req)));
export const removeMembers = async (req, res) => ok(res, await s.removeMembers(req.scope, req.valid.params.id, req.valid.body, ctx(req)));
export const importFile = async (req, res) => {
  const list = await s.findList(req.scope, req.valid.params.id);
  return ok(res, await importContacts(req.scope.mode === 'single' ? req.scope : { ...req.scope }, req.file, { ownerWorkspaceId: list.ownerWorkspaceId, listId: list.id, consentBasis: req.query.consentBasis, updateExisting: req.query.updateExisting === 'true' }, ctx(req)));
};
export const exportFile = async (req, res) => {
  const rows = await s.exportMembers(req.scope, req.valid.params.id, req.valid.query.status);
  return sendTable(res, {
    format: req.valid.query.format,
    filename: 'list-members',
    rows,
    columns: [
      { key: 'email', header: 'Email', value: (r) => r.contact.email }, { key: 'firstName', header: 'First name', value: (r) => r.contact.firstName },
      { key: 'lastName', header: 'Last name', value: (r) => r.contact.lastName }, { key: 'country', header: 'Country', value: (r) => r.contact.countryCode },
      { key: 'timezone', header: 'Timezone', value: (r) => r.contact.timezone }, { key: 'status', header: 'Status' }, { key: 'addedAt', header: 'Added (UTC)' },
    ],
  });
};
