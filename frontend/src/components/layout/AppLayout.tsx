import { useState, useEffect } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'

export function AppLayout() {
  const { token } = useAuthStore()
  const { theme } = useThemeStore()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile hamburger */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMobileSidebarOpen(true)}
          className="bg-card border-border"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 bg-black/50 z-40"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="lg:hidden fixed left-0 top-0 h-full z-50"
            >
              <Sidebar onNavigate={() => setMobileSidebarOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <motion.main
        className="flex-1 lg:ml-64 p-6 lg:p-8 pt-16 lg:pt-8"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Outlet />
      </motion.main>
    </div>
  )
}
