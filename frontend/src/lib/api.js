const API_URL = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  constructor(message, status, errors = {}, retryAfter = 0) {
    super(message)
    this.status = status
    this.errors = errors
    this.retryAfter = retryAfter
  }
}

// Penghitung request aktif supaya progress bar global tahu kapan harus tampil.
// Pakai { silent: true } untuk request latar belakang yang tidak perlu terlihat.
const activityListeners = new Set()
let activeRequests = 0

function notifyActivity() {
  activityListeners.forEach((listener) => listener(activeRequests))
}

export function subscribeToApiActivity(listener) {
  activityListeners.add(listener)
  listener(activeRequests)
  return () => activityListeners.delete(listener)
}

function beginRequest(silent) {
  if (silent) return () => {}
  activeRequests += 1
  notifyActivity()
  let settled = false
  return () => {
    if (settled) return
    settled = true
    activeRequests = Math.max(0, activeRequests - 1)
    notifyActivity()
  }
}

function csrfHeader(method) {
  const token = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
    ?.split('=')
    .slice(1)
    .join('=')

  return !['GET', 'HEAD', 'OPTIONS'].includes(method) && token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {}
}

export async function api(path, options = {}) {
  const { silent = false, onProgress, ...request } = options
  const method = (request.method ?? 'GET').toUpperCase()
  const finish = beginRequest(silent)

  if (onProgress) {
    try {
      return await xhrRequest(path, method, request, onProgress)
    } finally {
      finish()
    }
  }

  try {
    const response = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      ...request,
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(request.body && !(request.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...csrfHeader(method),
        ...request.headers,
      },
    })

    if (response.status === 204) return null
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const headerRetryAfter = Number.parseInt(response.headers.get('Retry-After') ?? '', 10)
      const retryAfter = Number(payload.retry_after) || (Number.isNaN(headerRetryAfter) ? 0 : headerRetryAfter)
      throw new ApiError(payload.message ?? 'Terjadi kesalahan.', response.status, payload.errors, retryAfter)
    }
    return payload
  } finally {
    finish()
  }
}

// fetch() belum bisa melaporkan progres unggahan, jadi request dengan onProgress dijalankan via XHR
// agar progress bar unggah file (import anggota, cover buku, logo, foto profil) menampilkan persentase nyata.
function xhrRequest(path, method, request, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, `${API_URL}${path}`, true)
    xhr.withCredentials = true
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest')
    if (request.body && !(request.body instanceof FormData)) xhr.setRequestHeader('Content-Type', 'application/json')
    Object.entries({ ...csrfHeader(method), ...request.headers }).forEach(([key, value]) => xhr.setRequestHeader(key, value))

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100), 'upload')
    })
    // Unggahan selesai, server masih memproses barisnya: biarkan indikator berjalan tanpa persentase.
    xhr.upload.addEventListener('load', () => onProgress(100, 'processing'))
    xhr.addEventListener('load', () => {
      onProgress(100, 'done')
      if (xhr.status === 204) return resolve(null)
      let payload
      try { payload = JSON.parse(xhr.responseText) } catch { payload = {} }
      if (xhr.status < 200 || xhr.status >= 300) {
        const retryAfter = Number(payload.retry_after) || Number.parseInt(xhr.getResponseHeader('Retry-After') ?? '', 10) || 0
        return reject(new ApiError(payload.message ?? 'Terjadi kesalahan.', xhr.status, payload.errors, retryAfter))
      }
      return resolve(payload)
    })
    xhr.addEventListener('error', () => reject(new ApiError('Koneksi ke server gagal. Periksa jaringan lalu coba lagi.', 0)))
    xhr.addEventListener('abort', () => reject(new ApiError('Permintaan dibatalkan.', 0)))
    xhr.send(request.body ?? null)
  })
}

export function csrf() {
  return api('/sanctum/csrf-cookie')
}

export async function download(path, options = {}) {
  const { silent = false, ...request } = options
  const method = (request.method ?? 'GET').toUpperCase()
  const finish = beginRequest(silent)
  try {
    const response = await fetch(`${API_URL}${path}`, {
      credentials: 'include', ...request,
      headers: {
        Accept: '*/*',
        ...(request.body && !(request.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...csrfHeader(method),
        ...request.headers,
      },
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new ApiError(payload.message ?? 'Unduhan gagal.', response.status, payload.errors)
    }
    const blob = await response.blob()
    const disposition = response.headers.get('content-disposition') ?? ''
    const filename = disposition.match(/filename[^;=]*=(?:"([^"]+)"|([^;]+))/)?.slice(1).find(Boolean) ?? 'download'
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = filename.replaceAll('"', '')
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    // Revoking immediately can cut off larger downloads (e.g. multi-card PDFs) before the browser finishes reading the blob.
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  } finally {
    finish()
  }
}
