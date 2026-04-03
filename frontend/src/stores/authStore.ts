import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface User {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'inspector' | 'contractor'
  created_at: string
}

interface AuthState {
  user: User | null
  token: string | null
  login: (user: User, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: {
        id: 'dev-id',
        email: 'admin@inspector.ai',
        full_name: 'Admin Bypass',
        role: 'admin',
        created_at: new Date().toISOString()
      },
      token: 'dev-token',
      login: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
    }),
    {
      name: 'auth-storage',
    }
  )
)
