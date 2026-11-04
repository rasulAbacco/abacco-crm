import { contactService, contactFilters, createContact, recordConsent, eraseContact, importContacts } from './contacts.service.js';
import { createRecordController } from '../../services/records/recordController.js';
import { ok, created } from '../../utils/apiResponse.js';
import { requestContext } from '../../services/audit/auditService.js';

const base = createRecordController(contactService, {
  filterWhere: contactFilters,
  exportName: 'contacts',
  exportColumns: [
    { key: 'firstName', header: 'First name' }, { key: 'lastName', header: 'Last name' }, { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone', value: (r) => r.phoneE164 ?? r.phoneRaw }, { key: 'company', header: 'Company', value: (r) => r.company?.name },
    { key: 'designation', header: 'Designation' }, { key: 'countryCode', header: 'Country' }, { key: 'region', header: 'Region' }, { key: 'city', header: 'City' },
    { key: 'timezone', header: 'Timezone' }, { key: 'source', header: 'Source' }, { key: 'tags', header: 'Tags', value: (r) => r.tags.map((t) => t.name).join('; ') },
    { key: 'salesId', header: 'Sales ID', value: (r) => r.ownerWorkspace?.code }, { key: 'createdAt', header: 'Created (UTC)' },
  ],
});

export default {
  ...base,
  create: async (req, res) => created(res, await createContact(req.scope, req.valid.body, requestContext(req))),
  consent: async (req, res) => ok(res, await recordConsent(req.scope, req.valid.params.id, req.valid.body, requestContext(req))),
  erase: async (req, res) => ok(res, await eraseContact(req.scope, req.valid.params.id, requestContext(req))),
  importFile: async (req, res) => ok(res, await importContacts(req.scope, req.file, req.valid.query, requestContext(req))),
};
