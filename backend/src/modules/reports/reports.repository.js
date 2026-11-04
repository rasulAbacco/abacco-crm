// Aggregations shared by the dashboard and the reports module. Records are
// counted for their owning Sales ID only (shared copies are not counted twice).
import prisma from '../../prisma/client.js';
import { Prisma } from '@prisma/client';

export const owned = (scope) => ({ accountId: scope.accountId, deletedAt: null, ...(scope.mode === 'single' ? { ownerWorkspaceId: scope.workspaceId } : {}) });
const range = (from, to) => ({ ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) });
const wsSql = (scope, col = '"ownerWorkspaceId"') => (scope.mode === 'single' ? Prisma.sql`AND ${Prisma.raw(col)} = ${scope.workspaceId}::uuid` : Prisma.empty);

function money(rows) {
  return rows.map((r) => ({ currency: r.currency, amountMinor: (r._sum.amountMinor ?? 0n).toString(), count: r._count._all }));
}

export async function salesSummary(scope, { from, to, source }) {
  const w = owned(scope);
  const leadW = { ...w, ...(source ? { source } : {}) };
  const created = range(from, to);
  const [leads, leadsInRange, converted, contacts, companies, openDeals, pipeline, won, lost, leadsBySource, leadsByStatus, dealsByStage, openTasks, overdueTasks, followUps, upcomingTasks] = await Promise.all([
    prisma.lead.count({ where: leadW }),
    prisma.lead.count({ where: { ...leadW, createdAt: created } }),
    prisma.lead.count({ where: { ...leadW, createdAt: created, status: 'CONVERTED' } }),
    prisma.contact.count({ where: w }),
    prisma.company.count({ where: w }),
    prisma.deal.count({ where: { ...w, status: 'OPEN' } }),
    prisma.deal.groupBy({ by: ['currency'], where: { ...w, status: 'OPEN' }, _sum: { amountMinor: true }, _count: { _all: true } }),
    prisma.deal.groupBy({ by: ['currency'], where: { ...w, status: 'WON', closedAt: created }, _sum: { amountMinor: true }, _count: { _all: true } }),
    prisma.deal.count({ where: { ...w, status: 'LOST', closedAt: created } }),
    prisma.lead.groupBy({ by: ['source'], where: { ...leadW, createdAt: created }, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ['status'], where: { ...leadW, createdAt: created }, _count: { _all: true } }),
    prisma.$queryRaw`SELECT s.name AS stage, s.kind, d.currency, count(*)::int AS count, coalesce(sum(d."amountMinor"),0)::text AS "amountMinor", min(s.position) AS position
      FROM deals d JOIN pipeline_stages s ON s.id = d."stageId"
      WHERE d."accountId" = ${scope.accountId}::uuid AND d."deletedAt" IS NULL ${wsSql(scope, 'd."ownerWorkspaceId"')}
      GROUP BY s.name, s.kind, d.currency ORDER BY position`,
    prisma.task.count({ where: { ...w, status: { in: ['TODO', 'IN_PROGRESS'] } } }),
    prisma.task.count({ where: { ...w, status: { in: ['TODO', 'IN_PROGRESS'] }, dueAt: { lt: new Date() } } }),
    prisma.task.count({ where: { ...w, status: { in: ['TODO', 'IN_PROGRESS'] }, type: { in: ['FOLLOW_UP', 'CALL'] } } }),
    prisma.task.count({ where: { ...w, status: { in: ['TODO', 'IN_PROGRESS'] }, dueAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 86400000) } } }),
  ]);
  const wonCount = won.reduce((s, r) => s + r._count._all, 0);
  return {
    totals: { leads, leadsInRange, contacts, companies, openDeals, lostDeals: lost, wonDeals: wonCount, openTasks, overdueTasks, pendingFollowUps: followUps, upcomingTasks },
    conversionRate: leadsInRange ? Math.round((converted / leadsInRange) * 1000) / 10 : 0,
    winRate: wonCount + lost ? Math.round((wonCount / (wonCount + lost)) * 1000) / 10 : null,
    pipelineValue: money(pipeline),
    wonRevenue: money(won),
    leadsBySource: leadsBySource.map((r) => ({ source: r.source ?? 'Unknown', count: r._count._all })).sort((a, b) => b.count - a.count),
    leadsByStatus: leadsByStatus.map((r) => ({ status: r.status, count: r._count._all })),
    dealsByStage,
  };
}

