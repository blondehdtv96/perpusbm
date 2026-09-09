import { useCallback, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import QrScanner from '../components/QrScanner'
import { Feedback, PageHeader, Panel, Tabs } from '../components/ui'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../store/auth'

function createUuid() {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()

  const bytes = new Uint8Array(16)
  if (typeof cryptoApi?.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}

export default function ScanPage() {
  const permissions = useAuth((state) => state.permissions)
  const canBorrow = permissions.includes('circulation.borrow')
  const canReturn = permissions.includes('circulation.return')
  const modes = useMemo(() => [canBorrow && 'borrow', canReturn && 'return'].filter(Boolean), [canBorrow, canReturn])
  const [mode, setMode] = useState(modes[0] ?? 'borrow')
  const [memberCode, setMemberCode] = useState('')
  const [bookCodes, setBookCodes] = useState([])
  const [manualBook, setManualBook] = useState('')
  const [camera, setCamera] = useState(false)
  const [requestKey, setRequestKey] = useState(createUuid)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const addBook = useCallback((value) => {
    const code = value.trim()
    if (!code) return
    setBookCodes((current) => mode === 'return' ? [code] : current.includes(code) ? current : [...current, code])
  }, [mode])

  const detected = useCallback((value) => {
    if (mode === 'borrow' && !memberCode) setMemberCode(value)
    else addBook(value)
  }, [addBook, memberCode, mode])

  if (!modes.length) return <Navigate to="/forbidden" replace />

  const submit = async (event) => {
    event.preventDefault(); setSubmitting(true); setError(''); setResult(null)
    const body = mode === 'borrow'
      ? { member_code: memberCode.trim(), book_codes: bookCodes, idempotency_key: requestKey }
      : { book_code: bookCodes[0], idempotency_key: requestKey }
    try {
      const response = await api(`/api/loans/${mode}`, { method: 'POST', body: JSON.stringify(body) })
      setResult(response); setRequestKey(createUuid()); setBookCodes([]); setManualBook('')
      if (mode === 'return') setMemberCode('')
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Transaksi gagal diproses. Kunci retry tetap dipertahankan.')
    } finally { setSubmitting(false) }
  }

  const switchMode = (next) => { setMode(next); setResult(null); setError(''); setBookCodes([]); setMemberCode(''); setRequestKey(createUuid()) }
  const tabs = modes.map((item) => ({ value: item, label: item === 'borrow' ? 'Peminjaman' : 'Pengembalian' }))

  return <div className="space-y-6"><PageHeader eyebrow="Operasional" title="Sirkulasi buku" description="Proses peminjaman dan pengembalian menggunakan QR atau kode inventaris." actions={<button type="button" onClick={() => setCamera((value) => !value)} className={`min-h-11 rounded-xl px-4 text-sm font-bold ${camera ? 'border border-slate-300 bg-white text-slate-700' : 'bg-blue-700 text-white hover:bg-blue-800'}`}>{camera ? 'Tutup kamera' : 'Buka pemindai QR'}</button>} />
    <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center"><Tabs items={tabs} value={mode} onChange={switchMode} /><div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Step active={mode === 'return' || Boolean(memberCode)} number="1" label={mode === 'borrow' ? 'Anggota' : 'Buku'} /><span className="h-px w-5 bg-slate-300" /><Step active={bookCodes.length > 0} number="2" label={mode === 'borrow' ? 'Buku' : 'Konfirmasi'} /></div></div>
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-12"><div className="xl:col-span-5">{camera ? <QrScanner active onDetected={detected} /> : <section className="grid min-h-80 place-items-center rounded-3xl border border-dashed border-slate-300 bg-slate-100/70 p-8 text-center"><div><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white text-blue-700 shadow-sm"><ScanIcon /></span><h2 className="mt-5 font-black text-navy-950">Pemindai kamera nonaktif</h2><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Buka kamera untuk membaca QR, atau gunakan formulir manual di samping.</p><button type="button" onClick={() => setCamera(true)} className="mt-5 min-h-11 rounded-xl border border-blue-200 bg-blue-50 px-5 text-sm font-bold text-blue-700">Aktifkan kamera</button></div></section>}</div>
      <Panel className="xl:col-span-7" title={mode === 'borrow' ? 'Data peminjaman' : 'Data pengembalian'} description={mode === 'borrow' ? 'Scan anggota terlebih dahulu, kemudian tambahkan buku.' : 'Scan satu kode buku yang akan dikembalikan.'}><div className="space-y-5">{mode === 'borrow' && <Field label="QR anggota / NIS / NIP" value={memberCode} onChange={setMemberCode} placeholder="Scan kartu atau masukkan identitas anggota" required />}
        <label className="block text-sm font-bold text-slate-700">QR buku / kode inventaris<div className="mt-2 flex gap-2"><input value={manualBook} onChange={(event) => setManualBook(event.target.value)} className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-300 px-4 font-mono text-sm" placeholder="Contoh: BK-000001-001" /><button type="button" onClick={() => { addBook(manualBook); setManualBook('') }} className="rounded-xl bg-navy-950 px-5 font-bold text-white hover:bg-navy-900">Tambah</button></div></label>
        <div><div className="mb-2 flex items-center justify-between"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Buku dipindai</p><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{bookCodes.length}</span></div>{bookCodes.length ? <div className="space-y-2">{bookCodes.map((code, index) => <div key={code} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-xs font-black text-blue-700">{index + 1}</span><code className="min-w-0 flex-1 truncate text-xs font-bold text-slate-700">{code}</code><button type="button" onClick={() => setBookCodes((items) => items.filter((item) => item !== code))} className="min-h-8 rounded-lg px-2 text-xs font-bold text-red-600 hover:bg-red-50">Hapus</button></div>)}</div> : <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">Belum ada buku dipindai.</div>}</div>
        {error && <Feedback type="error">{error}</Feedback>}{result && <Feedback type="success"><p>{result.message}</p>{result.data?.fine_amount > 0 && <p className="mt-1">Denda: Rp{Number(result.data.fine_amount).toLocaleString('id-ID')}</p>}</Feedback>}
        <button disabled={submitting || !bookCodes.length || (mode === 'borrow' && !memberCode.trim())} className="min-h-12 w-full rounded-xl bg-blue-700 px-5 font-bold text-white hover:bg-blue-800 disabled:opacity-50">{submitting ? 'Memproses transaksi…' : mode === 'borrow' ? `Konfirmasi ${bookCodes.length} buku` : 'Konfirmasi pengembalian'}</button></div></Panel>
    </form></div>
}
function Field({ label, value, onChange, placeholder, required }) { return <label className="block text-sm font-bold text-slate-700">{label}<input required={required} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-mono text-sm" placeholder={placeholder} /></label> }
function Step({ active, number, label }) { return <span className={`flex items-center gap-2 ${active ? 'text-blue-700' : 'text-slate-400'}`}><b className={`grid h-6 w-6 place-items-center rounded-full text-[10px] ${active ? 'bg-blue-700 text-white' : 'bg-slate-200'}`}>{active ? '✓' : number}</b>{label}</span> }
function ScanIcon() { return <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 8V4h4m8 0h4v4m0 8v4h-4M8 20H4v-4M8 12h8" /></svg> }
