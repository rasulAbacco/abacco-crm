// Aggregate statistics per Sales ID, computed with grouped queries (one query
// per table, never one per Sales ID) so the list stays fast as data grows.
import prisma from '../../prisma/client.js';

function countMap(rows, key = 'ownerWorkspaceId') {
  return new Map(rows.map((r) => [r[key], r._count._all]));
}

function moneyMap(rows) {
  const out = new Map();
  for (const r of rows) {
    const list = out.get(r.ownerWorkspaceId) ?? [];
    list.push({ currency: r.currency, amountMinor: (r._sum.amountMinor ?? 0n).toString(), count: r._count._all });
    out.set(r.ownerWorkspaceId, list);
  }
  return out;
}

export async function workspaceStats(accountId, workspaceIds, db = prisma) {
  if (workspaceIds.length === 0) return new Map();
  const live = { accountId, ownerWorkspaceId: { in: workspaceIds }, deletedAt: null };
  const by = ['ownerWorkspaceId'];

  const [leads, contacts, companies, openDeals, wonDeals, lostDeals, openTasks, overdueTasks, campaigns, lists, smtp, sharedIn, sharedOut] =
    await Promise.all([
      db.lead.groupBy({ by, where: live, _count: { _all: true } }),
      db.contact.groupBy({ by, where: live, _count: { _all: true } }),
      db.company.groupBy({ by, where: live, _count: { _all: true } }),
      db.deal.groupBy({ by: ['ownerWorkspaceId', 'currency'], where: { ...live, status: 'OPEN' }, _sum: { amountMinor: true }, _count: { _all: true } }),
      db.deal.groupBy({ by: ['ownerWorkspaceId', 'currency'], where: { ...live, status: 'WON' }, _sum: { amountMinor: true }, _count: { _all: true } }),
      db.deal.groupBy({ by, where: { ...live, status: 'LOST' }, _count: { _all: true } }),
      db.task.groupBy({ by, where: { ...live, status: { in: ['TODO', 'IN_PROGRESS'] } }, _count: { _all: true } }),
      db.task.groupBy({ by, where: { ...live, status: { in: ['TODO', 'IN_PROGRESS'] }, dueAt: { lt: new Date() } }, _count: { _all: true } }),
      db.campaign.groupBy({ by, where: live, _count: { _all: true } }),
      db.emailList.groupBy({ by, where: live, _count: { _all: true } }),
      db.smtpAccountWorkspace.groupBy({ by: ['workspaceId'], where: { workspaceId: { in: workspaceIds }, smtpAccount: { deletedAt: null } }, _count: { _all: true } }),
      db.recordShare.groupBy({ by: ['targetWorkspaceId'], where: { accountId, targetWorkspaceId: { in: workspaceIds }, revokedAt: null }, _count: { _all: true } }),
      db.recordShare.groupBy({ by, where: { accountId, ownerWorkspaceId: { in: workspaceIds }, revokedAt: null }, _count: { _all: true } }),
    ]);

  const maps = {
    leads: countMap(leads),
    contacts: countMap(contacts),
    companies: countMap(companies),
    lostDeals: countMap(lostDeals),
    openTasks: countMap(openTasks),
    overdueTasks: countMap(overdueTasks),
    campaigns: countMap(campaigns),
    emailLists: countMap(lists),
    smtpAccounts: countMap(smtp, 'workspaceId'),
    sharedWithMe: countMap(sharedIn, 'targetWorkspaceId'),
    sharedByMe: countMap(sharedOut),
  };
  const pipeline = moneyMap(openDeals);
  const won = moneyMap(wonDeals);

  const result = new Map();
  for (const id of workspaceIds) {
    const pipelineValue = pipeline.get(id) ?? [];
    const wonRevenue = won.get(id) ?? [];
    const wonCount = wonRevenue.reduce((s, r) => s + r.count, 0);
    const lostCount = maps.lostDeals.get(id) ?? 0;
    result.set(id, {
      leads: maps.leads.get(id) ?? 0,
      contacts: maps.contacts.get(id) ?? 0,
      companies: maps.companies.get(id) ?? 0,
      openDeals: pipelineValue.reduce((s, r) => s + r.count, 0),
      wonDeals: wonCount,
      lostDeals: lostCount,
      // Win rate of closed deals; null until something has closed.
      winRate: wonCount + lostCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 1000) / 10 : null,
      // Grouped by currency — amounts in different currencies are never added together.
      pipelineValue: pipelineValue.map(({ currency, amountMinor }) => ({ currency, amountMinor })),
      wonRevenue: wonRevenue.map(({ currency, amountMinor }) => ({ currency, amountMinor })),
      openTasks: maps.openTasks.get(id) ?? 0,
      overdueTasks: maps.overdueTasks.get(id) ?? 0,
      campaigns: maps.campaigns.get(id) ?? 0,
      emailLists: maps.emailLists.get(id) ?? 0,
      smtpAccounts: maps.smtpAccounts.get(id) ?? 0,
      sharedWithMe: maps.sharedWithMe.get(id) ?? 0,
      sharedByMe: maps.sharedByMe.get(id) ?? 0,
    });
  }
  return result;
}
