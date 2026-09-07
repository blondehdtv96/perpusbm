import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function AuditPage() {
  const [logs, setLogs] = useState([])
  const [action, setAction] = useState('')
  useEffect(() => { const timer = setTimeout(() => api(`/api/activity-logs?action=${encodeURIComponent(action)}`).then((response) => setLogs(response.data ?? [])), 200); return () => clearTimeout(timer) }, [action])
  return <>
    <div><p className="text-sm font-bold text-emerald-700">KEAMANAN</p><h1 className="mt-1 text-3xl font-black">Audit log</h1><p className="mt-2 text-slate-500">Jejak aktivitas sensitif yang tidak dapat diedit.</p></div>
    <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Filter aksi, contoh: loan" className="mt-6 min-h-11 w-full max-w-sm rounded-xl border border-slate-300 px-4" />
    <section className="mt-5 overflow-x-auto rounded-3xl border border-slate-200 bg-white p-5"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-3">Waktu</th><th>Pengguna</th><th>Aksi</th><th>Deskripsi/Perubahan</th><th>IP</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id} className="border-b border-slate-100"><td className="p-3">{new Date(log.created_at).toLocaleString('id-ID')}</td><td>{log.user?.name ?? 'Sistem'}</td><td className="font-mono text-xs">{log.action}</td><td className="max-w-sm truncate">{log.description ?? JSON.stringify(log.changes ?? {})}</td><td>{log.ip_address}</td></tr>)}</tbody></table></section>
  </>
}
