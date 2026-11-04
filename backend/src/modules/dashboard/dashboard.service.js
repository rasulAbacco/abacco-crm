import prisma from '../../prisma/client.js';
import * as r from '../reports/reports.repository.js';
import { cached } from '../../services/cache/cacheService.js';
import { recentActivities } from '../notes-activities/notes.service.js';

// Every number comes from the database; cached for 30 seconds per scope + filter.
export async function dashboard(scope, q) {
  const from = q.from ?? new Date(Date.now() - 30 * 86400000);
  const to = q.to ?? new Date();
  const query = { ...q, from, to };
  const stats = await cached(`dash:${scope.accountId}:${scope.workspaceId ?? 'all'}:${JSON.stringify(query)}`, 30, async () => {
    const [sales, email, trends, comparison] = await Promise.all([
      r.salesSummary(scope, query),
      r.emailSummary(scope, query),
      r.trends(scope, { from, to, unit: to - from > 120 * 86400000 ? 'month' : to - from > 45 * 86400000 ? 'week' : 'day' }),
      scope.mode === 'all' ? r.salesIdComparison(scope.accountId, { from, to }) : Promise.resolve(null),
    ]);
    return { sales, email: { totals: email.totals, rates: email.rates }, trends, comparison };
  });
  const w = r.owned(scope);
  const [activities, recentLeads, upcomingTasks, recentCampaigns] = await Promise.all([
    recentActivities(scope, 10),
    prisma.lead.findMany({ where: w, orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, fullName: true, companyName: true, status: true, source: true, createdAt: true, ownerWorkspace: { select: { code: true } } } }),
    prisma.task.findMany({ where: { ...w, status: { in: ['TODO', 'IN_PROGRESS'] } }, orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }], take: 6, select: { id: true, title: true, dueAt: true, priority: true, type: true } }),
    prisma.campaign.findMany({ where: w, orderBy: { updatedAt: 'desc' }, take: 5, select: { id: true, name: true, status: true, startedAt: true } }),
  ]);
  const ids = recentCampaigns.map((c) => c.id);
  const progress = ids.length ? await prisma.campaignRecipient.groupBy({ by: ['campaignId', 'status'], where: { campaignId: { in: ids } }, _count: { _all: true } }) : [];
  const prog = {};
  for (const p of progress) (prog[p.campaignId] ??= {})[p.status] = p._count._all;
  return { range: { from, to }, ...stats, activities, recentLeads, upcomingTasks, recentCampaigns: recentCampaigns.map((c) => ({ ...c, progress: prog[c.id] ?? {} })) };
}
