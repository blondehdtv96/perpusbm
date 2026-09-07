import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { useAuth } from '../store/auth'

export default function LoginPage() {
  const user = useAuth((state) => state.user)
  const login = useAuth((state) => state.login)
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: 'admin', password: 'ChangeMeNow!' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to="/" replace />

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await login(form)
      navigate('/')
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Tidak dapat terhubung ke server.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-screen bg-emerald-950 lg:grid-cols-2">
      <section className="hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="text-2xl font-black">BM Library</div>
        <div><p className="mb-4 text-sm font-bold uppercase tracking-[.25em] text-emerald-300">Kelola lebih cepat</p><h1 className="max-w-xl text-5xl font-black leading-tight">Satu tempat untuk koleksi, anggota, dan sirkulasi.</h1></div>
        <p className="text-sm text-emerald-200">Aman dengan RBAC • Cepat melalui QR • Nyaman di ponsel</p>
      </section>
      <section className="flex items-center justify-center rounded-t-[2rem] bg-slate-50 p-5 lg:rounded-l-[2.5rem] lg:rounded-tr-none">
        <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-950/5 sm:p-9">
          <p className="mb-1 text-sm font-bold text-emerald-700">SELAMAT DATANG</p>
          <h1 className="text-3xl font-black tracking-tight">Masuk ke akun</h1>
          <p className="mt-2 text-sm text-slate-500">Gunakan akun yang diberikan administrator.</p>
          {error && <div role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <label className="mt-7 block text-sm font-bold">Username<input type="text" name="username" autoComplete="username" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" /></label>
          <label className="mt-4 block text-sm font-bold">Kata sandi<input type="password" name="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" /></label>
          <button disabled={submitting} className="mt-7 min-h-12 w-full rounded-xl bg-emerald-700 px-4 font-bold text-white hover:bg-emerald-800 disabled:opacity-60">{submitting ? 'Memproses…' : 'Masuk'}</button>
        </form>
      </section>
    </main>
  )
}
