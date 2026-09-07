import { useState } from 'react'
import { download } from '../lib/api'

export default function ReportsPage() {
  const [form, setForm] = useState({ type: 'circulation', format: 'xlsx', from: '', to: '' })
  const [error, setError] = useState('')
  const submit = async (event) => { event.preventDefault(); setError(''); const query = new URLSearchParams(Object.fromEntries(Object.entries(form).filter(([, value]) => value))); try { await download(`/api/reports/export?${query}`) } catch (reason) { setError(reason.message) } }
  return <>
    <div><p className="text-sm font-bold text-emerald-700">ANALITIK</p><h1 className="mt-1 text-3xl font-black">Laporan</h1><p className="mt-2 text-slate-500">Ekspor data terfilter dalam CSV, XLSX, atau PDF.</p></div>
    <form onSubmit={submit} className="mt-6 max-w-2xl rounded-3xl border border-slate-200 bg-white p-6"><div className="grid gap-4 sm:grid-cols-2"><Select label="Jenis laporan" value={form.type} onChange={(value) => setForm({ ...form, type: value })} options={['circulation', 'fines', 'inventory']} /><Select label="Format" value={form.format} onChange={(value) => setForm({ ...form, format: value })} options={['xlsx', 'pdf', 'csv']} /><Field label="Dari tanggal" type="date" value={form.from} onChange={(value) => setForm({ ...form, from: value })} /><Field label="Sampai tanggal" type="date" value={form.to} onChange={(value) => setForm({ ...form, to: value })} /></div>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}<button className="mt-5 min-h-12 w-full rounded-xl bg-emerald-700 font-bold text-white">Unduh laporan</button></form>
  </>
}
function Field({ label, ...props }) { return <label className="text-sm font-bold">{label}<input {...props} onChange={(event) => props.onChange(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal" /></label> }
function Select({ label, value, onChange, options }) { return <label className="text-sm font-bold">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal capitalize">{options.map((item) => <option key={item}>{item}</option>)}</select></label> }
