import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../store/auth'

const navGroups = [
  { label: 'Utama', items: [{ to: '/', label: 'Dashboard', icon: 'home', end: true }] },
  { label: 'Operasional', items: [{ to: '/scan', label: 'Sirkulasi', icon: 'scan', any: ['circulation.borrow', 'circulation.return'] }, { to: '/loans', label: 'Pinjaman', icon: 'loans' }, { to: '/fines', label: 'Denda', icon: 'fine' }] },
  { label: 'Koleksi', items: [{ to: '/catalog', label: 'Katalog Buku', icon: 'books' }, { to: '/inventory', label: 'Inventaris', icon: 'inventory', any: ['catalog.create'] }] },
  { label: 'Master Data', items: [{ to: '/academic', label: 'Akademik', icon: 'academic', any: ['academic.manage'] }, { to: '/users', label: 'Anggota', icon: 'users', any: ['users.view'] }] },
  { label: 'Analitik', items: [{ to: '/reports', label: 'Laporan', icon: 'report', any: ['reports.view'] }] },
  { label: 'Sistem', items: [{ to: '/notifications', label: 'Notifikasi', icon: 'bell' }, { to: '/audit', label: 'Audit Log', icon: 'audit', any: ['audit.view'] }, { to: '/settings', label: 'Pengaturan', icon: 'settings', any: ['settings.view', 'settings.manage'] }, { to: '/profile', label: 'Profil & Kartu', icon: 'profile' }] },
]

