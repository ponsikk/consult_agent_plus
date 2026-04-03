import { useEffect } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'

export function AppLayout() {
  const { token } = useAuthStore()
  const { theme } = useThemeStore()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <motion.main
        className="flex-1 ml-64 p-8"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Outlet />
      </motion.main>
    </div>
  )
}
