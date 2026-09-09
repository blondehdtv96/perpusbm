import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { useAuth } from '../store/auth'

export default function LoginPage() {
  const user = useAuth((state) => state.user)
  const login = useAuth((state) => state.login)
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '', remember: false })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [retryAfter, setRetryAfter] = useState(0)

  useEffect(() => {
    if (retryAfter <= 0) return undefined
    const timer = setTimeout(() => setRetryAfter((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => clearTimeout(timer)
  }, [retryAfter])

  if (user) return <Navigate to="/" replace />

  const submit = async (event) => {
    event.preventDefault(); setSubmitting(true); setError('')
    try { await login(form); setRetryAfter(0); navigate('/') }
    catch (reason) {
      if (reason instanceof ApiError && reason.status === 429) setRetryAfter(reason.retryAfter || 60)
      setError(reason instanceof ApiError ? reason.message : 'Tidak dapat terhubung ke server.')
    }
    finally { setSubmitting(false) }
  }

  return (
    <main className="grid min-h-screen bg-navy-950 lg:grid-cols-2">
      <section className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-blue-600/20" />
        <div className="relative flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl bg-red-600 font-black">BM</span><span><b className="block text-xl">SMK Bina Mandiri</b><small className="text-blue-200">Perpustakaan Digital</small></span></div>
        <div className="relative"><p className="mb-4 text-sm font-black uppercase tracking-[.25em] text-blue-300">Membaca • Belajar • Berkarya</p><h1 className="max-w-xl text-5xl font-black leading-tight">Koleksi sekolah dalam satu layanan yang modern.</h1><p className="mt-5 max-w-lg text-blue-100">Kelola anggota, buku, peminjaman, dan kartu digital dengan cepat dari komputer maupun ponsel.</p></div>
        <p className="relative text-sm text-blue-200">Aman dengan hak akses • Cepat melalui QR • Responsif di ponsel</p>
      </section>
      <section className="flex items-center justify-center rounded-t-[2rem] bg-slate-50 p-5 lg:rounded-l-[2.5rem] lg:rounded-tr-none">
        <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-950/5 sm:p-9">
          <div className="mb-7 flex items-center gap-3 lg:hidden"><span className="grid h-11 w-11 place-items-center rounded-xl bg-red-600 font-black text-white">BM</span><span><b className="block text-navy-950">SMK Bina Mandiri</b><small className="text-slate-500">Perpustakaan Digital</small></span></div>
          <p className="mb-1 text-sm font-black tracking-widest text-blue-700">SELAMAT DATANG</p><h2 className="text-3xl font-black tracking-tight text-navy-950">Masuk ke akun</h2><p className="mt-2 text-sm text-slate-500">Siswa menggunakan NIS, admin menggunakan username.</p>
          {error && <div role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}{retryAfter > 0 && <p aria-live="polite" className="mt-1 font-bold">Coba kembali dalam {retryAfter} detik.</p>}</div>}
          <label className="mt-7 block text-sm font-bold text-slate-700">NIS / Username<input type="text" name="username" autoComplete="username" autoFocus required value={form.username} onChange={(event) => { setForm({ ...form, username: event.target.value }); setRetryAfter(0); setError('') }} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4" /></label>
          <label className="mt-4 block text-sm font-bold text-slate-700">Kata sandi<input type="password" name="password" autoComplete="current-password" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4" /></label>
          <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-600"><input type="checkbox" checked={form.remember} onChange={(event) => setForm({ ...form, remember: event.target.checked })} className="h-4 w-4 accent-blue-700" /> Ingat sesi saya</label>
          <button disabled={submitting || retryAfter > 0} className="mt-5 min-h-12 w-full rounded-xl bg-blue-700 px-4 font-bold text-white hover:bg-blue-800 disabled:opacity-60">{submitting ? 'Memproses…' : retryAfter > 0 ? `Coba lagi dalam ${retryAfter} detik` : 'Masuk'}</button>
          <div className="mt-6 border-t border-slate-200 pt-5 text-center text-sm text-slate-600">Belum menjadi anggota? <Link to="/register" className="font-black text-blue-700 hover:text-blue-900">Daftar siswa</Link></div>
        </form>
      </section>
    </main>
  )
}
