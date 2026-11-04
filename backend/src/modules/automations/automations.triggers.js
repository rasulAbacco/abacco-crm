// Subscribes automations to domain events published by the CRM modules.
import prisma from '../../prisma/client.js';
import { subscribe } from '../../services/events/eventBus.js';
import { enrollPeople } from './automations.service.js';

async function active(workspaceId, triggerType) {
  return prisma.automation.findMany({ where: { ownerWorkspaceId: workspaceId, triggerType, status: 'ACTIVE', deletedAt: null } });
}

export function registerAutomationTriggers() {
  subscribe('lead.created', async ({ workspaceId, record }) => {
    for (const a of await active(workspaceId, 'LEAD_CREATED')) {
      if (a.triggerConfig?.source && a.triggerConfig.source !== record.source) continue;
      await enrollPeople(a, [{ leadId: record.id, email: record.email }]);
    }
  });
  subscribe('lead.status_changed', async ({ workspaceId, record }) => {
    for (const a of await active(workspaceId, 'LEAD_STATUS_CHANGED')) {
      if (a.triggerConfig?.status && a.triggerConfig.status !== record.status) continue;
      await enrollPeople(a, [{ leadId: record.id, email: record.email }]);
    }
  });
  subscribe('contact.created', async ({ workspaceId, record }) => {
    for (const a of await active(workspaceId, 'CONTACT_CREATED')) await enrollPeople(a, [{ contactId: record.id, email: record.email }]);
  });
  subscribe('list.joined', async ({ workspaceId, listId, contactIds }) => {
    const autos = (await active(workspaceId, 'LIST_JOINED')).filter((a) => a.triggerConfig?.listId === listId);
    if (!autos.length) return;
    const contacts = await prisma.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, email: true } });
    for (const a of autos) await enrollPeople(a, contacts.map((c) => ({ contactId: c.id, email: c.email })));
  });
}
