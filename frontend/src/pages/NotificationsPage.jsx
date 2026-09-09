import { useCallback, useEffect, useState } from 'react'
import { EmptyState, Feedback, LoadingRows, PageHeader, Panel, formatDate } from '../components/ui'
import { api } from '../lib/api'

export default function NotificationsPage() {
  const [items, setItems] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [busy, setBusy] = useState('')
  const load = useCallback(async () => { setError(''); try { const response = await api('/api/notifications'); setItems(response.data ?? []) } catch (reason) { setError(reason.message) } finally { setLoading(false) } }, [])
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer) }, [load])
  const notifyShell = () => window.dispatchEvent(new Event('notifications:changed'))
  const readAll = async () => { setBusy('all'); setError(''); try { await api('/api/notifications/read-all', { method: 'POST' }); await load(); notifyShell() } catch (reason) { setError(reason.message) } finally { setBusy('') } }
  const readOne = async (item) => { if (item.read_at) return; setBusy(item.id); try { await api(`/api/notifications/${item.id}/read`, { method: 'POST' }); await load(); notifyShell() } catch (reason) { setError(reason.message) } finally { setBusy('') } }
  const unread = items.filter((item) => !item.read_at).length
  return <div className="space-y-6"><PageHeader eyebrow="Inbox" title="Notifikasi" description="Informasi jatuh tempo, transaksi, dan pembaruan penting akun Anda." actions={<button onClick={readAll} disabled={!unread || busy === 'all'} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700 disabled:opacity-40">{busy === 'all' ? 'Memproses…' : 'Tandai semua dibaca'}</button>} />
    {error && <Feedback type="error">{error}</Feedback>}<Panel title="Kotak masuk" description={`${unread} belum dibaca dari ${items.length} notifikasi`}>
      {loading ? <LoadingRows count={5} /> : items.length ? <div className="divide-y divide-slate-100">{items.map((item) => <article key={item.id} className="flex gap-4 py-5 first:pt-0 last:pb-0"><span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${item.read_at ? 'bg-slate-200' : 'bg-blue-600 ring-4 ring-blue-50'}`} /><div className="min-w-0 flex-1"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><h3 className={`font-black ${item.read_at ? 'text-slate-700' : 'text-navy-950'}`}>{item.data.title ?? 'Notifikasi'}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{item.data.message}</p></div>{!item.read_at && <button disabled={busy === item.id} onClick={() => readOne(item)} className="min-h-9 shrink-0 rounded-lg bg-blue-50 px-3 text-xs font-bold text-blue-700 disabled:opacity-40">{busy === item.id ? 'Menyimpan…' : 'Tandai dibaca'}</button>}</div><p className="mt-3 text-xs font-semibold text-slate-400">{formatDate(item.created_at, true)}</p></div></article>)}</div> : <EmptyState icon="•" title="Belum ada notifikasi" description="Pembaruan penting akan muncul di kotak masuk ini." />}
    </Panel></div>
}
