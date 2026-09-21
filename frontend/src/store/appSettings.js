import { create } from 'zustand'
import { api } from '../lib/api'

const defaults = { app_name: 'SMK Bina Mandiri', app_subtitle: 'Library Management', logo_url: null, footer_text: '' }

export const useAppSettings = create((set, get) => ({
  ...defaults,
  loaded: false,

  load: async () => {
    if (get().loaded) return
    try {
      const response = await api('/api/settings/app')
      set({ ...defaults, ...response.data, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  setSettings: (data) => set({ ...data }),
}))
