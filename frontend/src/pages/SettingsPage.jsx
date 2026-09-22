import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BusyLabel, EmptyState, Feedback, LoadingRows, PageHeader, Panel, ProgressBar, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { useAuth } from '../store/auth'
import { useAppSettings } from '../store/appSettings'

const policyFields = [['max_books', 'Maksimal buku', 'Buku yang dapat dipinjam bersamaan'], ['loan_days', 'Durasi pinjaman', 'Jumlah hari sebelum jatuh tempo'], ['fine_per_day', 'Denda per hari', 'Nominal denda keterlambatan'], ['fine_block_threshold', 'Ambang blokir', 'Batas denda untuk memblokir peminjaman']]
export default function SettingsPage() {
  const permissions = useAuth((state) => state.permissions); const [policies, setPolicies] = useState([]); const [roles, setRoles] = useState([]); const [allPermissions, setAllPermissions] = useState([])
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState('')
  const load = useCallback(async () => { setError(''); try { const policyResponse = await api('/api/settings/loan-policies'); setPolicies(policyResponse.data ?? []); if (permissions.includes('roles.manage')) { const roleResponse = await api('/api/roles-permissions'); setRoles(roleResponse.data.roles); setAllPermissions(roleResponse.data.permissions) } } catch (reason) { setError(reason.message) } finally { setLoading(false) } }, [permissions])
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer) }, [load])
  const savePolicy = async (policy) => { setBusy(`policy-${policy.id}`); setError(''); try { await api(`/api/settings/loan-policies/${policy.id}`, { method: 'PUT', body: JSON.stringify(policy) }); setMessage(`Kebijakan ${memberLabel(policy.member_type)} berhasil disimpan.`); await load() } catch (reason) { setError(reason.message) } finally { setBusy('') } }
  const togglePermission = async (role, name) => { const current = role.permissions.map((item) => item.name); const next = current.includes(name) ? current.filter((item) => item !== name) : [...current, name]; setBusy(`permission-${role.id}-${name}`); setError(''); try { await api(`/api/roles/${role.id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions: next }) }); setMessage(`Hak akses ${roleLabel(role.name)} berhasil diperbarui.`); await load() } catch (reason) { setError(reason.message) } finally { setBusy('') } }
  const permissionGroups = useMemo(() => Object.groupBy ? Object.groupBy(allPermissions, (item) => item.name.split('.')[0]) : allPermissions.reduce((groups, item) => ({ ...groups, [item.name.split('.')[0]]: [...(groups[item.name.split('.')[0]] ?? []), item] }), {}), [allPermissions])
  return <div className="space-y-6"><PageHeader eyebrow="Konfigurasi" title="Pengaturan sistem" description="Atur identitas aplikasi, kebijakan peminjaman, dan hak akses setiap peran pengguna." />{error && <Feedback type="error">{error}</Feedback>}{message && <Feedback type="success">{message}</Feedback>}
    {permissions.includes('settings.manage') && <AppIdentityPanel onSaved={setMessage} onError={setError} />}
    <Panel title="Kebijakan peminjaman" description="Aturan diterapkan berdasarkan tipe anggota">{loading ? <LoadingRows count={2} /> : policies.length ? <div className="grid gap-5 xl:grid-cols-2">{policies.map((policy, index) => <PolicyCard key={policy.id} policy={policy} index={index} policies={policies} setPolicies={setPolicies} canManage={permissions.includes('settings.manage')} busy={busy} onSave={savePolicy} />)}</div> : <EmptyState title="Kebijakan belum tersedia" description="Jalankan seeder untuk membuat kebijakan awal." />}</Panel>
    {permissions.includes('roles.manage') && <Panel title="Role & permission" description="Aktifkan hak akses sesuai tanggung jawab setiap pengguna">{loading ? <LoadingRows /> : <div className="space-y-8">{roles.map((role) => <RolePermissions key={role.id} role={role} groups={permissionGroups} busy={busy} onToggle={togglePermission} />)}</div>}</Panel>}
  </div>
}
function AppIdentityPanel({ onSaved, onError }) {
  const settings = useAppSettings()
  const setSettings = useAppSettings((state) => state.setSettings)
  const [form, setForm] = useState({ app_name: '', app_subtitle: '', footer_text: '' })
  const [logoFile, setLogoFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [syncedWith, setSyncedWith] = useState(null)
  const fileInput = useRef(null)

  if (syncedWith !== settings) {
    setSyncedWith(settings)
    setForm({ app_name: settings.app_name ?? '', app_subtitle: settings.app_subtitle ?? '', footer_text: settings.footer_text ?? '' })
  }

  const pickLogo = (event) => {
    const file = event.target.files?.[0] ?? null
    setLogoFile(file); setRemoveLogo(false)
    setPreview(file ? URL.createObjectURL(file) : null)
  }
  const clearLogo = () => { setLogoFile(null); setPreview(null); setRemoveLogo(true); if (fileInput.current) fileInput.current.value = '' }

  const submit = async (event) => {
    event.preventDefault(); setSaving(true); onError(''); onSaved('')
    setUploadProgress({ percent: 0, phase: logoFile ? 'upload' : 'processing' })
    const body = new FormData()
    body.append('app_name', form.app_name)
    body.append('app_subtitle', form.app_subtitle)
    body.append('footer_text', form.footer_text)
    if (logoFile) body.append('logo', logoFile)
    if (removeLogo) body.append('remove_logo', '1')
    try {
      const response = await api('/api/settings/app', {
        method: 'POST',
        body,
        onProgress: (percent, phase) => setUploadProgress(phase === 'done' ? { percent: 100, phase: 'processing' } : { percent, phase }),
      })
      setSettings(response.data)
      setLogoFile(null); setPreview(null); setRemoveLogo(false)
      onSaved('Identitas aplikasi berhasil disimpan.')
    } catch (reason) { onError(reason.message) } finally { setSaving(false); setUploadProgress(null) }
  }

  const currentLogo = preview ?? (!removeLogo ? settings.logo_url : null)
  return <Panel title="Identitas aplikasi" description="Logo, nama aplikasi, dan footer akan tampil di seluruh sistem">
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-3">
        <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">{currentLogo ? <img src={currentLogo} alt="Logo" className="h-full w-full object-cover" /> : <span className="text-3xl" aria-hidden="true">🏫</span>}</div>
        <label className="min-h-10 cursor-pointer rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center">Pilih logo<input ref={fileInput} type="file" accept="image/*" onChange={pickLogo} className="hidden" /></label>
        {currentLogo && <button type="button" onClick={clearLogo} className="text-xs font-bold text-red-600 hover:text-red-800">Hapus logo</button>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold text-slate-700 sm:col-span-1">Nama aplikasi<input type="text" required maxLength={100} value={form.app_name} onChange={(event) => setForm({ ...form, app_name: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-slate-900" /></label>
        <label className="text-sm font-bold text-slate-700 sm:col-span-1">Subjudul<input type="text" maxLength={150} value={form.app_subtitle} onChange={(event) => setForm({ ...form, app_subtitle: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-slate-900" /><small className="mt-1 block font-normal text-slate-400">Tampil di bawah nama aplikasi, mis. "Library Management"</small></label>
        <label className="text-sm font-bold text-slate-700 sm:col-span-2">Teks footer<textarea maxLength={255} rows={2} value={form.footer_text} onChange={(event) => setForm({ ...form, footer_text: event.target.value })} placeholder="© 2026 SMK Bina Mandiri. Seluruh hak cipta dilindungi." className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900" /></label>
        <div className="space-y-3 sm:col-span-2"><button disabled={saving} className="min-h-11 rounded-xl bg-blue-700 px-5 font-bold text-white hover:bg-blue-800 disabled:opacity-50"><BusyLabel busy={saving} busyText="Menyimpan…">Simpan identitas</BusyLabel></button>{uploadProgress && (uploadProgress.phase === 'upload' ? <ProgressBar value={uploadProgress.percent} label="Mengunggah logo" /> : <ProgressBar label="Menyimpan identitas aplikasi…" />)}</div>
      </div>
    </form>
  </Panel>
}
function PolicyCard({ policy, index, policies, setPolicies, canManage, busy, onSave }) { return <article className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-blue-700">Tipe anggota</p><h3 className="mt-1 text-xl font-black text-navy-950">{memberLabel(policy.member_type)}</h3></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500 shadow-sm">Aktif</span></div><div className="mt-5 grid gap-4 sm:grid-cols-2">{policyFields.map(([field, label, helper]) => <label key={field} className="text-sm font-bold text-slate-700">{label}<input type="number" min="0" value={policy[field]} disabled={!canManage} onChange={(event) => setPolicies(policies.map((item, position) => position === index ? { ...item, [field]: Number(event.target.value) } : item))} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 disabled:bg-slate-100" /><small className="mt-1 block font-normal text-slate-400">{field.includes('fine') ? `${helper} (${formatCurrency(policy[field])})` : helper}</small></label>)}</div>{canManage && <button disabled={busy === `policy-${policy.id}`} onClick={() => onSave(policy)} className="mt-5 min-h-11 w-full rounded-xl bg-blue-700 px-4 font-bold text-white hover:bg-blue-800 disabled:opacity-50"><BusyLabel busy={busy === `policy-${policy.id}`} busyText="Menyimpan…">Simpan kebijakan</BusyLabel></button>}</article> }
function RolePermissions({ role, groups, busy, onToggle }) { const locked = role.name === 'super_admin'; return <section className="rounded-2xl border border-slate-200 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-black text-navy-950">{roleLabel(role.name)}</h3><p className="mt-1 text-xs text-slate-500">{role.permissions.length} hak akses aktif</p></div>{locked && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">Akses penuh terkunci</span>}</div><div className="mt-5 grid gap-5 xl:grid-cols-2">{Object.entries(groups).map(([group, items]) => <div key={group} className="rounded-xl bg-slate-50 p-4"><p className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">{groupLabel(group)}</p><div className="flex flex-wrap gap-2">{items.map((permission) => { const active = role.permissions.some((item) => item.name === permission.name); return <button key={permission.id} disabled={locked || busy === `permission-${role.id}-${permission.name}`} onClick={() => onToggle(role, permission.name)} className={`min-h-9 rounded-lg border px-3 text-xs font-bold transition ${active ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500'} disabled:opacity-60`}><span className="inline-flex items-center gap-1.5">{busy === `permission-${role.id}-${permission.name}` && <Spinner size={12} />}{permissionLabel(permission.name)}</span></button> })}</div></div>)}</div></section> }
function memberLabel(value) { return value === 'student' ? 'Siswa' : value === 'staff' ? 'Staf & Guru' : value }
function roleLabel(value) { return ({ super_admin: 'Super Admin', librarian: 'Admin Perpustakaan', staff: 'Staf', student: 'Siswa' })[value] ?? value }
function groupLabel(value) { return ({ users: 'Anggota', roles: 'Role', academic: 'Akademik', catalog: 'Koleksi', circulation: 'Sirkulasi', loans: 'Pinjaman', fines: 'Denda', reports: 'Laporan', settings: 'Pengaturan', audit: 'Audit' })[value] ?? value }
function permissionLabel(value) { const [, action] = value.split('.'); return ({ view: 'Lihat', create: 'Tambah', update: 'Ubah', delete: 'Hapus', manage: 'Kelola', borrow: 'Peminjaman', return: 'Pengembalian', 'view-all': 'Lihat semua', 'view-own': 'Lihat sendiri', pay: 'Pembayaran', waive: 'Pembebasan' })[action] ?? action }
