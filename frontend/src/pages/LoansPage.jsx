import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function LoansPage() {
  const [tab, setTab] = useState('active')
  const [loans, setLoans] = useState([])
  const [error, setError] = useState('')
  useEffect(() => { api(`/api/loans/${tab}`).then((response) => setLoans(response.data ?? [])).catch((reason) => setError(reason.message)) }, [tab])
  return <>
    <div><p className="text-sm font-bold text-emerald-700">SIRKULASI</p><h1 className="mt-1 text-3xl font-black">Pinjaman</h1><p className="mt-2 text-slate-500">Pinjaman aktif dan riwayat pengembalian.</p></div>
    <div className="mt-6 inline-flex rounded-2xl bg-slate-200 p-1">{['active', 'history'].map((item) => <button key={item} onClick={() => setTab(item)} className={`min-h-11 rounded-xl px-5 text-sm font-bold ${tab === item ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500'}`}>{item === 'active' ? 'Aktif' : 'Riwayat'}</button>)}</div>
    {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
    <section className="mt-5 space-y-3">{loans.map((loan) => <article key={loan.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5"><div><p className="font-black">{loan.book_copy?.book?.title}</p><p className="text-sm text-slate-500">{loan.user?.name} • {loan.book_copy?.inventory_code}</p></div><div className="text-right"><span className={`rounded-full px-3 py-1 text-xs font-bold ${loan.status === 'overdue' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{loan.status}</span><p className="mt-2 text-xs text-slate-500">Jatuh tempo {new Date(loan.due_at).toLocaleDateString('id-ID')}</p></div></article>)}{loans.length === 0 && <p className="rounded-3xl border border-dashed border-slate-300 p-12 text-center text-slate-500">Tidak ada data pinjaman.</p>}</section>
  </>
}
