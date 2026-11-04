import { leadService, leadFilters, convertLead, importLeads } from './leads.service.js';
import { createRecordController } from '../../services/records/recordController.js';
import { ok } from '../../utils/apiResponse.js';
import { requestContext } from '../../services/audit/auditService.js';

const base = createRecordController(leadService, {
  filterWhere: leadFilters,
  exportName: 'leads',
  exportColumns: [
    { key: 'fullName', header: 'Name' }, { key: 'firstName', header: 'First name' }, { key: 'lastName', header: 'Last name' },
    { key: 'email', header: 'Email' }, { key: 'phone', header: 'Phone', value: (r) => r.phoneE164 ?? r.phoneRaw },
    { key: 'companyName', header: 'Company' }, { key: 'designation', header: 'Designation' }, { key: 'website', header: 'Website' },
    { key: 'countryCode', header: 'Country' }, { key: 'region', header: 'Region' }, { key: 'city', header: 'City' }, { key: 'timezone', header: 'Timezone' },
    { key: 'source', header: 'Source' }, { key: 'status', header: 'Status' }, { key: 'priority', header: 'Priority' }, { key: 'score', header: 'Score' },
    { key: 'tags', header: 'Tags', value: (r) => r.tags.map((t) => t.name).join('; ') },
    { key: 'salesId', header: 'Sales ID', value: (r) => r.ownerWorkspace?.code },
    { key: 'createdAt', header: 'Created (UTC)' },
  ],
});

export default {
  ...base,
  convert: async (req, res) => ok(res, await convertLead(req.scope, req.valid.params.id, req.valid.body, requestContext(req))),
  importFile: async (req, res) => ok(res, await importLeads(req.scope, req.file, req.valid.query, requestContext(req))),
};