export default function AppShell() {
  const { user, roles, permissions, logout } = useAuth()
  const navigate = useNavigate(); const location = useLocation(); const closeButton = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false); const [unreadNotifications, setUnreadNotifications] = useState(0)
  const groups = navGroups.map((group) => ({ ...group, items: group.items.filter((item) => !item.any || item.any.some((permission) => permissions.includes(permission))) })).filter((group) => group.items.length)
  const nav = groups.flatMap((group) => group.items)
  const currentPage = nav.find((item) => item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))?.label ?? 'BM Library'
  const student = roles.includes('student')
  const mobilePaths = student ? ['/', '/catalog', '/loans', '/profile'] : ['/', '/scan', '/loans', '/users']
  const preferred = mobilePaths.map((path) => nav.find((item) => item.to === path)).filter(Boolean)
  const mobilePrimary = [...preferred, ...nav.filter((item) => !preferred.some((primary) => primary.to === item.to))].slice(0, 4)

  useEffect(() => {
    let cancelled = false
    const refresh = () => api('/api/notifications').then((response) => { if (!cancelled) setUnreadNotifications((response.data ?? []).filter((item) => !item.read_at).length) }).catch(() => {})
    refresh(); window.addEventListener('notifications:changed', refresh)
    return () => { cancelled = true; window.removeEventListener('notifications:changed', refresh) }
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return undefined
    const previousOverflow = document.body.style.overflow
    const onKeyDown = (event) => { if (event.key === 'Escape') setMenuOpen(false) }
    document.body.style.overflow = 'hidden'; window.addEventListener('keydown', onKeyDown); closeButton.current?.focus()
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKeyDown) }
  }, [menuOpen])

  const signOut = async () => { await logout(); navigate('/login') }
  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900 lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <aside className="app-scrollbar hidden h-screen overflow-y-auto bg-navy-950 text-white lg:sticky lg:top-0 lg:flex lg:flex-col">
        <div className="border-b border-white/10 px-5 py-6"><Brand light /></div>
        <nav className="flex-1 space-y-6 px-4 py-6" aria-label="Navigasi utama">{groups.map((group) => <NavGroup key={group.label} group={group} />)}</nav>
        <UserPanel user={user} roles={roles} onLogout={signOut} />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
          <div className="mx-auto flex h-[72px] max-w-[1520px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3"><button onClick={() => setMenuOpen(true)} aria-label="Buka navigasi" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 lg:hidden"><Icon name="menu" /></button><div className="lg:hidden"><Brand compact /></div><div className="hidden lg:block"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-slate-400">Perpustakaan Digital</p><h1 className="truncate text-lg font-black text-navy-950">{currentPage}</h1></div></div>
            <div className="flex items-center gap-2"><NavLink to="/notifications" aria-label={`${unreadNotifications} notifikasi belum dibaca`} className={({ isActive }) => `relative grid h-11 w-11 place-items-center rounded-xl border ${isActive ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><Icon name="bell" />{unreadNotifications > 0 && <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-red-600 px-1 text-[9px] font-black text-white">{Math.min(unreadNotifications, 99)}</span>}</NavLink><NavLink to="/profile" className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white p-1.5 pr-3 hover:bg-slate-50"><Avatar user={user} /><span className="hidden text-left sm:block"><b className="block max-w-36 truncate text-xs text-slate-800">{user.name}</b><small className="block text-[10px] capitalize text-slate-500">{roleLabel(roles[0])}</small></span><Icon name="chevron" size={16} /></NavLink></div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1520px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8"><Outlet /></main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgb(15_23_42/.08)] backdrop-blur-xl lg:hidden" aria-label="Navigasi cepat">{mobilePrimary.map((item) => <NavItem key={item.to} {...item} mobile />)}<button onClick={() => setMenuOpen(true)} className="min-h-14 rounded-xl text-[11px] font-bold text-slate-500"><span className="mx-auto mb-0.5 grid h-7 place-items-center"><Icon name="menu" /></span>Menu</button></nav>

      {menuOpen && <div className="fixed inset-0 z-50 lg:hidden"><button aria-label="Tutup navigasi" onClick={() => setMenuOpen(false)} className="absolute inset-0 h-full w-full bg-slate-950/60 backdrop-blur-sm" /><aside role="dialog" aria-modal="true" aria-labelledby="mobile-menu-title" className="app-scrollbar absolute bottom-0 left-0 top-0 flex w-[min(88vw,340px)] flex-col overflow-y-auto bg-navy-950 text-white shadow-2xl"><div className="flex items-center justify-between border-b border-white/10 px-5 py-5"><div id="mobile-menu-title"><Brand light /></div><button ref={closeButton} onClick={() => setMenuOpen(false)} aria-label="Tutup navigasi" className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 hover:bg-white/15"><Icon name="close" /></button></div><nav className="flex-1 space-y-6 px-4 py-6">{groups.map((group) => <NavGroup key={group.label} group={group} onNavigate={() => setMenuOpen(false)} />)}</nav><UserPanel user={user} roles={roles} onLogout={signOut} /></aside></div>}
    </div>
  )
}

function Brand({ light = false, compact = false }) { return <div className="flex min-w-0 items-center gap-3"><span className={`grid shrink-0 place-items-center rounded-xl bg-red-600 font-black text-white shadow-lg shadow-red-950/20 ${compact ? 'h-9 w-9 text-xs' : 'h-11 w-11 text-sm'}`}>BM</span>{!compact && <span className="min-w-0"><b className={`block truncate text-sm font-black ${light ? 'text-white' : 'text-navy-950'}`}>SMK Bina Mandiri</b><small className={light ? 'text-blue-200' : 'text-slate-500'}>Library Management</small></span>}</div> }
function NavGroup({ group, onNavigate }) { return <section><p className="mb-2 px-3 text-[10px] font-black uppercase tracking-[.18em] text-blue-300/70">{group.label}</p><div className="space-y-1">{group.items.map((item) => <NavItem key={item.to} {...item} onClick={onNavigate} />)}</div></section> }
function NavItem({ to, label, icon, end, mobile = false, onClick }) { return <NavLink to={to} end={end} onClick={onClick} className={({ isActive }) => mobile ? `group min-h-14 rounded-xl text-center text-[11px] font-bold ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-500'}` : `group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${isActive ? 'bg-white/12 text-white' : 'text-blue-100/75 hover:bg-white/7 hover:text-white'}`}><span className={mobile ? 'mx-auto mb-0.5 grid h-7 place-items-center' : 'grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/5 group-hover:bg-white/10'}><Icon name={icon} size={mobile ? 20 : 19} /></span><span className={mobile ? 'block truncate px-1' : 'truncate'}>{label}</span>{!mobile && <span className="ml-auto opacity-40"><Icon name="chevron" size={14} /></span>}</NavLink> }
function UserPanel({ user, roles, onLogout }) { return <div className="border-t border-white/10 bg-white/[.03] p-4"><div className="flex items-center gap-3"><Avatar user={user} dark /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-white">{user.name}</p><p className="truncate text-xs text-blue-200">{roleLabel(roles[0])}</p></div></div><button onClick={onLogout} className="mt-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 text-xs font-bold text-blue-100 hover:bg-white/10 hover:text-white"><Icon name="logout" size={17} /> Keluar dari sistem</button></div> }
function Avatar({ user, dark = false }) { return <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black ${dark ? 'bg-blue-600 text-white' : 'bg-navy-950 text-white'}`}>{user.name.charAt(0).toUpperCase()}</div> }
function roleLabel(role) { return ({ super_admin: 'Super Admin', librarian: 'Admin Perpustakaan', staff: 'Staf', student: 'Siswa / Anggota' })[role] ?? 'Pengguna' }
function Icon({ name, size = 20 }) { const paths = { home: 'M3 10.8 12 3l9 7.8V21h-6v-6H9v6H3V10.8Z', scan: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 12h8', loans: 'M7 7h11l-3-3m3 3-3 3M17 17H6l3 3m-3-3 3-3', fine: 'M12 2v20m5-16.5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', books: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Zm16 0A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z', inventory: 'M4 7h16v13H4V7Zm2-4h12l2 4H4l2-4Zm3 8h6', academic: 'm3 9 9-5 9 5-9 5-9-5Zm4 3v5c3 2.5 7 2.5 10 0v-5', users: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a4 4 0 0 1 0 7m2-13a4 4 0 0 1 0 7', report: 'M4 20V10m6 10V4m6 16v-7m5 7H2', bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4', audit: 'M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Zm0-14v5l3 2', settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-13v3m0 13v3m9.5-9.5h-3m-13 0h-3m16.2-6.2-2.1 2.1M7.9 16.1l-2.1 2.1m12.4 0-2.1-2.1M7.9 7.9 5.8 5.8', profile: 'M20 21a8 8 0 0 0-16 0m8-9a5 5 0 1 0 0-10 5 5 0 0 0 0 10', menu: 'M4 7h16M4 12h16M4 17h16', close: 'm6 6 12 12M18 6 6 18', logout: 'M10 17l5-5-5-5m5 5H3m10-9h7v18h-7', chevron: 'm9 18 6-6-6-6' }; return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.home} /></svg> }
