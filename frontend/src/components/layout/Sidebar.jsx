import { NavLink } from 'react-router-dom';
import { FiGrid, FiUserPlus, FiUsers, FiBriefcase, FiTrello, FiCheckSquare, FiSend, FiList, FiFileText, FiZap, FiServer, FiBarChart2, FiLayers, FiSettings, FiX } from 'react-icons/fi';
import { useUiStore } from '../../store/uiStore';

export const NAV = [
  { group: null, items: [{ to: '/', label: 'Dashboard', icon: FiGrid, end: true }] },
  { group: 'Sales', items: [
    { to: '/leads', label: 'Leads', icon: FiUserPlus }, { to: '/contacts', label: 'Contacts', icon: FiUsers }, { to: '/companies', label: 'Companies', icon: FiBriefcase },
    { to: '/deals', label: 'Deals', icon: FiTrello }, { to: '/tasks', label: 'Tasks', icon: FiCheckSquare },
  ] },
  { group: 'Email marketing', items: [
    { to: '/campaigns', label: 'Campaigns', icon: FiSend }, { to: '/email-lists', label: 'Email lists', icon: FiList }, { to: '/templates', label: 'Templates', icon: FiFileText },
    { to: '/automations', label: 'Automations', icon: FiZap }, { to: '/smtp-accounts', label: 'SMTP accounts', icon: FiServer },
  ] },
  { group: 'Insights', items: [{ to: '/reports', label: 'Reports', icon: FiBarChart2 }] },
  { group: 'Administration', items: [{ to: '/sales-ids', label: 'Sales IDs', icon: FiLayers }, { to: '/settings', label: 'Settings', icon: FiSettings }] },
];

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useUiStore();
  return (
    <>
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-ink-900/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-ink-200 bg-white transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-14 items-center justify-between border-b border-ink-200 px-4">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            <div className="leading-tight"><p className="text-sm font-semibold">Abacco CRM</p><p className="text-[11px] text-ink-500">Sales & email marketing</p></div>
          </div>
          <button className="rounded p-1 text-ink-500 hover:bg-ink-100 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><FiX /></button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {NAV.map((sec) => (
            <div key={sec.group ?? 'main'} className="mb-4">
              {sec.group && <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{sec.group}</p>}
              {sec.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) => `mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-700 hover:bg-ink-100'}`}>
                  <Icon className="h-4 w-4 shrink-0" />{label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
