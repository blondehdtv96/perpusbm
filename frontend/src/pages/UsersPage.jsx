import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BusyLabel, Feedback, PageHeader, Panel, ProgressBar } from '../components/ui'
import { Field, PhotoPicker, Select, StatIcon, Step } from '../components/members'
import { errorLines, errorText, genders, roleLabel, statuses, suggestPassword, today, usePhotoPicker } from '../lib/members'
import { api, download } from '../lib/api'
import { formatDate } from '../lib/format'
import { useAuth } from '../store/auth'

const initialForm = {
  name: '', username: '', password: '', password_confirmation: '', nis_nip: '', member_type: 'student', status: 'active',
  gender: '', email: '', phone: '', joined_at: today(),
  academic_year_id: '', education_level_id: '', major_id: '', class_group_id: '', position: '',
}
const emptyOptions = { academic_years: [], levels: [], majors: [], classes: [], default_academic_year_id: null }
const quickAddTitles = {
  levels: ['Tambah tingkat', 'Tingkat baru langsung tersedia untuk seluruh jurusan.'],
  majors: ['Tambah jurusan', 'Kode jurusan dipakai pada nama kelas, misalnya 10 TKJ A.'],
  classes: ['Tambah kelas', 'Kelas dibuat pada tahun ajaran, tingkat, dan jurusan yang sedang dipilih.'],
}

