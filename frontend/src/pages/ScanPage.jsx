import { useCallback, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import QrScanner from '../components/QrScanner'
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
    setBookCodes((current) => current.includes(code) ? current : [...current, code])
  }, [])

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

  const switchMode = (next) => { setMode(next); setResult(null); setError(''); setBookCodes([]); setRequestKey(createUuid()) }

  return <>
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-bold text-emerald-700">SIRKULASI</p><h1 className="mt-1 text-3xl font-black tracking-tight">Scan & transaksi</h1><p className="mt-2 text-slate-500">Scan QR atau masukkan NIS/NIP dan kode inventaris.</p></div><button type="button" onClick={() => setCamera((value) => !value)} className="min-h-11 rounded-xl border border-emerald-700 px-4 font-bold text-emerald-800">{camera ? 'Tutup kamera' : 'Buka kamera'}</button></div>
    <div className="mt-6 inline-flex rounded-2xl bg-slate-200 p-1">{modes.map((item) => <button key={item} onClick={() => switchMode(item)} className={`min-h-11 rounded-xl px-5 text-sm font-bold ${mode === item ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500'}`}>{item === 'borrow' ? 'Peminjaman' : 'Pengembalian'}</button>)}</div>

    <form onSubmit={submit} className="mt-5 grid max-w-4xl gap-5 lg:grid-cols-2">
      <QrScanner active={camera} onDetected={detected} />
      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
        {mode === 'borrow' && <label className="block text-sm font-bold">QR anggota / NIS / NIP<input required value={memberCode} onChange={(e) => setMemberCode(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-mono text-sm outline-none focus:border-emerald-600" placeholder="Scan kartu anggota terlebih dahulu" /></label>}
        <label className={`${mode === 'borrow' ? 'mt-4' : ''} block text-sm font-bold`}>QR buku / kode inventaris<div className="mt-2 flex gap-2"><input value={manualBook} onChange={(e) => setManualBook(e.target.value)} className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-300 px-4 font-mono text-sm outline-none focus:border-emerald-600" placeholder="Contoh: BK-000001-001" /><button type="button" onClick={() => { addBook(manualBook); setManualBook('') }} className="rounded-xl bg-slate-900 px-4 font-bold text-white">Tambah</button></div></label>

        <div className="mt-4 space-y-2">{bookCodes.map((code, index) => <div key={code} className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 font-mono text-xs"><span className="truncate">{index + 1}. {code}</span><button type="button" onClick={() => setBookCodes((items) => items.filter((item) => item !== code))} className="ml-3 font-sans font-bold text-red-600">Hapus</button></div>)}{bookCodes.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Belum ada buku dipindai.</p>}</div>
        {error && <div role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
        {result && <div role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"><p className="font-bold">{result.message}</p>{result.data?.fine_amount > 0 && <p className="mt-1">Denda: Rp{Number(result.data.fine_amount).toLocaleString('id-ID')}</p>}</div>}
        <button disabled={submitting || !bookCodes.length} className="mt-5 min-h-12 w-full rounded-xl bg-emerald-700 px-5 font-bold text-white hover:bg-emerald-800 disabled:opacity-60">{submitting ? 'Memproses…' : mode === 'borrow' ? `Pinjam ${bookCodes.length} buku` : 'Konfirmasi pengembalian'}</button>
      </section>
    </form>
  </>
}
