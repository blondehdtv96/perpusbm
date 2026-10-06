import { useCallback, useEffect, useState } from 'react'
import { BusyLabel, EmptyState, Feedback, LoadingOverlay, PageHeader, Panel, ProgressBar } from '../components/ui'
import { Avatar, Field, PhotoPicker, Select, StatusBadge, Step } from '../components/members'
import { adminRoles, errorLines, genders, optionLabel, roleLabel, statuses, suggestPassword, today, usePhotoPicker } from '../lib/members'
import { api } from '../lib/api'
import { useAuth } from '../store/auth'

const initialForm = {
  name: '', username: '', password: '', password_confirmation: '', nis_nip: '', position: '',
  role: 'librarian', status: 'active', gender: '', email: '', phone: '', joined_at: today(),
}
const positionSuggestion = { librarian: 'Pustakawan', super_admin: 'Administrator Perpustakaan' }
const roleNotes = {
  librarian: 'Pustakawan dapat mengelola anggota, koleksi, sirkulasi, denda, dan laporan.',
  super_admin: 'Super Admin memiliki seluruh hak akses, termasuk pengaturan sistem dan pembuatan akun admin lain.',
}

export default function AdminsPage() {
  const authUser = useAuth((state) => state.user)
  const permissions = useAuth((state) => state.permissions)
  const canCreate = permissions.includes('users.create')
  const canUpdate = permissions.includes('users.update')
  const canDelete = permissions.includes('users.delete')
  const photo = usePhotoPicker()
  const [form, setForm] = useState(initialForm)
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saveProgress, setSaveProgress] = useState(null)
  const [busy, setBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [formErrors, setFormErrors] = useState({})

  const passwordMismatch = form.password_confirmation !== '' && form.password !== form.password_confirmation

  // Daftar ini sengaja hanya memuat akun dengan role pustakawan dan super admin, supaya
  // akun petugas tidak lagi tercampur dengan siswa pada halaman Daftar anggota.
  const load = useCallback(async () => {
    const params = new URLSearchParams({ role: adminRoles.map(([value]) => value).join(','), per_page: '100' })
    if (search.trim()) params.set('search', search.trim())
    setLoading(true)
    try {
      const response = await api(`/api/users?${params}`)
      setAdmins(response.data ?? [])
    } catch (reason) {
      setAdmins([])
      setError(reason.message)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load])

  const changeRole = (value) => setForm((current) => ({
    ...current,
    role: value,
    // Jabatan hanya diisi otomatis selama petugas belum menulis jabatannya sendiri.
    position: Object.values(positionSuggestion).includes(current.position) || current.position === '' ? positionSuggestion[value] : current.position,
  }))

  const create = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    setFormErrors({})
    const payload = {
      name: form.name,
      username: form.username,
      password: form.password,
      password_confirmation: form.password_confirmation,
      nis_nip: form.nis_nip,
      // Akun admin selalu bertipe staf: jabatannya tercatat, tanpa penempatan kelas.
      member_type: 'staff',
      position: form.position,
      role: form.role,
      gender: form.gender,
      email: form.email,
      phone: form.phone,
      joined_at: form.joined_at,
      status: form.status,
    }
    const body = photo.photo
      ? Object.entries({ ...payload, photo: photo.photo }).reduce((data, [key, value]) => {
        if (value !== null && value !== undefined && value !== '') data.append(key, value)
        return data
      }, new FormData())
      : JSON.stringify(payload)
    if (photo.photo) setSaveProgress({ percent: 0, phase: 'upload' })
    try {
      const response = await api('/api/users', {
        method: 'POST',
        body,
        ...(photo.photo ? { onProgress: (percent, phase) => setSaveProgress(phase === 'done' ? { percent: 100, phase: 'processing' } : { percent, phase }) } : {}),
      })
      setForm({ ...initialForm, role: form.role, position: positionSuggestion[form.role], joined_at: form.joined_at })
      setShowPassword(false)
      photo.clear()
      setMessage(`${roleLabel(form.role)} ${response?.data?.name ?? ''} berhasil ditambahkan. ${response?.message ?? ''}`.trim())
      await load()
    } catch (reason) {
      setFormErrors(reason.errors ?? {})
      setError(errorLines(reason))
    } finally { setBusy(false); setSaveProgress(null) }
  }

  const toggleStatus = async (user) => {
    const nextStatus = user.status === 'active' ? 'inactive' : 'active'
    setRowBusy({ id: user.id, action: 'status' })
    setError('')
    try {
      await api(`/api/users/${user.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) })
      setMessage(`Status ${user.name} berhasil diubah menjadi ${optionLabel(statuses, nextStatus).toLowerCase()}.`)
      await load()
    } catch (reason) { setError(errorLines(reason)) } finally { setRowBusy(null) }
  }

  const remove = async (user) => {
    if (!confirm(`Hapus akun ${user.name}? Akun ini kehilangan seluruh hak aksesnya.`)) return
    setRowBusy({ id: user.id, action: 'delete' })
    setError('')
    try {
      await api(`/api/users/${user.id}`, { method: 'DELETE' })
      setMessage(`${user.name} berhasil dihapus.`)
      await load()
    } catch (reason) { setError(errorLines(reason)) } finally { setRowBusy(null) }
  }

  const superAdmins = admins.filter((admin) => (admin.role ?? admin.roles?.[0]?.name) === 'super_admin')

  return <div className="space-y-6">
    <PageHeader
      eyebrow="Sistem"
      title="Admin & Petugas"
      description="Buat dan kelola akun pustakawan serta super admin. Hanya Super Admin yang dapat membuka halaman ini; akun siswa dan guru/staf tetap dikelola di menu Anggota."
    />
    {message && <Feedback type="success">{message}</Feedback>}
    {error && <Feedback type="error">{Array.isArray(error) ? <ul className="list-disc space-y-1 pl-5">{error.map((line, index) => <li key={index}>{line}</li>)}</ul> : error}</Feedback>}

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
      {canCreate && <Panel
        title="Tambah admin"
        description="Dua langkah: isi identitas akun, lalu tentukan hak akses dan kontaknya."
        action={<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Akses penuh</span>}
      >
        <form onSubmit={create} className="space-y-4">
          <Step number="1" title="Identitas akun" description="Username dan password awal dipakai petugas untuk masuk pertama kali.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nama lengkap" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required error={formErrors.name?.[0]} className="sm:col-span-2" />
              <Field label="Username" value={form.username} onChange={(value) => setForm({ ...form, username: value.replace(/\s+/g, '') })} required minLength="3" hint="Huruf, angka, titik, garis bawah, dan strip. Tanpa spasi." error={formErrors.username?.[0]} />
              <Field label="NIP" value={form.nis_nip} onChange={(value) => setForm({ ...form, nis_nip: value })} hint="Opsional. Boleh dikosongkan bila belum ada." error={formErrors.nis_nip?.[0]} />
              <Field label="Password awal" type={showPassword ? 'text' : 'password'} value={form.password} onChange={(value) => setForm({ ...form, password: value })} required minLength="8" hint="Minimal 8 karakter." error={formErrors.password?.[0]}
                action={<span className="inline-flex gap-2"><button type="button" onClick={() => setShowPassword((value) => !value)} className="font-bold text-blue-700 hover:underline">{showPassword ? 'Sembunyikan' : 'Lihat'}</button><button type="button" onClick={() => { const value = suggestPassword(); setForm((current) => ({ ...current, password: value, password_confirmation: value })); setShowPassword(true) }} className="font-bold text-blue-700 hover:underline">Buat otomatis</button></span>} />
              <Field label="Konfirmasi password" type={showPassword ? 'text' : 'password'} value={form.password_confirmation} onChange={(value) => setForm({ ...form, password_confirmation: value })} required minLength="8"
                hint="Ulangi password awal supaya tidak ada salah ketik."
                error={formErrors.password?.[0] ? undefined : (passwordMismatch ? 'Konfirmasi password belum sama dengan password awal.' : undefined)} />
              <Select label="Jenis kelamin" value={form.gender} onChange={(value) => setForm({ ...form, gender: value })} options={genders} placeholder="Pilih jenis kelamin" error={formErrors.gender?.[0]} />
              <Select label="Status akun" value={form.status} onChange={(value) => setForm({ ...form, status: value })} options={statuses} error={formErrors.status?.[0]} />
            </div>
          </Step>

          <Step number="2" title="Hak akses dan kontak" description="Role menentukan menu yang dapat dibuka petugas.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Role" value={form.role} onChange={changeRole} options={adminRoles} error={formErrors.role?.[0]} />
              <Field label="Jabatan" value={form.position} onChange={(value) => setForm({ ...form, position: value })} required hint="Tampil pada kartu dan daftar petugas." error={formErrors.position?.[0]} />
              <Field label="Nomor HP" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} hint="Opsional. Contoh: 0812 3456 7890." error={formErrors.phone?.[0]} />
              <Field label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} hint="Opsional. Dipakai untuk pemberitahuan." error={formErrors.email?.[0]} />
              <Field label="Tanggal gabung" type="date" value={form.joined_at} onChange={(value) => setForm({ ...form, joined_at: value })} hint="Bawaan hari ini." error={formErrors.joined_at?.[0]} />
              <div className="sm:col-span-2"><PhotoPicker picker={photo} serverError={formErrors.photo?.[0]} hint="Opsional. JPG, PNG, atau WEBP, maksimal 2 MB." /></div>
              <p className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs leading-5 text-blue-800 sm:col-span-2">{roleNotes[form.role]}</p>
            </div>
          </Step>

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">Akan tersimpan sebagai <strong className="text-navy-950">{roleLabel(form.role)}</strong>{form.position ? ` — ${form.position}` : ''}.</p>
            <button disabled={busy || passwordMismatch} className="min-h-11 rounded-xl bg-blue-700 px-5 font-bold text-white hover:bg-blue-800 disabled:opacity-60 sm:shrink-0"><BusyLabel busy={busy} busyText="Menyimpan…">Simpan akun admin</BusyLabel></button>
          </div>
          {saveProgress && <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
            {saveProgress.phase === 'upload'
              ? <ProgressBar value={saveProgress.percent} label="Mengunggah foto" hint="Jangan tutup halaman ini sampai proses selesai." />
              : <ProgressBar label="Menyimpan akun admin…" />}
          </div>}
        </form>
      </Panel>}

      <Panel
        title="Daftar admin & petugas"
        description="Akun dengan role pustakawan atau super admin."
        action={<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{admins.length} akun</span>}
        className={canCreate ? '' : 'xl:col-span-2'}
      >
        <div className="relative space-y-3">
          <LoadingOverlay show={Boolean(rowBusy)} label="Memperbarui akun…" />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, username, atau NIP" className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
          {superAdmins.length === 1 && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-4 text-amber-800">Hanya ada satu Super Admin. Tambahkan satu lagi sebagai cadangan agar sistem tetap dapat dikelola bila akun ini terkunci.</p>}
          {loading && <ProgressBar label="Memuat daftar akun…" />}
          {!loading && admins.length === 0 && <EmptyState icon="♦" title="Belum ada akun admin" description="Tambahkan pustakawan atau super admin lewat form di samping." />}
          {!loading && admins.map((admin) => {
            const role = admin.role ?? admin.roles?.[0]?.name
            const self = admin.id === authUser.id
            return <article key={admin.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start gap-3">
                <Avatar user={admin} className="h-11 w-11" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-black text-slate-900">{admin.name}{self && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">Akun Anda</span>}</p>
                    <StatusBadge status={admin.status} />
                  </div>
                  <p className="mt-0.5 truncate font-mono text-xs text-slate-500">@{admin.username}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className={`rounded-full px-2 py-1 font-bold ${role === 'super_admin' ? 'bg-navy-950 text-white' : 'bg-blue-100 text-blue-800'}`}>{roleLabel(role)}</span>
                    <span className="text-slate-500">{admin.class_or_position ?? 'Jabatan belum diisi'}</span>
                  </div>
                  {(admin.email || admin.phone) && <p className="mt-2 truncate text-xs text-slate-500">{[admin.email, admin.phone].filter(Boolean).join(' • ')}</p>}
                  {canUpdate && !self && <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={rowBusy?.id === admin.id} onClick={() => toggleStatus(admin)} className="min-h-10 rounded-xl border border-amber-300 px-3 text-xs font-bold text-amber-700 disabled:opacity-40"><BusyLabel busy={rowBusy?.id === admin.id && rowBusy.action === 'status'} busyText="Menyimpan…" spinnerSize={13}>{admin.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}</BusyLabel></button>
                    {canDelete && <button type="button" disabled={rowBusy?.id === admin.id} onClick={() => remove(admin)} className="min-h-10 rounded-xl border border-red-200 px-3 text-xs font-bold text-red-600 disabled:opacity-40"><BusyLabel busy={rowBusy?.id === admin.id && rowBusy.action === 'delete'} busyText="Menghapus…" spinnerSize={13}>Hapus</BusyLabel></button>}
                  </div>}
                </div>
              </div>
            </article>
          })}
        </div>
      </Panel>
    </div>
  </div>
}
