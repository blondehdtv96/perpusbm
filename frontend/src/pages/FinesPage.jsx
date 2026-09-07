import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../store/auth'

export default function FinesPage() {
  const permissions = useAuth((state) => state.permissions)
  const [fines, setFines] = useState([])
  const [error, setError] = useState('')
  const load = useCallback(() => api('/api/fines').then((response) => setFines(response.data ?? [])).catch((reason) => setError(reason.message)), [])
  useEffect(() => { load() }, [load])
  const pay = async (fine) => { const remaining = Number(fine.amount) - Number(fine.paid_amount); const amount = prompt(`Nominal pembayaran (sisa Rp${remaining.toLocaleString('id-ID')})`, remaining); if (!amount) return; try { await api(`/api/fines/${fine.id}/payments`, { method: 'POST', body: JSON.stringify({ amount: Number(amount), method: 'cash' }) }); load() } catch (reason) { setError(reason.message) } }
  const waive = async (fine) => { const reason = prompt('Alasan pembebasan denda'); if (!reason) return; try { await api(`/api/fines/${fine.id}/waive`, { method: 'POST', body: JSON.stringify({ reason }) }); load() } catch (value) { setError(value.message) } }
  return <>
    <div><p className="text-sm font-bold text-emerald-700">KEUANGAN</p><h1 className="mt-1 text-3xl font-black">Denda</h1><p className="mt-2 text-slate-500">Pantau saldo dan histori pembayaran denda.</p></div>
    {error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
    <section className="mt-6 space-y-3">{fines.map((fine) => { const remaining = Number(fine.amount) - Number(fine.paid_amount); return <article key={fine.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5"><div><p className="font-black">{fine.loan?.book_copy?.book?.title}</p><p className="text-sm text-slate-500">{fine.loan?.user?.name} • {fine.loan?.user?.nis_nip}</p></div><div className="text-right"><p className="text-xl font-black">Rp{remaining.toLocaleString('id-ID')}</p><p className="text-xs font-bold uppercase text-slate-400">{fine.status}</p></div>{permissions.includes('fines.pay') && !['paid', 'waived'].includes(fine.status) && <div className="w-full space-x-2 border-t border-slate-100 pt-3 text-right"><button onClick={() => pay(fine)} className="font-bold text-emerald-700">Catat pembayaran</button>{permissions.includes('fines.waive') && <button onClick={() => waive(fine)} className="font-bold text-amber-700">Bebaskan</button>}</div>}</article> })}{fines.length === 0 && <p className="rounded-3xl border border-dashed border-slate-300 p-12 text-center text-slate-500">Tidak ada denda.</p>}</section>
  </>
}
