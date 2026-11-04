import { companyService, companyFilters } from './companies.service.js';
import { createRecordController } from '../../services/records/recordController.js';

export default createRecordController(companyService, {
  filterWhere: companyFilters,
  exportName: 'companies',
  exportColumns: [
    { key: 'name', header: 'Name' }, { key: 'website', header: 'Website' }, { key: 'industry', header: 'Industry' }, { key: 'size', header: 'Size' },
    { key: 'email', header: 'Email' }, { key: 'phone', header: 'Phone', value: (r) => r.phoneE164 ?? r.phoneRaw }, { key: 'city', header: 'City' },
    { key: 'region', header: 'Region' }, { key: 'countryCode', header: 'Country' }, { key: 'contacts', header: 'Contacts', value: (r) => r._count?.contacts },
    { key: 'salesId', header: 'Sales ID', value: (r) => r.ownerWorkspace?.code }, { key: 'createdAt', header: 'Created (UTC)' },
  ],
});
