import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiMenu, FiBell, FiChevronDown, FiLogOut, FiUser, FiLayers, FiCheck } from 'react-icons/fi';
import { useUiStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { useSalesIdStore } from '../../store/salesIdStore';
import { authApi, notificationsApi, salesIdOptions } from '../../services/commonService';
import { formatRelative } from '../../utils/format';

function useOutside(ref, close) {
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && close();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, close]);
}

export function SalesIdSwitcher() {
  const { selected, options, select, setOptions } = useSalesIdStore();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutside(ref, () => setOpen(false));
  useEffect(() => {
    salesIdOptions().then((r) => setOptions(r.data.data)).catch(() => {});
  }, [setOptions]);
  const current = options.find((o) => o.id === selected);
  return (
    <div className="relative" ref={ref}>
      <button className="flex max-w-[15rem] items-center gap-2 rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-sm hover:bg-ink-50" onClick={() => setOpen(!open)} aria-haspopup="listbox">
        <FiLayers className="shrink-0 text-brand-700" />
        <span className="truncate font-medium">{current ? `${current.code} · ${current.name}` : 'All Sales IDs'}</span>
        <FiChevronDown className="shrink-0 text-ink-500" />
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-1 max-h-80 w-72 overflow-y-auto rounded-lg border border-ink-200 bg-white py-1 shadow-lg" role="listbox">
          {[{ id: 'all', code: 'ALL', name: 'All Sales IDs (consolidated)' }, ...options].map((o) => (
            <button key={o.id} role="option" aria-selected={selected === o.id} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-ink-50" onClick={() => { select(o.id); setOpen(false); }}>
              <span className="min-w-0"><span className="block truncate font-medium">{o.id === 'all' ? o.name : o.name}</span>{o.id !== 'all' && <span className="text-xs text-ink-500">{o.code}{o.status !== 'ACTIVE' ? ' · inactive' : ''}{o.isDefault ? ' · default' : ''}</span>}</span>
              {selected === o.id && <FiCheck className="text-brand-700" />}
            </button>
          ))}
          <Link to="/sales-ids" className="block border-t border-ink-200 px-3 py-2 text-xs text-brand-700 hover:bg-ink-50" onClick={() => setOpen(false)}>Manage Sales IDs</Link>
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], unread: 0 });
  const ref = useRef(null);
  const navigate = useNavigate();
  useOutside(ref, () => setOpen(false));
  const load = () => notificationsApi.list().then((r) => setData(r.data.data)).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button className="relative rounded-lg p-2 text-ink-700 hover:bg-ink-100" onClick={() => { setOpen(!open); if (!open) load(); }} aria-label="Notifications">
        <FiBell />{data.unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-80 rounded-lg border border-ink-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-ink-200 px-3 py-2"><span className="text-sm font-semibold">Notifications</span>{data.unread > 0 && <button className="text-xs text-brand-700" onClick={() => notificationsApi.readAll().then(load)}>Mark all read</button>}</div>
          <div className="max-h-96 overflow-y-auto">
            {data.items.length === 0 && <p className="px-3 py-6 text-center text-sm text-ink-500">No notifications</p>}
            {data.items.map((n) => (
              <button key={n.id} className={`block w-full border-b border-ink-100 px-3 py-2 text-left hover:bg-ink-50 ${n.readAt ? '' : 'bg-brand-50/40'}`} onClick={() => { notificationsApi.read(n.id).then(load); if (n.link) navigate(n.link); setOpen(false); }}>
                <p className="text-sm font-medium">{n.title}</p>{n.body && <p className="text-xs text-ink-500">{n.body}</p>}<p className="mt-0.5 text-[11px] text-ink-400">{formatRelative(n.createdAt)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, clear } = useAuthStore();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  useOutside(ref, () => setOpen(false));
  const logout = async () => {
    await authApi.logout().catch(() => {});
    clear();
    navigate('/login');
  };
  return (
    <div className="relative" ref={ref}>
      <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-100" onClick={() => setOpen(!open)}>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">{user?.name?.[0]?.toUpperCase() ?? 'A'}</span>
        <span className="hidden text-sm font-medium md:block">{user?.name}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-56 rounded-lg border border-ink-200 bg-white py-1 shadow-lg">
          <p className="truncate px-3 py-2 text-xs text-ink-500">{user?.email}</p>
          <Link to="/settings?tab=profile" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-ink-50" onClick={() => setOpen(false)}><FiUser /> Profile & password</Link>
          <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-700 hover:bg-ink-50" onClick={logout}><FiLogOut /> Sign out</button>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-ink-200 bg-white/95 px-4 backdrop-blur">
      <button className="rounded-lg p-2 text-ink-700 hover:bg-ink-100 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><FiMenu /></button>
      <SalesIdSwitcher />
      <div className="ml-auto flex items-center gap-1"><Notifications /><UserMenu /></div>
    </header>
  );
}
