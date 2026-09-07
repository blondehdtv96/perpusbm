import { create } from 'zustand'
import { api, csrf } from '../lib/api'

export const useAuth = create((set, get) => ({
  user: null,
  roles: [],
  permissions: [],
  loading: true,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return
    try {
      const response = await api('/api/auth/me')
      set({ ...response.data })
    } catch {
      set({ user: null, roles: [], permissions: [] })
    } finally {
      set({ loading: false, initialized: true })
    }
  },

  login: async (credentials) => {
    await csrf()
    const response = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    })
    set({ ...response.data, initialized: true, loading: false })
  },

  logout: async () => {
    await api('/api/auth/logout', { method: 'POST' })
    set({ user: null, roles: [], permissions: [], initialized: true })
  },

  can: (permission) => get().permissions.includes(permission),
}))
