import { useEffect, useState } from 'react'
import { api } from './api'

// Istilah, batasan, dan helper keanggotaan yang dipakai bersama halaman Daftar anggota,
// Tambah anggota, dan Admin & Petugas, supaya ketiganya tidak pernah berbeda sebutan.

export const API_URL = import.meta.env.VITE_API_URL ?? ''
export const memberTypes = [['student', 'Siswa'], ['staff', 'Guru / Staf']]
export const adminRoles = [['librarian', 'Pustakawan'], ['super_admin', 'Super Admin']]
export const allRoles = [['student', 'Siswa'], ['staff', 'Guru / Staf'], ...adminRoles]
export const statuses = [['active', 'Aktif'], ['suspended', 'Ditangguhkan'], ['inactive', 'Tidak aktif']]
export const genders = [['L', 'Laki-laki'], ['P', 'Perempuan']]
export const statusStyles = {
  active: 'bg-emerald-100 text-emerald-700',
  suspended: 'bg-amber-100 text-amber-800',
  inactive: 'bg-slate-200 text-slate-700',
}
export const photoTypes = ['image/jpeg', 'image/png', 'image/webp']
export const maxPhotoSize = 2 * 1024 * 1024
export const filterControlClass = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100'

export const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Tanggal hari ini pada zona waktu petugas, dipakai sebagai tanggal gabung bawaan.
export function today() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function optionLabel(options, value) {
  return options.find(([key]) => key === value)?.[1] ?? value
}

export function roleLabel(role) {
  return optionLabel(allRoles, role)
}

// Error validasi (422) membawa pesan per field; tampilkan semuanya, bukan hanya ringkasan "…and 1 more error".
export function errorLines(reason) {
  const lines = Object.values(reason?.errors ?? {}).flat().filter(Boolean)
  return lines.length > 0 ? lines : (reason?.message ?? 'Terjadi kesalahan.')
}

export function errorText(reason) {
  const lines = errorLines(reason)
  return Array.isArray(lines) ? lines.join(' ') : lines
}

// Password awal yang mudah dibacakan ke anggota tetapi tetap acak dan memenuhi panjang minimal.
export function suggestPassword() {
  const words = ['Baca', 'Buku', 'Pustaka', 'Literasi', 'Rajin', 'Cerdas']
  const word = words[Math.floor(Math.random() * words.length)]
  return `${word}#${Math.floor(1000 + Math.random() * 9000)}`
}

export async function requestMemberStats() {
  try {
    const response = await api('/api/users/stats')
    return response.data ?? null
  } catch {
    return null
  }
}

export function percentHelper(part, total) {
  if (!total || part === undefined || part === null) return 'Belum ada data'
  return `${Math.round((part / total) * 100)}% dari total anggota`
}

// Keadaan pemilih foto anggota: batasannya disamakan dengan validasi server agar kesalahan
// terlihat sebelum berkasnya diunggah, dan pratinjaunya selalu dibersihkan dari memori.
export function usePhotoPicker() {
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')

  const select = (file) => {
    setError('')
    setPreview((current) => { if (current) URL.revokeObjectURL(current); return '' })
    if (!file) {
      setPhoto(null)
      return
    }
    if (!photoTypes.includes(file.type)) {
      setPhoto(null)
      setError('Format foto harus JPG, PNG, atau WEBP.')
      return
    }
    if (file.size > maxPhotoSize) {
      setPhoto(null)
      setError('Ukuran foto maksimal 2 MB.')
      return
    }
    setPhoto(file)
    setPreview(URL.createObjectURL(file))
  }

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  return { photo, preview, error, select, clear: () => select(null) }
}