export default function UsersPage() {
  const permissions = useAuth((state) => state.permissions)
  const canManageAcademic = permissions.includes('academic.manage')
  const fileInputRef = useRef(null)
  const photo = usePhotoPicker()
  const [form, setForm] = useState(initialForm)
  const [options, setOptions] = useState(emptyOptions)
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsError, setOptionsError] = useState('')
  const [quickAdd, setQuickAdd] = useState('')
  const [quickForm, setQuickForm] = useState({})
  const [quickBusy, setQuickBusy] = useState(false)
  const [quickError, setQuickError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [usernameAuto, setUsernameAuto] = useState(true)
  const [saveProgress, setSaveProgress] = useState(null)
  const [importFile, setImportFile] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [updateExisting, setUpdateExisting] = useState(false)
  const [importHistory, setImportHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [openHistoryId, setOpenHistoryId] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [downloadingTemplate, setDownloadingTemplate] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [formErrors, setFormErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [importProgress, setImportProgress] = useState(null)

  const isStudent = form.member_type === 'student'
  const passwordMismatch = form.password_confirmation !== '' && form.password !== form.password_confirmation

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

  // Riwayat import disimpan di server, jadi hasil import sebelumnya tetap bisa dibuka
  // walaupun petugas sudah menjalankan import berikutnya.
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const response = await api('/api/imports/users?per_page=10', { silent: true })
      setImportHistory(response.data ?? [])
    } catch { /* riwayat bersifat pelengkap, kegagalannya tidak boleh mengganggu halaman */ } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { loadOptions(); loadHistory() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadOptions, loadHistory])

  const openHistory = async (job) => {
    if (openHistoryId === job.id) return
    setError('')
    setOpenHistoryId(job.id)
    setImportResult(job)
    try {
      const response = await api(`/api/imports/users/${job.id}`, { silent: true })
      setImportResult(response.data)
    } catch (reason) { setError(errorText(reason)) }
  }

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
      // Anggota hanya berisi siswa serta guru/staf; akun admin dibuat di halaman Admin & Petugas.
      role: isStudent ? 'student' : 'staff',
      ...(isStudent ? { class_group_id: form.class_group_id ? Number(form.class_group_id) : null } : { position: form.position }),
    }
    // Foto hanya dapat dikirim sebagai berkas, jadi baris dengan foto memakai FormData
    // beserta progres unggahan; tanpa foto tetap JSON agar permintaannya ringan.
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
      setForm({ ...initialForm, joined_at: form.joined_at, academic_year_id: form.academic_year_id, education_level_id: form.education_level_id, major_id: form.major_id, class_group_id: form.class_group_id, member_type: form.member_type })
      setShowPassword(false)
      setUsernameAuto(true)
      photo.clear()
      setMessage(response?.message ?? 'Anggota berhasil ditambahkan.')
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
    body.append('update_existing', updateExisting ? '1' : '0')
    setBusy(true)
    setError('')
    setImportProgress({ percent: 0, phase: 'upload' })
    try {
      const response = await api('/api/imports/users', {
        method: 'POST',
        body,
        onProgress: (percent, phase) => setImportProgress(phase === 'done' ? { percent: 100, phase: 'processing' } : { percent, phase }),
      })
      setImportResult(response.data)
      setOpenHistoryId(response.data.id)
      setMessage(`Impor selesai: ${response.data.success_rows} anggota baru, ${response.data.updated_rows ?? 0} diperbarui, dan ${response.data.failed_rows} gagal. Hasil ini tersimpan di riwayat import.`)
      setImportFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await Promise.all([loadOptions(), loadHistory()])
    } catch (reason) { setError(errorLines(reason)) } finally { setBusy(false); setImportProgress(null) }
  }

  const downloadTemplate = async () => {
    setDownloadingTemplate(true)
    setError('')
    try {
      await download('/api/imports/users/template')
      setMessage('Template XLSX berhasil diunduh. Kelas siswa cukup ditulis pada satu kolom, misalnya 10 TKJ A.')
    } catch (reason) { setError(reason.message) } finally { setDownloadingTemplate(false) }
  }

  return <div className="space-y-6">
    <PageHeader
      eyebrow="Administrasi"
      title="Tambah Anggota"
      description="Tambahkan anggota satu per satu atau lewat import, dengan penempatan kelas yang langsung terhubung ke master akademik."
      actions={<Link to="/members" className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-50">Lihat daftar anggota</Link>}
    />
    {message && <Feedback type="success">{message}</Feedback>}
    {error && <Feedback type="error">{Array.isArray(error) ? <ul className="list-disc space-y-1 pl-5">{error.map((line, index) => <li key={index}>{line}</li>)}</ul> : error}</Feedback>}

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)]">
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
            <p className="mt-3 text-xs text-slate-500">Akun pustakawan dan super admin tidak dibuat di sini. Gunakan halaman <Link to="/admins" className="font-bold text-blue-700 hover:underline">Admin &amp; Petugas</Link>.</p>
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
            : <Step number="3" title="Jabatan" description="Jabatan tampil pada kartu perpustakaan dan daftar anggota.">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Jabatan" value={form.position} onChange={(value) => setForm({ ...form, position: value })} required hint="Contoh: Guru Bahasa Indonesia, Tata Usaha." error={formErrors.position?.[0]} className="sm:col-span-2" />
              </div>
            </Step>}

          <Step number="4" title="Kartu perpustakaan dan kontak" description="Foto dan tanggal gabung dipakai pada kartu anggota. Nomor anggota dibuat otomatis oleh sistem.">
            <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
              <PhotoPicker picker={photo} serverError={formErrors.photo?.[0]} />
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
                : <>Akan tersimpan sebagai <strong className="text-navy-950">{roleLabel('staff')}</strong>{form.position ? ` — ${form.position}` : ''}.</>}
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
        description="Kelas siswa ditulis bebas pada satu kolom, misalnya 10 TKJ A."
        action={<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">XLSX</span>}
      >
        <ol className="grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-slate-500"><li className="rounded-xl bg-slate-50 p-2"><span className="block text-base text-blue-700">1</span>Unduh</li><li className="rounded-xl bg-slate-50 p-2"><span className="block text-base text-blue-700">2</span>Isi data</li><li className="rounded-xl bg-slate-50 p-2"><span className="block text-base text-blue-700">3</span>Unggah</li></ol>
        <button type="button" onClick={downloadTemplate} disabled={downloadingTemplate || busy} className="mt-4 min-h-11 w-full rounded-xl border border-blue-700 px-4 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"><BusyLabel busy={downloadingTemplate} busyText="Mengunduh…">↓ Unduh template XLSX</BusyLabel></button>
        <ul className="mt-3 space-y-1.5 rounded-2xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
          <li><strong className="text-navy-950">Siswa:</strong> isi satu kolom <strong>kelas</strong> dengan urutan tingkat, jurusan, rombel — contoh <strong>10 TKJ A</strong>, <strong>X-TKJ-1</strong>, atau nama jurusan lengkap.</li>
          <li><strong className="text-navy-950">Guru / staf:</strong> isi kolom jabatan, biarkan kolom kelas kosong.</li>
          <li>Tingkat, jurusan, dan rombel yang belum terdaftar dibuatkan otomatis pada tahun ajaran aktif, lalu dicatat di hasil import — periksa ejaannya sebelum mengunggah.</li>
          <li>Template lama tetap diterima, termasuk yang memisah tingkat, jurusan, dan kelas.</li>
          <li><strong className="text-navy-950">Import berulang aman:</strong> anggota yang sudah terdaftar hanya dilengkapi pada bagian yang masih kosong, data lama dan penempatan kelasnya tetap disimpan.</li>
        </ul>
        <label className="mt-3 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3">
          <input type="checkbox" checked={updateExisting} onChange={(event) => setUpdateExisting(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-700" />
          <span className="text-[11px] leading-5 text-slate-600"><strong className="block text-xs text-navy-950">Perbarui data anggota yang sudah terdaftar</strong>{updateExisting
            ? 'Isi berkas akan menimpa nama, tipe, NIS/NIP, serta kelas anggota yang sudah ada. Password lama tetap dipakai.'
            : 'Biarkan kosong agar data anggota yang sudah ada tidak tertimpa saat berkas yang sama diimport lagi.'}</span>
        </label>
        <div role="button" tabIndex="0" onClick={() => fileInputRef.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click() }} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); selectImportFile(event.dataTransfer.files?.[0]) }} className={`mt-4 cursor-pointer rounded-2xl border-2 border-dashed p-5 text-center transition ${dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-blue-400'}`}><div className="text-2xl text-blue-700" aria-hidden="true">⇧</div><p className="mt-2 text-sm font-bold">Tarik file ke sini atau klik untuk memilih</p><p className="mt-1 text-xs text-slate-500">CSV, XLSX, atau XLS • Maksimal 5 MB</p><input ref={fileInputRef} type="file" accept=".csv,.txt,.xlsx,.xls" onChange={(event) => selectImportFile(event.target.files?.[0])} className="sr-only" /></div>
        {importFile && <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-blue-50 p-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-navy-950">{importFile.name}</p><p className="text-xs text-blue-700">{(importFile.size / 1024).toFixed(1)} KB • Siap diunggah</p></div><button type="button" onClick={() => { setImportFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }} className="shrink-0 text-xs font-bold text-red-600">Hapus</button></div>}
        <button type="button" onClick={importUsers} disabled={!importFile || busy} className="mt-3 min-h-11 w-full rounded-xl bg-navy-950 px-4 text-sm font-bold text-white hover:bg-navy-900 disabled:cursor-not-allowed disabled:opacity-40"><BusyLabel busy={Boolean(importProgress)} busyText="Mengimpor data…">Mulai import</BusyLabel></button>
        {importProgress && <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
          {importProgress.phase === 'upload'
            ? <ProgressBar value={importProgress.percent} label="Mengunggah file" hint="Jangan tutup halaman ini sampai proses selesai." />
            : <ProgressBar label="Memproses baris data di server…" hint="Semakin banyak baris, semakin lama prosesnya. Mohon tunggu." />}
        </div>}
      </Panel>
    </div>

    <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-black">Riwayat import</h2><p className="text-sm text-slate-500">Setiap import tersimpan beserta catatan dan baris gagalnya, jadi hasil import lama tidak hilang saat Anda mengimpor lagi.</p></div>
        <button type="button" onClick={loadHistory} disabled={historyLoading} className="text-xs font-bold text-blue-700 hover:underline disabled:opacity-50">{historyLoading ? 'Memuat…' : 'Muat ulang'}</button>
      </div>
      {historyLoading && importHistory.length === 0
        ? <p className="mt-4 text-sm text-slate-500">Memuat riwayat import…</p>
        : importHistory.length === 0
          ? <p className="mt-4 text-sm text-slate-500">Belum ada import anggota yang pernah dijalankan.</p>
          : <ul className="mt-4 divide-y divide-slate-100">{importHistory.map((job) => <li key={job.id}>
            <button type="button" onClick={() => openHistory(job)} aria-current={openHistoryId === job.id} className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl p-3 text-left transition ${openHistoryId === job.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-navy-950">{job.filename}</span>
                <span className="block text-xs text-slate-500">{formatDate(job.created_at, true)}{job.user?.name ? ` • oleh ${job.user.name}` : ''}{job.status !== 'completed' ? ` • ${job.status === 'failed' ? 'gagal diproses' : job.status}` : ''}</span>
              </span>
              <span className="flex shrink-0 flex-wrap gap-1.5 text-[11px] font-bold">
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">{job.success_rows} baru</span>
                <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-700">{job.updated_rows ?? 0} diperbarui</span>
                <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-700">{job.failed_rows} gagal</span>
              </span>
            </button>
          </li>)}</ul>}
    </section>

    {importResult && <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">Hasil import</h2><p className="text-sm text-slate-500">{importResult.filename}{importResult.created_at ? ` • ${formatDate(importResult.created_at, true)}` : ''}</p></div><div className="flex items-center gap-3"><Link to="/members" className="text-xs font-bold text-blue-700 hover:underline">Lihat daftar anggota</Link>{importResult.status === 'failed'
      ? <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">Gagal diproses</span>
      : <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Selesai</span>}</div></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-2xl bg-slate-50 p-4 text-center"><p className="text-2xl font-black">{importResult.total_rows}</p><p className="text-xs text-slate-500">Total baris</p></div><div className="rounded-2xl bg-emerald-50 p-4 text-center"><p className="text-2xl font-black text-emerald-700">{importResult.success_rows}</p><p className="text-xs text-emerald-700">Anggota baru</p></div><div className="rounded-2xl bg-blue-50 p-4 text-center"><p className="text-2xl font-black text-blue-700">{importResult.updated_rows ?? 0}</p><p className="text-xs text-blue-700">Diperbarui</p></div><div className="rounded-2xl bg-red-50 p-4 text-center"><p className="text-2xl font-black text-red-700">{importResult.failed_rows}</p><p className="text-xs text-red-700">Gagal</p></div></div>{importResult.notes?.length > 0 && <details className="mt-4 overflow-hidden rounded-2xl border border-blue-200"><summary className="cursor-pointer bg-blue-50 px-4 py-3 font-bold text-blue-800">Lihat catatan penyesuaian data ({importResult.notes.length})</summary><div className="max-h-72 divide-y divide-blue-100 overflow-y-auto">{importResult.notes.map((note, index) => <div key={index} className="p-4 text-sm"><p className="font-bold text-slate-900">Baris {note.row_number}{note.username ? ` • ${note.username}` : ''}</p><p className="mt-1 text-slate-600">{note.message}</p></div>)}</div></details>}{importResult.failures?.length > 0 && <details className="mt-4 overflow-hidden rounded-2xl border border-red-200"><summary className="cursor-pointer bg-red-50 px-4 py-3 font-bold text-red-800">Lihat baris yang gagal ({importResult.failures.length})</summary><div className="max-h-72 divide-y divide-red-100 overflow-y-auto">{importResult.failures.map((failure) => <div key={failure.id} className="p-4 text-sm"><p className="font-bold text-slate-900">Baris {failure.row_number}: {failure.row_data?.name ?? failure.row_data?.username ?? 'Data tidak valid'}</p><ul className="mt-1 list-disc pl-5 text-red-700">{Object.values(failure.errors ?? {}).flat().map((item, index) => <li key={index}>{item}</li>)}</ul></div>)}</div></details>}</section>}
  </div>
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
