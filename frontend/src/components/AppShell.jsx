import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../store/auth'

const allNav = [
  { to: '/', label: 'Beranda', icon: '⌂', end: true },
  { to: '/catalog', label: 'Katalog', icon: '▤' },
  { to: '/users', label: 'Anggota', icon: '♙', any: ['users.view'] },
  { to: '/inventory', label: 'Inventaris', icon: '▦', any: ['catalog.create'] },
  { to: '/scan', label: 'Sirkulasi', icon: '▣', any: ['circulation.borrow', 'circulation.return'] },
  { to: '/loans', label: 'Pinjaman', icon: '⇄' },
  { to: '/fines', label: 'Denda', icon: 'Rp' },
  { to: '/reports', label: 'Laporan', icon: '▥', any: ['reports.view'] },
  { to: '/settings', label: 'Pengaturan', icon: '⚙', any: ['settings.view', 'settings.manage'] },
  { to: '/audit', label: 'Audit', icon: '◉', any: ['audit.view'] },
  { to: '/notifications', label: 'Notifikasi', icon: '●' },
  { to: '/profile', label: 'Profil', icon: '☺' },
]

export default function AppShell() {
  const { user, roles, permissions, logout } = useAuth()
  const navigate = useNavigate()
  const nav = allNav.filter((item) => !item.any || item.any.some((permission) => permissions.includes(permission)))

  const signOut = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      <aside className="hidden h-screen w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-6 lg:flex lg:flex-col">
        <Brand />
        <nav className="mt-10 space-y-2">
          {nav.map((item) => <NavItem key={item.to} {...item} />)}
        </nav>
        <UserBlock user={user} roles={roles} onLogout={signOut} />
      </aside>

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-10 lg:pt-8">
        <header className="mb-7 flex items-center justify-between lg:hidden">
          <Brand />
          <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 font-bold text-emerald-800">
            {user.name.charAt(0)}
          </div>
        </header>
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t border-slate-200 bg-white/95 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">
        {nav.map((item) => <NavItem key={item.to} {...item} mobile />)}
        <button onClick={signOut} className="min-h-14 min-w-20 rounded-xl text-xs font-semibold text-slate-500">↪<span className="block">Keluar</span></button>
      </nav>
    </div>
  )
}

function Brand() {
  return <div><p className="text-xl font-black tracking-tight text-emerald-800">BM Library</p><p className="text-xs text-slate-500">Perpustakaan digital</p></div>
}

function NavItem({ to, label, icon, end, mobile = false }) {
  return <NavLink to={to} end={end} className={({ isActive }) => mobile
    ? `min-h-14 min-w-20 rounded-xl text-center text-xs font-semibold ${isActive ? 'bg-emerald-50 text-emerald-800' : 'text-slate-500'}`
    : `flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-bold ${isActive ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-50'}`}>
    <span className={mobile ? 'block pt-1 text-xl leading-6' : 'text-lg'}>{icon}</span><span className={mobile ? 'block' : ''}>{label}</span>
  </NavLink>
}

function UserBlock({ user, roles, onLogout }) {
  return <div className="mt-auto border-t border-slate-200 pt-5">
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 font-bold text-emerald-800">{user.name.charAt(0)}</div>
      <div className="min-w-0"><p className="truncate text-sm font-bold">{user.name}</p><p className="truncate text-xs capitalize text-slate-500">{roles[0]?.replace('_', ' ')}</p></div>
    </div>
    <button onClick={onLogout} className="mt-4 min-h-11 w-full rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">Keluar</button>
  </div>
}
