const API_URL = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  constructor(message, status, errors = {}) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

export async function api(path, options = {}) {
  const method = (options.method ?? 'GET').toUpperCase()
  const xsrfToken = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
    ?.split('=')
    .slice(1)
    .join('=')

  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(!['GET', 'HEAD', 'OPTIONS'].includes(method) && xsrfToken
        ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrfToken) }
        : {}),
      ...options.headers,
    },
  })

  if (response.status === 204) return null
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new ApiError(payload.message ?? 'Terjadi kesalahan.', response.status, payload.errors)
  }
  return payload
}

export function csrf() {
  return api('/sanctum/csrf-cookie')
}

export async function download(path, options = {}) {
  const method = (options.method ?? 'GET').toUpperCase()
  const xsrfToken = document.cookie.split('; ').find((cookie) => cookie.startsWith('XSRF-TOKEN='))?.split('=').slice(1).join('=')
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include', ...options,
    headers: {
      Accept: '*/*',
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(!['GET', 'HEAD'].includes(method) && xsrfToken ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrfToken) } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) throw new ApiError('Unduhan gagal.', response.status)
  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') ?? ''
  const filename = disposition.match(/filename[^;=]*=(?:"([^"]+)"|([^;]+))/)?.slice(1).find(Boolean) ?? 'download'
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = filename.replaceAll('"', ''); anchor.click()
  URL.revokeObjectURL(url)
}
