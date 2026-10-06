import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BusyLabel, EmptyState, Feedback, LoadingOverlay, PageHeader, Panel, ProgressBar } from '../components/ui'
import { api, download } from '../lib/api'
import { useAuth } from '../store/auth'

const API_URL = import.meta.env.VITE_API_URL ?? ''

// Tanggal hari ini pada zona waktu petugas, dipakai sebagai tanggal gabung bawaan.
function today() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const initialForm = {
  name: '', username: '', password: '', password_confirmation: '', nis_nip: '', member_type: 'student', role: 'student', status: 'active',
  gender: '', email: '', phone: '', joined_at: today(),
  academic_year_id: '', education_level_id: '', major_id: '', class_group_id: '', position: '',
}
const emptyOptions = { academic_years: [], levels: [], majors: [], classes: [], default_academic_year_id: null }
const memberTypes = [['student', 'Siswa'], ['staff', 'Guru / Staf']]
const staffRoles = [['staff', 'Guru / Staf'], ['librarian', 'Pustakawan'], ['super_admin', 'Super Admin']]
const statuses = [['active', 'Aktif'], ['suspended', 'Ditangguhkan'], ['inactive', 'Tidak aktif']]
const genders = [['L', 'Laki-laki'], ['P', 'Perempuan']]
const photoTypes = ['image/jpeg', 'image/png', 'image/webp']
const maxPhotoSize = 2 * 1024 * 1024
const statusStyles = {
  active: 'bg-emerald-100 text-emerald-700',
  suspended: 'bg-amber-100 text-amber-800',
  inactive: 'bg-slate-200 text-slate-700',
}
const quickAddTitles = {
  levels: ['Tambah tingkat', 'Tingkat baru langsung tersedia untuk seluruh jurusan.'],
  majors: ['Tambah jurusan', 'Kode jurusan dipakai pada nama kelas, misalnya 10 TKJ A.'],
  classes: ['Tambah kelas', 'Kelas dibuat pada tahun ajaran, tingkat, dan jurusan yang sedang dipilih.'],
}

const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function optionLabel(options, value) {
  return options.find(([key]) => key === value)?.[1] ?? value
}

// Error validasi (422) membawa pesan per field; tampilkan semuanya, bukan hanya ringkasan "…and 1 more error".
function errorLines(reason) {
  const lines = Object.values(reason?.errors ?? {}).flat().filter(Boolean)
  return lines.length > 0 ? lines : (reason?.message ?? 'Terjadi kesalahan.')
}

function errorText(reason) {
  const lines = errorLines(reason)
  return Array.isArray(lines) ? lines.join(' ') : lines
}

async function requestStats() {
  try {
    const response = await api('/api/users/stats')
    return response.data ?? null
  } catch {
    return null
  }
}

function roleLabel(role) {
  return ({ student: 'Siswa', staff: 'Guru / Staf', librarian: 'Pustakawan', super_admin: 'Super Admin' })[role] ?? role
}

// Password awal yang mudah dibacakan ke anggota tetapi tetap acak dan memenuhi panjang minimal.
function suggestPassword() {
  const words = ['Baca', 'Buku', 'Pustaka', 'Literasi', 'Rajin', 'Cerdas']
  const word = words[Math.floor(Math.random() * words.length)]
  return `${word}#${Math.floor(1000 + Math.random() * 9000)}`
}

