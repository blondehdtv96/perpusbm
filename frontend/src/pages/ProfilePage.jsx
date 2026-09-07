import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../store/auth'

export default function ProfilePage() {
  const authUser = useAuth((state) => state.user)
  const [card, setCard] = useState(null)
  const [form, setForm] = useState({ name: authUser.name, phone: authUser.phone ?? '', class_or_position: authUser.class_or_position ?? '' })
  const [photo, setPhoto] = useState(null)
  const [message, setMessage] = useState('')
  useEffect(() => { api('/api/profile/card').then((response) => setCard(response.data)) }, [])
  const save = async (event) => { event.preventDefault(); const body = new FormData(); Object.entries(form).forEach(([key, value]) => body.append(key, value)); if (photo) body.append('photo', photo); await api('/api/profile', { method: 'POST', headers: { 'X-HTTP-Method-Override': 'PUT' }, body }); setMessage('Profil berhasil diperbarui.') }
  const saveQr = () => { const svg = document.querySelector('#member-card-qr svg'); if (!svg) return; const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `kartu-${card.nis_nip ?? card.id}.svg`; anchor.click(); URL.revokeObjectURL(url) }
  return <>
    <div><p className="text-sm font-bold text-emerald-700">AKUN</p><h1 className="mt-1 text-3xl font-black">Profil & kartu</h1></div>
    <div className="mt-6 grid gap-5 lg:grid-cols-2"><form onSubmit={save} className="rounded-3xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-black">Informasi profil</h2>{message && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}{[['name', 'Nama'], ['phone', 'Telepon'], ['class_or_position', 'Kelas/Jabatan']].map(([field, label]) => <label key={field} className="mt-4 block text-sm font-bold">{label}<input value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal" /></label>)}<label className="mt-4 block text-sm font-bold">Foto profil<input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="mt-1 block w-full rounded-xl border border-slate-300 p-2 font-normal" /></label><button className="mt-5 min-h-11 w-full rounded-xl bg-emerald-700 font-bold text-white">Simpan profil</button></form>
      <section id="member-card-qr" className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-800 to-emerald-950 p-7 text-white shadow-xl"><p className="text-sm font-bold text-emerald-200">KARTU ANGGOTA DIGITAL</p><h2 className="mt-1 text-2xl font-black">BM Library</h2>{card && <><div className="mx-auto mt-6 w-fit rounded-2xl bg-white p-4"><QRCodeSVG value={card.qr_token} size={190} level="M" /></div><div className="mt-5 text-center"><p className="text-xl font-black">{card.name}</p><p className="text-sm text-emerald-200">{card.nis_nip ?? '-'} • {card.class_or_position ?? card.member_type}</p></div><button onClick={saveQr} className="mt-5 min-h-11 w-full rounded-xl bg-white/15 font-bold hover:bg-white/20">Simpan QR</button></>}</section>
    </div>
  </>
}
