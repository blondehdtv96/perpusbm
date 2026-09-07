import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function NotificationsPage() {
  const [items, setItems] = useState([])
  const load = useCallback(() => api('/api/notifications').then((response) => setItems(response.data ?? [])), [])
  useEffect(() => { load() }, [load])
  const readAll = async () => { await api('/api/notifications/read-all', { method: 'POST' }); load() }
  return <>
    <div className="flex items-end justify-between gap-4"><div><p className="text-sm font-bold text-emerald-700">INBOX</p><h1 className="mt-1 text-3xl font-black">Notifikasi</h1></div><button onClick={readAll} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold">Tandai semua dibaca</button></div>
    <section className="mt-6 space-y-3">{items.map((item) => <article key={item.id} className={`rounded-2xl border p-5 ${item.read_at ? 'border-slate-200 bg-white' : 'border-emerald-200 bg-emerald-50'}`}><p className="font-black">{item.data.title ?? 'Notifikasi'}</p><p className="mt-1 text-sm text-slate-600">{item.data.message}</p><p className="mt-3 text-xs text-slate-400">{new Date(item.created_at).toLocaleString('id-ID')}</p></article>)}{items.length === 0 && <p className="rounded-3xl border border-dashed border-slate-300 p-12 text-center text-slate-500">Belum ada notifikasi.</p>}</section>
  </>
}
