import * as r from './reports.repository.js';
import { cached } from '../../services/cache/cacheService.js';

const key = (scope, q) => `${scope.accountId}:${scope.workspaceId ?? 'all'}:${JSON.stringify(q)}`;

export const sales = (scope, q) => cached(`report:sales:${key(scope, q)}`, 60, async () => ({ ...(await r.salesSummary(scope, q)), tasks: await r.taskReport(scope, q), activities: await r.activityReport(scope, q) }));
export const email = (scope, q) => cached(`report:email:${key(scope, q)}`, 60, async () => ({ ...(await r.emailSummary(scope, q)), smtp: await r.smtpPerformance(scope, q) }));
export const comparison = (scope, q) => cached(`report:cmp:${key(scope, q)}`, 60, () => r.salesIdComparison(scope.accountId, q));
export const trends = (scope, q) => cached(`report:trend:${key(scope, q)}`, 60, () => r.trends(scope, q));

export async function exportRows(scope, q) {
  if (q.report === 'sales-ids') {
    const rows = await r.salesIdComparison(scope.accountId, q);
    return { rows, columns: ['code', 'name', 'leads', 'convertedLeads', 'contacts', 'openDeals', 'wonDeals', 'lostDeals', 'campaigns', 'emailsAccepted', 'uniqueOpens', 'uniqueClicks', 'bounced'].map((k) => ({ key: k, header: k })).concat([
      { key: 'pipelineValue', header: 'pipelineValue (minor units)', value: (x) => x.pipelineValue.map((p) => `${p.currency} ${p.amountMinor}`).join('; ') },
      { key: 'wonRevenue', header: 'wonRevenue (minor units)', value: (x) => x.wonRevenue.map((p) => `${p.currency} ${p.amountMinor}`).join('; ') },
    ]) };
  }
  if (q.report === 'campaigns') {
    const e = await r.emailSummary(scope, q);
    return { rows: e.campaigns, columns: [
      { key: 'name', header: 'Campaign' }, { key: 'salesId', header: 'Sales ID', value: (c) => c.ownerWorkspace.code }, { key: 'status', header: 'Status' },
      ...['total', 'accepted', 'failed', 'bounced', 'opens', 'clicks', 'unsubscribed', 'excluded'].map((k) => ({ key: k, header: k === 'accepted' ? 'accepted (SMTP)' : k === 'opens' ? 'unique opens (estimated)' : k, value: (c) => c.stats?.[k] ?? 0 })),
      { key: 'startedAt', header: 'Started (UTC)' },
    ] };
  }
  if (q.report === 'smtp') {
    const rows = await r.smtpPerformance(scope, q);
    return { rows, columns: ['name', 'fromEmail', 'provider', 'health', 'accepted', 'failed', 'bounced'].map((k) => ({ key: k, header: k })) };
  }
  const s = await r.salesSummary(scope, q);
  return { rows: s.leadsBySource, columns: [{ key: 'source', header: 'Source' }, { key: 'count', header: 'Leads' }] };
}