export default function UsersPage() {
  const permissions = useAuth((state) => state.permissions)
  const canCreate = permissions.includes('users.create')
  const canUpdate = permissions.includes('users.update')
  const canDelete = permissions.includes('users.delete')
  const canManageAcademic = permissions.includes('academic.manage')
  const fileInputRef = useRef(null)
  const photoInputRef = useRef(null)
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [memberType, setMemberType] = useState('')
  const [status, setStatus] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ current: 1, last: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(initialForm)
  const [options, setOptions] = useState(emptyOptions)
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsError, setOptionsError] = useState('')
  const [quickAdd, setQuickAdd] = useState('')
  const [quickForm, setQuickForm] = useState({})
  const [quickBusy, setQuickBusy] = useState(false)
  const [quickError, setQuickError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [usernameAuto, setUsernameAuto] = useState(true)
  const [saveProgress, setSaveProgress] = useState(null)
  const [importFile, setImportFile] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [downloadingTemplate, setDownloadingTemplate] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [formErrors, setFormErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState(null)
  const [importProgress, setImportProgress] = useState(null)
  const [selected, setSelected] = useState([])
  const [printingCards, setPrintingCards] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const isStudent = form.member_type === 'student'
  const passwordMismatch = form.password_confirmation !== '' && form.password !== form.password_confirmation
  const pageIds = users.map((user) => user.id)
  const allPageSelected = users.length > 0 && pageIds.every((id) => selected.includes(id))

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), per_page: '20' })
    if (search.trim()) params.set('search', search.trim())
    if (memberType) params.set('member_type', memberType)
    if (status) params.set('status', status)
    if (classFilter) params.set('class_group_id', classFilter)
    setLoading(true)
    try {
      const response = await api(`/api/users?${params}`)
      setUsers(response.data ?? [])
      setPagination({ current: response.current_page ?? 1, last: response.last_page ?? 1, total: response.total ?? 0 })
    } catch (reason) {
      setUsers([])
      setError(reason.message)
    } finally {
      setLoading(false)
    }
  }, [classFilter, memberType, page, search, status])

  // Pilihan tingkat, jurusan, dan kelas selalu diambil dari master akademik yang aktif,
  // sehingga form tambah anggota tidak pernah menawarkan kelas yang sudah dinonaktifkan.
  const loadOptions = useCallback(async () => {
    try {
      const response = await api('/api/users/form-options', { silent: true })
      const data = { ...emptyOptions, ...(response.data ?? {}) }
      setOptions(data)
      setOptionsError('')
      // Tahun ajaran aktif dipilih sekali saat pilihan dimuat supaya petugas hanya perlu
      // menentukan tingkat dan jurusan, tanpa menimpa pilihan yang sudah diubah manual.
      const defaultYear = data.default_academic_year_id ?? data.academic_years[0]?.id
      if (defaultYear) {
        setForm((current) => (current.academic_year_id ? current : { ...current, academic_year_id: String(defaultYear) }))
      }
      return data
    } catch (reason) {
      setOptionsError(reason.message)
      return null
    } finally {
      setOptionsLoading(false)
    }
  }, [])

  // Kartu ringkasan memakai hasil hitung ulang dari server, jadi angkanya tidak ikut
  // berubah saat daftar difilter dan tetap sama dengan jumlah baris di basis data.
  const refresh = useCallback(async () => {
    const [, summary] = await Promise.all([load(), requestStats()])
    setStats((current) => summary ?? current)
  }, [load])

  useEffect(() => {
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load])

  useEffect(() => {
    let mounted = true
    requestStats().then((summary) => { if (mounted) { setStats(summary); setStatsLoading(false) } })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(loadOptions, 0)
    return () => window.clearTimeout(timer)
  }, [loadOptions])

  const classesForForm = useMemo(() => options.classes.filter((item) => (
    (!form.academic_year_id || String(item.academic_year_id) === form.academic_year_id)
    && (!form.education_level_id || String(item.education_level_id) === form.education_level_id)
    && (!form.major_id || String(item.major_id) === form.major_id)
  )), [form.academic_year_id, form.education_level_id, form.major_id, options.classes])

  const selectedClass = options.classes.find((item) => String(item.id) === form.class_group_id) ?? null
  const placementReady = Boolean(form.academic_year_id && form.education_level_id && form.major_id)

  // Memindahkan pilihan induk membuat kelas lama tidak relevan lagi, jadi pilihannya dikosongkan.
  const changePlacement = (field, value) => setForm((current) => ({
    ...current,
    [field]: value,
    class_group_id: field === 'class_group_id' ? value : '',
  }))

  const changeMemberType = (value) => {
    setFormErrors({})
    setQuickAdd('')
    setForm((current) => ({
      ...current,
      member_type: value,
      role: value === 'student' ? 'student' : (current.role === 'student' ? 'staff' : current.role),
      class_group_id: value === 'student' ? current.class_group_id : '',
      position: value === 'staff' ? current.position : '',
    }))
  }

  // NIS/NIP otomatis menjadi username seperti pada registrasi siswa mandiri. Penyalinan
  // otomatis berhenti begitu petugas mengetik username sendiri, agar isian manual tidak tertimpa.
  const changeIdentity = (value) => setForm((current) => ({
    ...current,
    nis_nip: value,
    username: usernameAuto ? value.replace(/\s+/g, '') : current.username,
  }))

  const changeUsername = (value) => {
    setUsernameAuto(false)
    setForm((current) => ({ ...current, username: value.replace(/\s+/g, '') }))
  }

  const reuseIdentityAsUsername = () => {
    setUsernameAuto(true)
    setForm((current) => ({ ...current, username: current.nis_nip.replace(/\s+/g, '') }))
  }

  // Foto dipakai pada kartu perpustakaan, jadi batasannya disamakan dengan validasi server.
  const selectPhoto = (file) => {
    setFormErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== 'photo')))
    setPhotoPreview((current) => { if (current) URL.revokeObjectURL(current); return '' })
    if (!file) {
      setPhoto(null)
      return
    }
    if (!photoTypes.includes(file.type)) {
      setPhoto(null)
      setFormErrors((current) => ({ ...current, photo: ['Format foto harus JPG, PNG, atau WEBP.'] }))
      return
    }
    if (file.size > maxPhotoSize) {
      setPhoto(null)
      setFormErrors((current) => ({ ...current, photo: ['Ukuran foto maksimal 2 MB.'] }))
      return
    }
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const clearPhoto = () => {
    selectPhoto(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview) }, [photoPreview])

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
      member_type: form.member_type,
      gender: form.gender,
      email: form.email,
      phone: form.phone,
      joined_at: form.joined_at,
      status: form.status,
      role: isStudent ? 'student' : form.role,
      ...(isStudent ? { class_group_id: form.class_group_id ? Number(form.class_group_id) : null } : { position: form.position }),
    }
    // Foto hanya dapat dikirim sebagai berkas, jadi baris dengan foto memakai FormData
    // beserta progres unggahan; tanpa foto tetap JSON agar permintaannya ringan.
    const body = photo
      ? Object.entries({ ...payload, photo }).reduce((data, [key, value]) => {
        if (value !== null && value !== undefined && value !== '') data.append(key, value)
        return data
      }, new FormData())
      : JSON.stringify(payload)
    if (photo) setSaveProgress({ percent: 0, phase: 'upload' })
    try {
      const response = await api('/api/users', {
        method: 'POST',
        body,
        ...(photo ? { onProgress: (percent, phase) => setSaveProgress(phase === 'done' ? { percent: 100, phase: 'processing' } : { percent, phase }) } : {}),
      })
      setForm({ ...initialForm, joined_at: form.joined_at, academic_year_id: form.academic_year_id, education_level_id: form.education_level_id, major_id: form.major_id, class_group_id: form.class_group_id, member_type: form.member_type, role: form.role })
      setShowPassword(false)
      setUsernameAuto(true)
      clearPhoto()
      setMessage(response?.message ?? 'Anggota berhasil ditambahkan.')
      await refresh()
    } catch (reason) {
      setFormErrors(reason.errors ?? {})
      setError(errorLines(reason))
    } finally { setBusy(false); setSaveProgress(null) }
  }

  const openQuickAdd = (type) => {
    setQuickError('')
    setQuickForm(type === 'majors' ? { code: '', name: '' } : type === 'levels' ? { name: '', sort_order: '' } : { group_name: '' })
    setQuickAdd((current) => (current === type ? '' : type))
  }

  // Master akademik dapat ditambah langsung dari form ini agar petugas tidak perlu
  // berpindah halaman saat menemukan tingkat, jurusan, atau kelas yang belum terdaftar.
  const submitQuickAdd = async (event) => {
    event.preventDefault()
    setQuickBusy(true)
    setQuickError('')
    const bodies = {
      levels: () => ({ name: quickForm.name?.trim(), ...(quickForm.sort_order ? { sort_order: Number(quickForm.sort_order) } : {}) }),
      majors: () => ({ code: quickForm.code?.trim().toUpperCase(), name: quickForm.name?.trim() }),
      classes: () => ({
        academic_year_id: Number(form.academic_year_id),
        education_level_id: Number(form.education_level_id),
        major_id: Number(form.major_id),
        group_name: quickForm.group_name?.trim().toUpperCase(),
      }),
    }
    try {
      const response = await api(`/api/academic/${quickAdd}`, { method: 'POST', body: JSON.stringify(bodies[quickAdd]()) })
      const created = response.data
      await loadOptions()
      setForm((current) => ({
        ...current,
        ...(quickAdd === 'levels' ? { education_level_id: String(created.id), class_group_id: '' } : {}),
        ...(quickAdd === 'majors' ? { major_id: String(created.id), class_group_id: '' } : {}),
        ...(quickAdd === 'classes' ? { class_group_id: String(created.id) } : {}),
      }))
      setMessage(quickAdd === 'levels' ? `Tingkat ${created.name} berhasil ditambahkan dan langsung dipilih.`
        : quickAdd === 'majors' ? `Jurusan ${created.code} berhasil ditambahkan dan langsung dipilih.`
          : `Kelas ${created.display_name ?? created.group_name} berhasil ditambahkan dan langsung dipilih.`)
      setQuickAdd('')
      setQuickForm({})
    } catch (reason) { setQuickError(errorText(reason)) } finally { setQuickBusy(false) }
  }

  const selectImportFile = (file) => {
    setImportResult(null)
    setError('')
    if (!file) {
      setImportFile(null)
      return
    }
    if (!/\.(csv|txt|xlsx|xls)$/i.test(file.name)) {
      setImportFile(null)
      setError('Format file harus CSV, TXT, XLSX, atau XLS.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setImportFile(null)
      setError('Ukuran file maksimal 5 MB.')
      return
    }
    setImportFile(file)
  }

  const importUsers = async () => {
    if (!importFile) return
    const body = new FormData()
    body.append('file', importFile)
    setBusy(true)
    setError('')
    setImportResult(null)
    setImportProgress({ percent: 0, phase: 'upload' })
    try {
      const response = await api('/api/imports/users', {
        method: 'POST',
        body,
        onProgress: (percent, phase) => setImportProgress(phase === 'done' ? { percent: 100, phase: 'processing' } : { percent, phase }),
      })
      setImportResult(response.data)
      setMessage(`Impor selesai: ${response.data.success_rows} anggota baru, ${response.data.updated_rows ?? 0} diperbarui, dan ${response.data.failed_rows} gagal.`)
      setImportFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await Promise.all([refresh(), loadOptions()])
    } catch (reason) { setError(errorLines(reason)) } finally { setBusy(false); setImportProgress(null) }
  }

  const downloadTemplate = async () => {
    setDownloadingTemplate(true)
    setError('')
    try {
      await download('/api/imports/users/template')
      setMessage('Template XLSX berhasil diunduh. Sheet Master memuat tingkat dan jurusan yang aktif.')
    } catch (reason) { setError(reason.message) } finally { setDownloadingTemplate(false) }
  }

  // Status diubah lewat endpoint khusus, jadi penempatan kelas dan password tidak pernah ikut terkirim.
  const toggleStatus = async (user) => {
    const nextStatus = user.status === 'active' ? 'inactive' : 'active'
    setRowBusy({ id: user.id, action: 'status' })
    setError('')
    try {
      await api(`/api/users/${user.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) })
      setMessage(`Status ${user.name} berhasil diubah menjadi ${optionLabel(statuses, nextStatus).toLowerCase()}.`)
      await refresh()
    } catch (reason) { setError(errorLines(reason)) } finally { setRowBusy(null) }
  }

  const printCards = async () => {
    if (!selected.length) return
    const count = selected.length
    setPrintingCards(true)
    setError('')
    try {
      await download('/api/users/cards/print', { method: 'POST', body: JSON.stringify({ ids: selected }) })
      setMessage(`${count} kartu anggota berhasil dibuat.`)
    } catch (reason) { setError(reason.message) } finally { setPrintingCards(false) }
  }

  const toggleUser = (id, checked) => {
    setError('')
    if (!checked) {
      setSelected((items) => items.filter((item) => item !== id))
      return
    }
    if (selected.includes(id)) return
    if (selected.length >= 100) {
      setError('Maksimal 100 anggota dapat dipilih untuk sekali cetak.')
      return
    }
    setSelected((items) => [...items, id])
  }

  const togglePage = (checked) => {
    setError('')
    if (!checked) {
      setSelected((items) => items.filter((id) => !pageIds.includes(id)))
      return
    }
    const newIds = pageIds.filter((id) => !selected.includes(id))
    if (selected.length + newIds.length > 100) {
      setError('Pilihan dibatasi maksimal 100 anggota. Batalkan sebagian pilihan terlebih dahulu.')
      return
    }
    setSelected((items) => [...items, ...newIds])
  }

  const remove = async (user) => {
    if (!confirm(`Hapus ${user.name}?`)) return
    setRowBusy({ id: user.id, action: 'delete' })
    try {
      await api(`/api/users/${user.id}`, { method: 'DELETE' })
      setSelected((items) => items.filter((id) => id !== user.id))
      setMessage(`${user.name} berhasil dihapus.`)
      await refresh()
    } catch (reason) { setError(reason.message) } finally { setRowBusy(null) }
  }

  const removeSelected = async () => {
    if (!selected.length) return
    if (!confirm(`Hapus ${selected.length} anggota terpilih? Tindakan ini tidak dapat dibatalkan.`)) return
    setBulkDeleting(true)
    setError('')
    try {
      const response = await api('/api/users/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: selected }) })
      const { deleted, skipped } = response.data
      setSelected(skipped.map((item) => item.id))
      if (deleted.length) setMessage(`${deleted.length} anggota berhasil dihapus.${skipped.length ? ` ${skipped.length} anggota dilewati.` : ''}`)
      if (skipped.length) setError(skipped.map((item) => `${item.name}: ${item.reason}`).join(' '))
      await refresh()
    } catch (reason) { setError(reason.message) } finally { setBulkDeleting(false) }
  }

  const resetPage = (setter) => (event) => {
    setter(event.target.value)
    setPage(1)
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="Administrasi" title="Anggota" description="Tambahkan anggota satu per satu atau lewat import, dengan penempatan kelas yang langsung terhubung ke master akademik." />
    {message && <Feedback type="success">{message}</Feedback>}
    {error && <Feedback type="error">{Array.isArray(error) ? <ul className="list-disc space-y-1 pl-5">{error.map((line, index) => <li key={index}>{line}</li>)}</ul> : error}</Feedback>}

    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Ringkasan jumlah anggota">
      {statsLoading && !stats
        ? [...Array(4)].map((_, index) => <div key={index} className="h-32 animate-pulse rounded-3xl border border-slate-200 bg-white p-5" />)
        : <>
          <StatCard tone="blue" icon="users" label="Total anggota terdaftar" value={stats?.total} helper="Seluruh akun anggota aktif di basis data" />
          <StatCard icon="student" label="Siswa" value={stats?.students} helper={stats?.unplaced_students ? `${stats.unplaced_students} siswa belum punya kelas` : percentHelper(stats?.students, stats?.total)} />
          <StatCard icon="staff" label="Guru / Staf" value={stats?.staff} helper={percentHelper(stats?.staff, stats?.total)} />
          <StatCard tone="emerald" icon="check" label="Anggota aktif" value={stats?.active} helper={`${stats?.suspended ?? 0} ditangguhkan • ${stats?.inactive ?? 0} tidak aktif`} />
        </>}
    </section>

    {canCreate && <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)]">
      <Panel
        title="Tambah anggota"
        description="Empat langkah: pilih tipe anggota, isi identitas, tentukan penempatan, lalu lengkapi data kartu perpustakaan."
        action={<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Entri manual</span>}
      >
        {optionsError && <div className="mb-4"><Feedback type="warning">Pilihan kelas gagal dimuat: {optionsError} <button type="button" onClick={loadOptions} className="underline">Coba lagi</button></Feedback></div>}

        <form onSubmit={create} className="space-y-4">
          <Step number="1" title="Tipe anggota" description="Menentukan isian penempatan dan aturan pinjam yang dipakai.">
            <div className="grid gap-3 sm:grid-cols-2">
              <TypeTile active={isStudent} icon="student" label="Siswa" description="Ditempatkan pada tingkat, jurusan, dan kelas." onSelect={() => changeMemberType('student')} />
              <TypeTile active={!isStudent} icon="staff" label="Guru / Staf" description="Memakai jabatan, tanpa penempatan kelas." onSelect={() => changeMemberType('staff')} />
            </div>
          </Step>

          <Step number="2" title="Identitas anggota" description={`${isStudent ? 'NIS' : 'NIP'} otomatis menjadi username. Password awal dipakai anggota untuk masuk pertama kali.`}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nama lengkap" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required error={formErrors.name?.[0]} className="sm:col-span-2" />
              <Field label={isStudent ? 'NIS' : 'NIP'} value={form.nis_nip} onChange={changeIdentity} hint={`Boleh dikosongkan bila belum ada. ${isStudent ? 'NIS' : 'NIP'} wajib unik.`} error={formErrors.nis_nip?.[0]} />
              <Field label="Username" value={form.username} onChange={changeUsername} required minLength="3"
                hint={usernameAuto ? `Mengikuti ${isStudent ? 'NIS' : 'NIP'} secara otomatis. Ketik untuk mengubahnya sendiri.` : 'Huruf, angka, titik, garis bawah, dan strip. Tanpa spasi.'}
                error={formErrors.username?.[0]}
                action={!usernameAuto && form.nis_nip.trim() !== '' && <button type="button" onClick={reuseIdentityAsUsername} className="font-bold text-blue-700 hover:underline">{`Pakai ${isStudent ? 'NIS' : 'NIP'}`}</button>} />
              <Field label="Password awal" type={showPassword ? 'text' : 'password'} value={form.password} onChange={(value) => setForm({ ...form, password: value })} required minLength="8" hint="Minimal 8 karakter." error={formErrors.password?.[0]}
                action={<span className="inline-flex gap-2"><button type="button" onClick={() => setShowPassword((value) => !value)} className="font-bold text-blue-700 hover:underline">{showPassword ? 'Sembunyikan' : 'Lihat'}</button><button type="button" onClick={() => { const value = suggestPassword(); setForm((current) => ({ ...current, password: value, password_confirmation: value })); setShowPassword(true) }} className="font-bold text-blue-700 hover:underline">Buat otomatis</button></span>} />
              <Field label="Konfirmasi password" type={showPassword ? 'text' : 'password'} value={form.password_confirmation} onChange={(value) => setForm({ ...form, password_confirmation: value })} required minLength="8"
                hint="Ulangi password awal supaya tidak ada salah ketik."
                error={formErrors.password?.[0] ? undefined : (passwordMismatch ? 'Konfirmasi password belum sama dengan password awal.' : undefined)} />
              <Select label="Jenis kelamin" value={form.gender} onChange={(value) => setForm({ ...form, gender: value })} options={genders} placeholder="Pilih jenis kelamin" error={formErrors.gender?.[0]} />
              <Select label="Status awal" value={form.status} onChange={(value) => setForm({ ...form, status: value })} options={statuses} error={formErrors.status?.[0]} />
            </div>
          </Step>

          {isStudent
            ? <Step number="3" title="Penempatan kelas" description="Pilih berurutan: tahun ajaran, tingkat, jurusan, lalu kelas.">
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Tahun ajaran" value={form.academic_year_id} onChange={(value) => changePlacement('academic_year_id', value)} options={options.academic_years.map((item) => [String(item.id), item.name])} placeholder={optionsLoading ? 'Memuat…' : 'Pilih tahun ajaran'} error={formErrors.academic_year_id?.[0]} />
                <Select label="Tingkat" value={form.education_level_id} onChange={(value) => changePlacement('education_level_id', value)} options={options.levels.map((item) => [String(item.id), `Kelas ${item.name}`])} placeholder={optionsLoading ? 'Memuat…' : 'Pilih tingkat'}
                  action={canManageAcademic && <QuickAddButton active={quickAdd === 'levels'} onClick={() => openQuickAdd('levels')} />} />
                <Select label="Jurusan" value={form.major_id} onChange={(value) => changePlacement('major_id', value)} options={options.majors.map((item) => [String(item.id), `${item.code} — ${item.name}`])} placeholder={optionsLoading ? 'Memuat…' : 'Pilih jurusan'}
                  action={canManageAcademic && <QuickAddButton active={quickAdd === 'majors'} onClick={() => openQuickAdd('majors')} />} />
                <Select label="Kelas / Rombel" value={form.class_group_id} onChange={(value) => changePlacement('class_group_id', value)} options={classesForForm.map((item) => [String(item.id), item.display_name])}
                  placeholder={!placementReady ? 'Pilih tingkat dan jurusan dahulu' : classesForForm.length ? 'Pilih kelas' : 'Belum ada kelas untuk kombinasi ini'}
                  disabled={!placementReady} error={formErrors.class_group_id?.[0]}
                  action={canManageAcademic && placementReady && <QuickAddButton active={quickAdd === 'classes'} onClick={() => openQuickAdd('classes')} />} />
              </div>

              {quickAdd && <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-sm font-black text-navy-950">{quickAddTitles[quickAdd][0]}</p><p className="mt-0.5 text-xs text-blue-800">{quickAddTitles[quickAdd][1]}</p></div>
                  <button type="button" onClick={() => setQuickAdd('')} disabled={quickBusy} className="text-xs font-bold text-slate-500 hover:text-slate-700 disabled:opacity-50">Tutup</button>
                </div>
                {quickError && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{quickError}</p>}
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {quickAdd === 'levels' && <>
                      <Field label="Nama tingkat" value={quickForm.name ?? ''} onChange={(value) => setQuickForm({ ...quickForm, name: value })} hint="Contoh: 10" />
                      <Field label="Urutan tampil" type="number" value={quickForm.sort_order ?? ''} onChange={(value) => setQuickForm({ ...quickForm, sort_order: value })} hint="Opsional, contoh: 10" />
                    </>}
                    {quickAdd === 'majors' && <>
                      <Field label="Kode jurusan" value={quickForm.code ?? ''} onChange={(value) => setQuickForm({ ...quickForm, code: value.toUpperCase() })} hint="Contoh: TKJ" />
                      <Field label="Nama jurusan" value={quickForm.name ?? ''} onChange={(value) => setQuickForm({ ...quickForm, name: value })} hint="Contoh: Teknik Komputer dan Jaringan" />
                    </>}
                    {quickAdd === 'classes' && <Field label="Nama rombel" value={quickForm.group_name ?? ''} onChange={(value) => setQuickForm({ ...quickForm, group_name: value.toUpperCase() })} hint="Contoh: A" className="sm:col-span-2" />}
                  </div>
                  <button type="button" onClick={submitQuickAdd} disabled={quickBusy} className="min-h-11 self-end rounded-xl bg-navy-950 px-4 text-sm font-bold text-white hover:bg-navy-900 disabled:opacity-50"><BusyLabel busy={quickBusy} busyText="Menyimpan…">Simpan</BusyLabel></button>
                </div>
              </div>}
            </Step>
            : <Step number="3" title="Jabatan dan hak akses" description="Role menentukan menu yang dapat dibuka petugas.">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Jabatan" value={form.position} onChange={(value) => setForm({ ...form, position: value })} required hint="Contoh: Guru Bahasa Indonesia, Pustakawan." error={formErrors.position?.[0]} />
                <Select label="Role" value={form.role} onChange={(value) => setForm({ ...form, role: value })} options={staffRoles} error={formErrors.role?.[0]} />
              </div>
            </Step>}

          <Step number="4" title="Kartu perpustakaan dan kontak" description="Foto dan tanggal gabung dipakai pada kartu anggota. Nomor anggota dibuat otomatis oleh sistem.">
            <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
              <div className="flex items-start gap-3">
                {photoPreview
                  ? <img src={photoPreview} alt="Pratinjau foto anggota" className="h-28 w-24 shrink-0 rounded-2xl border border-slate-200 object-cover" />
                  : <div className="grid h-28 w-24 shrink-0 place-items-center rounded-2xl border-2 border-dashed border-slate-300 bg-white text-center text-[11px] font-bold text-slate-400">Belum ada foto</div>}
                <div className="flex flex-col gap-2">
                  <button type="button" onClick={() => photoInputRef.current?.click()} className="min-h-10 rounded-xl border border-blue-700 px-3 text-xs font-bold text-blue-700 hover:bg-blue-50">{photo ? 'Ganti foto' : 'Pilih foto'}</button>
                  {photo && <button type="button" onClick={clearPhoto} className="min-h-10 rounded-xl px-3 text-xs font-bold text-red-600 hover:bg-red-50">Hapus foto</button>}
                  <p className="max-w-[9rem] text-[11px] leading-4 text-slate-500">JPG, PNG, atau WEBP. Maksimal 2 MB. Pakai foto potret agar rapi di kartu.</p>
                  {formErrors.photo?.[0] && <p className="max-w-[9rem] text-[11px] font-semibold text-red-600">{formErrors.photo[0]}</p>}
                  <input ref={photoInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => selectPhoto(event.target.files?.[0] ?? null)} className="sr-only" />
                </div>
              </div>
              <div className="grid content-start gap-3 sm:grid-cols-2">
                <Field label="Nomor HP" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} hint="Opsional. Contoh: 0812 3456 7890." error={formErrors.phone?.[0]} />
                <Field label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} hint="Opsional. Dipakai untuk pemberitahuan." error={formErrors.email?.[0]} />
                <Field label="Tanggal gabung" type="date" value={form.joined_at} onChange={(value) => setForm({ ...form, joined_at: value })} hint="Bawaan hari ini." error={formErrors.joined_at?.[0]} />
                <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs">
                  <p className="font-bold text-blue-900">Nomor anggota</p>
                  <p className="mt-1 leading-5 text-blue-800">Dibuat otomatis saat disimpan, dengan pola LIB-tahun-ajaran-urutan. Nomornya ditampilkan setelah anggota tersimpan.</p>
                </div>
              </div>
            </div>
          </Step>

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              {isStudent
                ? selectedClass ? <>Akan tersimpan sebagai siswa <strong className="text-navy-950">{selectedClass.display_name}</strong> tahun {selectedClass.academic_year}.</> : 'Pilih kelas untuk melanjutkan.'
                : <>Akan tersimpan sebagai <strong className="text-navy-950">{roleLabel(form.role)}</strong>{form.position ? ` — ${form.position}` : ''}.</>}
            </p>
            <button disabled={busy || passwordMismatch} className="min-h-11 rounded-xl bg-blue-700 px-5 font-bold text-white hover:bg-blue-800 disabled:opacity-60 sm:shrink-0"><BusyLabel busy={busy} busyText="Menyimpan…">Simpan anggota</BusyLabel></button>
          </div>
          {saveProgress && <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
            {saveProgress.phase === 'upload'
              ? <ProgressBar value={saveProgress.percent} label="Mengunggah foto anggota" hint="Jangan tutup halaman ini sampai proses selesai." />
              : <ProgressBar label="Menyimpan data anggota…" hint="Nomor anggota dan kartu sedang dibuat." />}
          </div>}
        </form>
      </Panel>

      <Panel
        title="Import anggota"
        description="Template memuat kolom tingkat, jurusan, dan kelas beserta daftar pilihannya."
        action={<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">XLSX</span>}
      >
        <ol className="grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-slate-500"><li className="rounded-xl bg-slate-50 p-2"><span className="block text-base text-blue-700">1</span>Unduh</li><li className="rounded-xl bg-slate-50 p-2"><span className="block text-base text-blue-700">2</span>Isi data</li><li className="rounded-xl bg-slate-50 p-2"><span className="block text-base text-blue-700">3</span>Unggah</li></ol>
        <button type="button" onClick={downloadTemplate} disabled={downloadingTemplate || busy} className="mt-4 min-h-11 w-full rounded-xl border border-blue-700 px-4 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"><BusyLabel busy={downloadingTemplate} busyText="Mengunduh…">↓ Unduh template XLSX</BusyLabel></button>
        <ul className="mt-3 space-y-1.5 rounded-2xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
          <li><strong className="text-navy-950">Siswa:</strong> isi tingkat, jurusan, dan kelas sekaligus. Pilihannya ada pada sheet <strong>Master</strong>.</li>
          <li><strong className="text-navy-950">Guru / staf:</strong> isi kolom jabatan, biarkan kolom penempatan kosong.</li>
          <li>Rombel baru dibuatkan otomatis pada tahun ajaran aktif; tingkat dan jurusan harus sudah ada.</li>
          <li>Template lama tetap diterima, tetapi tanpa penempatan kelas.</li>
        </ul>
        <div role="button" tabIndex="0" onClick={() => fileInputRef.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click() }} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); selectImportFile(event.dataTransfer.files?.[0]) }} className={`mt-4 cursor-pointer rounded-2xl border-2 border-dashed p-5 text-center transition ${dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-blue-400'}`}><div className="text-2xl text-blue-700" aria-hidden="true">⇧</div><p className="mt-2 text-sm font-bold">Tarik file ke sini atau klik untuk memilih</p><p className="mt-1 text-xs text-slate-500">CSV, XLSX, atau XLS • Maksimal 5 MB</p><input ref={fileInputRef} type="file" accept=".csv,.txt,.xlsx,.xls" onChange={(event) => selectImportFile(event.target.files?.[0])} className="sr-only" /></div>
        {importFile && <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-blue-50 p-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-navy-950">{importFile.name}</p><p className="text-xs text-blue-700">{(importFile.size / 1024).toFixed(1)} KB • Siap diunggah</p></div><button type="button" onClick={() => { setImportFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }} className="shrink-0 text-xs font-bold text-red-600">Hapus</button></div>}
        <button type="button" onClick={importUsers} disabled={!importFile || busy} className="mt-3 min-h-11 w-full rounded-xl bg-navy-950 px-4 text-sm font-bold text-white hover:bg-navy-900 disabled:cursor-not-allowed disabled:opacity-40"><BusyLabel busy={Boolean(importProgress)} busyText="Mengimpor data…">Mulai import</BusyLabel></button>
        {importProgress && <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
          {importProgress.phase === 'upload'
            ? <ProgressBar value={importProgress.percent} label="Mengunggah file" hint="Jangan tutup halaman ini sampai proses selesai." />
            : <ProgressBar label="Memproses baris data di server…" hint="Semakin banyak baris, semakin lama prosesnya. Mohon tunggu." />}
        </div>}
      </Panel>
    </div>}

    {importResult && <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">Hasil import</h2><p className="text-sm text-slate-500">{importResult.filename}</p></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Selesai</span></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-2xl bg-slate-50 p-4 text-center"><p className="text-2xl font-black">{importResult.total_rows}</p><p className="text-xs text-slate-500">Total baris</p></div><div className="rounded-2xl bg-emerald-50 p-4 text-center"><p className="text-2xl font-black text-emerald-700">{importResult.success_rows}</p><p className="text-xs text-emerald-700">Anggota baru</p></div><div className="rounded-2xl bg-blue-50 p-4 text-center"><p className="text-2xl font-black text-blue-700">{importResult.updated_rows ?? 0}</p><p className="text-xs text-blue-700">Diperbarui</p></div><div className="rounded-2xl bg-red-50 p-4 text-center"><p className="text-2xl font-black text-red-700">{importResult.failed_rows}</p><p className="text-xs text-red-700">Gagal</p></div></div>{importResult.notes?.length > 0 && <details className="mt-4 overflow-hidden rounded-2xl border border-blue-200"><summary className="cursor-pointer bg-blue-50 px-4 py-3 font-bold text-blue-800">Lihat catatan penyesuaian data ({importResult.notes.length})</summary><div className="max-h-72 divide-y divide-blue-100 overflow-y-auto">{importResult.notes.map((note, index) => <div key={index} className="p-4 text-sm"><p className="font-bold text-slate-900">Baris {note.row_number}{note.username ? ` • ${note.username}` : ''}</p><p className="mt-1 text-slate-600">{note.message}</p></div>)}</div></details>}{importResult.failures?.length > 0 && <details className="mt-4 overflow-hidden rounded-2xl border border-red-200"><summary className="cursor-pointer bg-red-50 px-4 py-3 font-bold text-red-800">Lihat baris yang gagal ({importResult.failures.length})</summary><div className="max-h-72 divide-y divide-red-100 overflow-y-auto">{importResult.failures.map((failure) => <div key={failure.id} className="p-4 text-sm"><p className="font-bold text-slate-900">Baris {failure.row_number}: {failure.row_data?.name ?? failure.row_data?.username ?? 'Data tidak valid'}</p><ul className="mt-1 list-disc pl-5 text-red-700">{Object.values(failure.errors ?? {}).flat().map((item, index) => <li key={index}>{item}</li>)}</ul></div>)}</div></details>}</section>}

    <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><LoadingOverlay show={Boolean(rowBusy) || bulkDeleting || printingCards} label={printingCards ? 'Menyiapkan kartu anggota…' : 'Memperbarui data anggota…'} /><div className="border-b border-slate-200 p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-3"><h2 className="text-xl font-black text-navy-950">Daftar anggota</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{pagination.total} hasil pencarian</span></div><p className="mt-1 text-sm text-slate-500">Cari dan kelola akun anggota perpustakaan.</p></div><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><button type="button" onClick={() => togglePage(!allPageSelected)} disabled={users.length === 0 || loading || printingCards || bulkDeleting} className="min-h-11 rounded-xl border border-blue-200 px-4 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40">{allPageSelected ? 'Batalkan halaman' : 'Pilih halaman ini'}</button><button type="button" onClick={printCards} disabled={selected.length === 0 || loading || printingCards || bulkDeleting} className="min-h-11 rounded-xl bg-blue-700 px-5 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40"><BusyLabel busy={printingCards} busyText="Membuat PDF…">{`Cetak kartu (${selected.length})`}</BusyLabel></button></div></div></div>
      <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_11rem_11rem_13rem] sm:p-5"><label className="sm:col-span-2 lg:col-span-1"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Pencarian</span><input type="search" value={search} onChange={resetPage(setSearch)} placeholder="Nama, username, atau NIS/NIP" className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" /></label><label><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Tipe anggota</span><select value={memberType} onChange={resetPage(setMemberType)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"><option value="">Semua tipe</option>{memberTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Status</span><select value={status} onChange={resetPage(setStatus)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"><option value="">Semua status</option>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Kelas</span><select value={classFilter} onChange={resetPage(setClassFilter)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"><option value="">Semua kelas</option>{options.classes.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label></div>

      {selected.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-blue-50 px-4 py-3 text-sm sm:px-5"><div><p className="font-bold text-blue-900">{selected.length} anggota dipilih</p><p className="text-xs text-blue-700">Maksimal 100 anggota dalam sekali cetak atau hapus.</p></div><div className="flex flex-wrap gap-2">{canDelete && <button type="button" onClick={removeSelected} disabled={printingCards || bulkDeleting} className="min-h-10 rounded-xl border border-red-200 bg-white px-3 font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"><BusyLabel busy={bulkDeleting} busyText="Menghapus…">{`Hapus semua (${selected.length})`}</BusyLabel></button>}<button type="button" onClick={() => setSelected([])} disabled={printingCards || bulkDeleting} className="min-h-10 rounded-xl px-3 font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-40">Batalkan pilihan</button></div></div>}

      <div className="hidden md:block"><table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-14 px-5 py-4"><input type="checkbox" aria-label="Pilih semua anggota pada halaman ini" checked={allPageSelected} disabled={users.length === 0 || loading || printingCards || bulkDeleting} onChange={(event) => togglePage(event.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-blue-700 disabled:opacity-40" /></th><th className="px-3 py-4">Anggota</th><th className="px-3 py-4">Identitas</th><th className="px-3 py-4">Penempatan</th><th className="px-3 py-4">Status</th><th className="px-5 py-4 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{loading && [...Array(5)].map((_, index) => <tr key={index}><td colSpan="6" className="px-5 py-3"><div className="h-14 animate-pulse rounded-xl bg-slate-100" /></td></tr>)}{!loading && users.map((user) => <tr key={user.id} className="hover:bg-slate-50"><td className="px-5 py-4"><input type="checkbox" aria-label={`Pilih ${user.name}`} checked={selected.includes(user.id)} disabled={printingCards || bulkDeleting} onChange={(event) => toggleUser(user.id, event.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-blue-700 disabled:opacity-40" /></td><td className="px-3 py-4"><div className="flex items-center gap-3"><Avatar user={user} className="h-10 w-10" /><div><p className="font-bold text-slate-900">{user.name}</p><p className="text-xs text-slate-500">{optionLabel(memberTypes, user.member_type)} • {roleLabel(user.role ?? user.roles?.[0]?.name)}{user.gender_label ? ` • ${user.gender_label}` : ''}</p></div></div></td><td className="px-3 py-4"><p className="font-mono text-xs font-bold">@{user.username}</p><p className="mt-1 text-xs text-slate-500">{user.nis_nip ?? 'NIS/NIP belum diisi'}</p><p className="text-xs text-slate-400">{user.member_number ?? 'Nomor anggota belum ada'}</p>{user.phone && <p className="text-xs text-slate-400">{user.phone}</p>}</td><td className="px-3 py-4"><PlacementCell user={user} /></td><td className="px-3 py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyles[user.status] ?? 'bg-slate-100 text-slate-700'}`}>{optionLabel(statuses, user.status)}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-2">{canUpdate && <button type="button" disabled={rowBusy?.id === user.id} onClick={() => toggleStatus(user)} className="min-h-9 rounded-lg border border-amber-300 px-3 text-xs font-bold text-amber-700 disabled:opacity-40"><BusyLabel busy={rowBusy?.id === user.id && rowBusy.action === 'status'} busyText="Menyimpan…" spinnerSize={13}>{user.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}</BusyLabel></button>}{canDelete && <button type="button" disabled={rowBusy?.id === user.id} onClick={() => remove(user)} className="min-h-9 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-600 disabled:opacity-40"><BusyLabel busy={rowBusy?.id === user.id && rowBusy.action === 'delete'} busyText="Menghapus…" spinnerSize={13}>Hapus</BusyLabel></button>}</div></td></tr>)}</tbody></table></div>

      <div className="divide-y divide-slate-100 md:hidden">{loading && [...Array(4)].map((_, index) => <div key={index} className="p-4"><div className="h-36 animate-pulse rounded-2xl bg-slate-100" /></div>)}{!loading && users.map((user) => <article key={user.id} className="p-4"><div className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start gap-3"><input type="checkbox" aria-label={`Pilih ${user.name}`} checked={selected.includes(user.id)} disabled={printingCards || bulkDeleting} onChange={(event) => toggleUser(user.id, event.target.checked)} className="mt-2 h-6 w-6 shrink-0 rounded border-slate-300 accent-blue-700 disabled:opacity-40" /><Avatar user={user} className="h-11 w-11" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black text-slate-900">{user.name}</p><span className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyles[user.status] ?? 'bg-slate-100 text-slate-700'}`}>{optionLabel(statuses, user.status)}</span></div><p className="mt-0.5 truncate text-sm text-slate-500">@{user.username}</p><div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs"><p><span className="text-slate-500">NIS/NIP</span><br /><span className="font-bold">{user.nis_nip ?? '-'}</span></p><p><span className="text-slate-500">No. anggota</span><br /><span className="font-bold">{user.member_number ?? '-'}</span></p><p><span className="text-slate-500">Tipe</span><br /><span className="font-bold">{optionLabel(memberTypes, user.member_type)}</span></p><p><span className="text-slate-500">Role</span><br /><span className="font-bold">{roleLabel(user.role ?? user.roles?.[0]?.name)}</span></p><p><span className="text-slate-500">Jenis kelamin</span><br /><span className="font-bold">{user.gender_label ?? '-'}</span></p><p><span className="text-slate-500">No. HP</span><br /><span className="font-bold">{user.phone ?? '-'}</span></p><p className="col-span-2"><span className="text-slate-500">Penempatan</span><br /><PlacementCell user={user} /></p></div><div className="mt-3 flex gap-2">{canUpdate && <button type="button" disabled={rowBusy?.id === user.id} onClick={() => toggleStatus(user)} className="min-h-10 flex-1 rounded-xl border border-amber-300 px-3 text-xs font-bold text-amber-700 disabled:opacity-40"><BusyLabel busy={rowBusy?.id === user.id && rowBusy.action === 'status'} busyText="Menyimpan…" spinnerSize={13}>{user.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}</BusyLabel></button>}{canDelete && <button type="button" disabled={rowBusy?.id === user.id} onClick={() => remove(user)} className="min-h-10 rounded-xl border border-red-200 px-4 text-xs font-bold text-red-600 disabled:opacity-40"><BusyLabel busy={rowBusy?.id === user.id && rowBusy.action === 'delete'} busyText="Menghapus…" spinnerSize={13}>Hapus</BusyLabel></button>}</div></div></div></div></article>)}</div>

      {!loading && users.length === 0 && <div className="p-5 sm:p-6"><EmptyState icon="♙" title="Anggota tidak ditemukan" description="Ubah kata pencarian atau filter yang digunakan." /></div>}
      {!loading && pagination.last > 1 && <nav aria-label="Navigasi halaman anggota" className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-4 sm:px-6"><button type="button" disabled={pagination.current <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="min-h-10 rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-700 disabled:opacity-40 sm:px-4">Sebelumnya</button><p className="text-center text-xs font-semibold text-slate-500 sm:text-sm">Halaman {pagination.current} dari {pagination.last}</p><button type="button" disabled={pagination.current >= pagination.last} onClick={() => setPage((value) => Math.min(pagination.last, value + 1))} className="min-h-10 rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-700 disabled:opacity-40 sm:px-4">Berikutnya</button></nav>}
    </section>
  </div>
}

// Foto anggota dipakai pada daftar maupun kartu; inisial nama tetap dipakai bila fotonya belum ada.
function Avatar({ user, className }) {
  if (user.photo_path) {
    return <img src={`${API_URL}/storage/${user.photo_path}`} alt={`Foto ${user.name}`} className={`${className} shrink-0 rounded-full border border-slate-200 object-cover`} />
  }
  return <div className={`${className} grid shrink-0 place-items-center rounded-full bg-blue-100 font-black text-blue-800`}>{user.name.charAt(0).toUpperCase()}</div>
}

function PlacementCell({ user }) {
  if (user.placement) {
    return <span className="block"><span className="font-semibold text-slate-800">{user.placement.class_name}</span><span className="mt-0.5 block text-xs text-slate-500">{user.placement.major} • {user.placement.academic_year}</span></span>
  }
  if (user.member_type === 'student') {
    return <span className="block"><span className="font-semibold text-amber-700">Belum ada kelas</span><span className="mt-0.5 block text-xs text-slate-500">{user.class_or_position ?? 'Tempatkan lewat form tambah anggota'}</span></span>
  }
  return <span className="block"><span className="font-semibold text-slate-800">{user.class_or_position ?? '-'}</span><span className="mt-0.5 block text-xs text-slate-500">Jabatan</span></span>
}

function Step({ number, title, description, children }) {
  return <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-700 text-xs font-black text-white" aria-hidden="true">{number}</span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-black text-navy-950">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  </section>
}

function TypeTile({ active, label, description, icon, onSelect }) {
  return <button type="button" onClick={onSelect} aria-pressed={active} className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition ${active ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}><StatIcon name={icon} /></span>
    <span className="min-w-0"><span className="block text-sm font-black text-navy-950">{label}</span><span className="mt-0.5 block text-xs text-slate-500">{description}</span></span>
  </button>
}

function QuickAddButton({ active, onClick }) {
  return <button type="button" onClick={onClick} className="text-xs font-bold text-blue-700 hover:underline">{active ? 'Tutup' : '+ Tambah'}</button>
}

function percentHelper(part, total) {
  if (!total || part === undefined || part === null) return 'Belum ada data'
  return `${Math.round((part / total) * 100)}% dari total anggota`
}

function StatCard({ label, value, helper, icon, tone = 'neutral' }) {
  const tones = {
    neutral: 'border-slate-200 bg-white',
    blue: 'border-blue-100 bg-blue-50',
    emerald: 'border-emerald-100 bg-emerald-50',
  }
  const iconTones = {
    neutral: 'bg-slate-100 text-slate-600',
    blue: 'bg-blue-100 text-blue-700',
    emerald: 'bg-emerald-100 text-emerald-700',
  }
  return <article className={`rounded-3xl border p-5 shadow-sm shadow-slate-900/[.02] ${tones[tone]}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-500">{label}</p>
        <p className="mt-2 text-3xl font-black tracking-tight text-navy-950">{value ?? '–'}</p>
      </div>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${iconTones[tone]}`}><StatIcon name={icon} /></span>
    </div>
    <p className="mt-3 truncate text-[11px] text-slate-500">{helper}</p>
  </article>
}

function StatIcon({ name }) {
  const paths = {
    users: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a4 4 0 0 1 0 7',
    student: 'M3 9l9-4 9 4-9 4-9-4Zm4 6v3c0 1 2.2 2 5 2s5-1 5-2v-3',
    staff: 'M4 20v-1a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    check: 'm5 12 4 4L19 6',
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.users} /></svg>
}

function Field({ label, value, onChange, type = 'text', required = false, minLength, hint, error, action, className = '' }) {
  return <div className={`text-sm font-bold ${className}`}>
    <div className="flex items-end justify-between gap-2"><label htmlFor={`field-${slug(label)}`}>{label}</label>{action && <span className="text-xs font-normal">{action}</span>}</div>
    <input id={`field-${slug(label)}`} type={type} value={value} required={required} minLength={minLength} aria-invalid={error ? 'true' : undefined} onChange={(event) => onChange(event.target.value)} className={`mt-1 min-h-11 w-full rounded-xl border bg-white px-3 font-normal outline-none focus:ring-4 ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-slate-300 focus:border-blue-600 focus:ring-blue-100'}`} />
    {error ? <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span> : hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}
  </div>
}

function Select({ label, value, onChange, options, placeholder, error, action, disabled = false }) {
  return <div className="text-sm font-bold">
    <div className="flex items-end justify-between gap-2"><label htmlFor={`select-${slug(label)}`}>{label}</label>{action && <span className="text-xs font-normal">{action}</span>}</div>
    <select id={`select-${slug(label)}`} value={value} disabled={disabled} aria-invalid={error ? 'true' : undefined} onChange={(event) => onChange(event.target.value)} className={`mt-1 min-h-11 w-full rounded-xl border bg-white px-3 font-normal outline-none focus:ring-4 disabled:bg-slate-100 disabled:text-slate-400 ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-slate-300 focus:border-blue-600 focus:ring-blue-100'}`}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(([itemValue, itemLabel]) => <option key={itemValue} value={itemValue}>{itemLabel}</option>)}
    </select>
    {error && <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span>}
  </div>
}
