import { Link } from 'react-router-dom'

export default function AccessDeniedPage() {
  return <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center"><div className="text-5xl">⛔</div><h1 className="mt-4 text-2xl font-black">Akses ditolak</h1><p className="mt-2 text-slate-500">Akun Anda tidak memiliki izin untuk membuka halaman ini.</p><Link to="/" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-5 font-bold text-white">Kembali</Link></section>
}
