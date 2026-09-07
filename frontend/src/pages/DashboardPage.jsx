import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../store/auth'

export default function DashboardPage() {
  const { user, permissions } = useAuth()
  const [stats, setStats] = useState({})
  const [loans, setLoans] = useState([])
  useEffect(() => { Promise.all([api('/api/dashboard'), api('/api/loans/active')]).then(([dashboard, active]) => { setStats(dashboard.data); setLoans(active.data ?? []) }) }, [])
  const admin = permissions.includes('loans.view-all')
  const cards = admin
    ? [['Anggota', stats.users], ['Judul buku', stats.books], ['Pinjaman aktif', stats.active_loans], ['Terlambat', stats.overdue_loans], ['Denda aktif', `Rp${Number(stats.unpaid_fines ?? 0).toLocaleString('id-ID')}`]]
    : [['Pinjaman aktif', stats.active_loans], ['Terlambat', stats.overdue_loans], ['Total riwayat', stats.history_count], ['Denda aktif', `Rp${Number(stats.unpaid_fines ?? 0).toLocaleString('id-ID')}`]]
  return <>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold text-emerald-700">{new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(new Date())}</p><h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Halo, {user.name.split(' ')[0]}!</h1><p className="mt-2 text-slate-500">{admin ? 'Pantau aktivitas perpustakaan hari ini.' : 'Pantau buku dan tenggat pinjaman Anda.'}</p></div>{permissions.includes('circulation.borrow') && <Link to="/scan" className="inline-flex min-h-12 items-center rounded-xl bg-emerald-700 px-5 font-bold text-white">▣ Mulai transaksi</Link>}</div>
    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{cards.map(([label, value]) => <div key={label} className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5"><p className="text-sm font-bold text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value ?? '…'}</p></div>)}</section>
    <div className="mt-8 grid gap-5 lg:grid-cols-2"><section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-black">Pinjaman aktif</h2><div className="mt-4 space-y-3">{loans.slice(0, 5).map((loan) => <div key={loan.id} className="flex justify-between gap-3 rounded-2xl bg-slate-50 p-4"><div><p className="font-bold">{loan.book_copy?.book?.title}</p><p className="text-sm text-slate-500">{admin ? loan.user?.name : loan.book_copy?.inventory_code}</p></div><p className="text-sm font-bold">{new Date(loan.due_at).toLocaleDateString('id-ID')}</p></div>)}{!loans.length && <p className="p-8 text-center text-slate-500">Belum ada pinjaman.</p>}</div></section>
      {!admin && <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-black">Rekomendasi terbaru</h2><div className="mt-4 space-y-3">{(stats.recommendations ?? []).map((book) => <div key={book.id} className="rounded-2xl bg-slate-50 p-4"><p className="font-bold">{book.title}</p><p className="text-sm text-slate-500">{book.author}</p></div>)}{!stats.recommendations?.length && <p className="p-8 text-center text-slate-500">Belum ada rekomendasi.</p>}</div></section>}
      {admin && <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-black">Buku populer</h2><div className="mt-4 space-y-3">{(stats.popular_books ?? []).map((book, index) => <div key={book.title} className="flex items-center justify-between rounded-2xl bg-slate-50 p-4"><p className="font-bold">{index + 1}. {book.title}</p><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">{book.loans} pinjaman</span></div>)}{!stats.popular_books?.length && <p className="p-8 text-center text-slate-500">Belum ada statistik.</p>}</div><h3 className="mt-6 font-black">Aktivitas 6 bulan</h3><div className="mt-4 flex h-32 items-end gap-2">{(stats.monthly_activity ?? []).map((month) => { const max = Math.max(1, ...(stats.monthly_activity ?? []).map((item) => item.loans)); return <div key={month.label} className="flex flex-1 flex-col items-center justify-end gap-1"><span className="text-xs font-bold">{month.loans}</span><div className="w-full rounded-t-lg bg-emerald-500" style={{ height: `${Math.max(6, (month.loans / max) * 88)}px` }} /><span className="text-[10px] text-slate-400">{month.label.split(' ')[0]}</span></div> })}</div></section>}
    </div>
  </>
}