export async function trends(scope, { from, to, unit = 'day' }) {
  const trunc = Prisma.raw(`'${unit === 'month' ? 'month' : unit === 'week' ? 'week' : 'day'}'`);
  const f = from ?? new Date(Date.now() - 30 * 86400000);
  const t = to ?? new Date();
  const [leads, revenue, email] = await Promise.all([
    prisma.$queryRaw`SELECT date_trunc(${trunc}, "createdAt") AS bucket, count(*)::int AS count FROM leads
      WHERE "accountId" = ${scope.accountId}::uuid AND "deletedAt" IS NULL AND "createdAt" BETWEEN ${f} AND ${t} ${wsSql(scope)} GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw`SELECT date_trunc(${trunc}, "closedAt") AS bucket, currency, sum("amountMinor")::text AS "amountMinor", count(*)::int AS count FROM deals
      WHERE "accountId" = ${scope.accountId}::uuid AND "deletedAt" IS NULL AND status = 'WON' AND "closedAt" BETWEEN ${f} AND ${t} ${wsSql(scope)} GROUP BY 1, 2 ORDER BY 1`,
    prisma.$queryRaw`SELECT date_trunc(${trunc}, coalesce(r."sentAt", r."updatedAt")) AS bucket,
        count(*) FILTER (WHERE r."sentAt" IS NOT NULL)::int AS sent, count(*) FILTER (WHERE r.status = 'FAILED')::int AS failed, count(*) FILTER (WHERE r.status = 'BOUNCED')::int AS bounced
      FROM campaign_recipients r JOIN campaigns c ON c.id = r."campaignId"
      WHERE c."accountId" = ${scope.accountId}::uuid ${wsSql(scope, 'c."ownerWorkspaceId"')} AND coalesce(r."sentAt", r."updatedAt") BETWEEN ${f} AND ${t} AND (r."sentAt" IS NOT NULL OR r.status IN ('FAILED','BOUNCED'))
      GROUP BY 1 ORDER BY 1`,
  ]);
  return { leads, revenue, email };
}

export async function emailSummary(scope, { from, to, campaignId }) {
  const cw = { accountId: scope.accountId, deletedAt: null, ...(scope.mode === 'single' ? { ownerWorkspaceId: scope.workspaceId } : {}), ...(campaignId ? { id: campaignId } : {}) };
  const rw = { campaign: cw };
  const sentRange = range(from, to);
  const [activeCampaigns, accepted, failed, bounced, opens, clicks, unsubs, delivered, complaints, campaigns] = await Promise.all([
    prisma.campaign.count({ where: { ...cw, status: { in: ['SCHEDULED', 'QUEUED', 'SENDING', 'PAUSED'] } } }),
    prisma.campaignRecipient.count({ where: { ...rw, sentAt: { not: null, ...sentRange } } }),
    prisma.campaignRecipient.count({ where: { ...rw, status: 'FAILED', updatedAt: sentRange } }),
    prisma.campaignRecipient.count({ where: { ...rw, status: 'BOUNCED', updatedAt: sentRange } }),
    prisma.campaignRecipient.count({ where: { ...rw, sentAt: { not: null, ...sentRange }, firstOpenedAt: { not: null } } }),
    prisma.campaignRecipient.count({ where: { ...rw, sentAt: { not: null, ...sentRange }, firstClickedAt: { not: null } } }),
    prisma.campaignRecipient.count({ where: { ...rw, sentAt: { not: null, ...sentRange }, unsubscribedAt: { not: null } } }),
    prisma.emailEvent.count({ where: { campaign: cw, type: 'DELIVERED', occurredAt: sentRange } }),
    prisma.emailEvent.count({ where: { campaign: cw, type: 'COMPLAINED', occurredAt: sentRange } }),
    prisma.campaign.findMany({ where: cw, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, name: true, status: true, startedAt: true, completedAt: true, ownerWorkspace: { select: { code: true } } } }),
  ]);
  const rate = (n) => (accepted ? Math.round((n / accepted) * 1000) / 10 : 0);
  const ids = campaigns.map((c) => c.id);
  const per = ids.length
    ? await prisma.$queryRaw`SELECT "campaignId", count(*)::int AS total, count(*) FILTER (WHERE "sentAt" IS NOT NULL)::int AS accepted, count(*) FILTER (WHERE status='FAILED')::int AS failed,
        count(*) FILTER (WHERE status='BOUNCED')::int AS bounced, count(*) FILTER (WHERE "firstOpenedAt" IS NOT NULL)::int AS opens, count(*) FILTER (WHERE "firstClickedAt" IS NOT NULL)::int AS clicks,
        count(*) FILTER (WHERE "unsubscribedAt" IS NOT NULL)::int AS unsubscribed, count(*) FILTER (WHERE status IN ('SUPPRESSED','SKIPPED'))::int AS excluded
        FROM campaign_recipients WHERE "campaignId" = ANY(${ids}::uuid[]) GROUP BY 1`
    : [];
  const perMap = Object.fromEntries(per.map((p) => [p.campaignId, p]));
  return {
    totals: { activeCampaigns, accepted, failed, bounced, uniqueOpens: opens, uniqueClicks: clicks, unsubscribed: unsubs, deliveredEvents: delivered, complaints },
    rates: { bounceRate: rate(bounced), openRateEstimated: rate(opens), clickRate: rate(clicks), unsubscribeRate: rate(unsubs) },
    campaigns: campaigns.map((c) => ({ ...c, stats: perMap[c.id] ?? null })),
  };
}

export async function smtpPerformance(scope, { from, to }) {
  const f = from ?? new Date(Date.now() - 30 * 86400000);
  const t = to ?? new Date();
  return prisma.$queryRaw`SELECT a.id, a.name, a."fromEmail", a.provider, a.health,
      count(r.id) FILTER (WHERE r."sentAt" IS NOT NULL)::int AS accepted, count(r.id) FILTER (WHERE r.status = 'FAILED')::int AS failed, count(r.id) FILTER (WHERE r.status = 'BOUNCED')::int AS bounced
    FROM smtp_accounts a LEFT JOIN campaign_recipients r ON r."smtpAccountId" = a.id AND coalesce(r."sentAt", r."updatedAt") BETWEEN ${f} AND ${t}
    WHERE a."accountId" = ${scope.accountId}::uuid AND a."deletedAt" IS NULL
      ${scope.mode === 'single' ? Prisma.sql`AND EXISTS (SELECT 1 FROM smtp_account_workspaces w WHERE w."smtpAccountId" = a.id AND w."workspaceId" = ${scope.workspaceId}::uuid)` : Prisma.empty}
    GROUP BY a.id ORDER BY accepted DESC`;
}

export async function salesIdComparison(accountId, { from, to }) {
  const f = from ?? new Date(0);
  const t = to ?? new Date();
  return prisma.$queryRaw`SELECT w.id, w.code, w.name, w.status,
      (SELECT count(*) FROM leads l WHERE l."ownerWorkspaceId" = w.id AND l."deletedAt" IS NULL AND l."createdAt" BETWEEN ${f} AND ${t})::int AS leads,
      (SELECT count(*) FROM leads l WHERE l."ownerWorkspaceId" = w.id AND l."deletedAt" IS NULL AND l.status = 'CONVERTED' AND l."createdAt" BETWEEN ${f} AND ${t})::int AS "convertedLeads",
      (SELECT count(*) FROM contacts c WHERE c."ownerWorkspaceId" = w.id AND c."deletedAt" IS NULL)::int AS contacts,
      (SELECT count(*) FROM deals d WHERE d."ownerWorkspaceId" = w.id AND d."deletedAt" IS NULL AND d.status = 'OPEN')::int AS "openDeals",
      (SELECT count(*) FROM deals d WHERE d."ownerWorkspaceId" = w.id AND d."deletedAt" IS NULL AND d.status = 'WON' AND d."closedAt" BETWEEN ${f} AND ${t})::int AS "wonDeals",
      (SELECT count(*) FROM deals d WHERE d."ownerWorkspaceId" = w.id AND d."deletedAt" IS NULL AND d.status = 'LOST' AND d."closedAt" BETWEEN ${f} AND ${t})::int AS "lostDeals",
      (SELECT coalesce(json_agg(json_build_object('currency', x.currency, 'amountMinor', x.amt::text)), '[]') FROM (SELECT currency, sum("amountMinor") amt FROM deals d WHERE d."ownerWorkspaceId" = w.id AND d."deletedAt" IS NULL AND d.status = 'OPEN' GROUP BY currency) x) AS "pipelineValue",
      (SELECT coalesce(json_agg(json_build_object('currency', x.currency, 'amountMinor', x.amt::text)), '[]') FROM (SELECT currency, sum("amountMinor") amt FROM deals d WHERE d."ownerWorkspaceId" = w.id AND d."deletedAt" IS NULL AND d.status = 'WON' AND d."closedAt" BETWEEN ${f} AND ${t} GROUP BY currency) x) AS "wonRevenue",
      (SELECT count(*) FROM campaigns c WHERE c."ownerWorkspaceId" = w.id AND c."deletedAt" IS NULL)::int AS campaigns,
      (SELECT count(*) FROM campaign_recipients r JOIN campaigns c ON c.id = r."campaignId" WHERE c."ownerWorkspaceId" = w.id AND r."sentAt" BETWEEN ${f} AND ${t})::int AS "emailsAccepted",
      (SELECT count(*) FROM campaign_recipients r JOIN campaigns c ON c.id = r."campaignId" WHERE c."ownerWorkspaceId" = w.id AND r."sentAt" BETWEEN ${f} AND ${t} AND r."firstOpenedAt" IS NOT NULL)::int AS "uniqueOpens",
      (SELECT count(*) FROM campaign_recipients r JOIN campaigns c ON c.id = r."campaignId" WHERE c."ownerWorkspaceId" = w.id AND r."sentAt" BETWEEN ${f} AND ${t} AND r."firstClickedAt" IS NOT NULL)::int AS "uniqueClicks",
      (SELECT count(*) FROM campaign_recipients r JOIN campaigns c ON c.id = r."campaignId" WHERE c."ownerWorkspaceId" = w.id AND r.status = 'BOUNCED' AND r."updatedAt" BETWEEN ${f} AND ${t})::int AS bounced
    FROM sales_workspaces w WHERE w."accountId" = ${accountId}::uuid AND w."deletedAt" IS NULL ORDER BY w.code`;
}

export async function activityReport(scope, { from, to }) {
  return prisma.activity.groupBy({ by: ['type'], where: { accountId: scope.accountId, ...(scope.mode === 'single' ? { workspaceId: scope.workspaceId } : {}), occurredAt: range(from, to) }, _count: { _all: true } });
}

export async function taskReport(scope, { from, to }) {
  const w = owned(scope);
  const [done, doneOnTime, created, overdue] = await Promise.all([
    prisma.task.count({ where: { ...w, status: 'DONE', completedAt: range(from, to) } }),
    prisma.$queryRaw`SELECT count(*)::int AS n FROM tasks WHERE "accountId" = ${scope.accountId}::uuid AND "deletedAt" IS NULL AND status = 'DONE' ${wsSql(scope)}
      AND "completedAt" BETWEEN ${from ?? new Date(0)} AND ${to ?? new Date()} AND ("dueAt" IS NULL OR "completedAt" <= "dueAt")`,
    prisma.task.count({ where: { ...w, createdAt: range(from, to) } }),
    prisma.task.count({ where: { ...w, status: { in: ['TODO', 'IN_PROGRESS'] }, dueAt: { lt: new Date() } } }),
  ]);
  return { created, completed: done, completedOnTime: doneOnTime[0].n, overdueNow: overdue };
}
