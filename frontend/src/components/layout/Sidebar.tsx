import { NavLink, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutDashboard, Plus, BookOpen, LogOut, Sun, Moon } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/analyses/new', icon: Plus, label: 'Новый анализ' },
  { to: '/catalog', icon: BookOpen, label: 'Справочник дефектов' },
]

export function Sidebar({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean } = {}) {
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <motion.aside
      initial={{ x: -260 }}
      animate={{ x: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed left-0 top-0 h-full w-64 bg-sidebar border-r border-sidebar-border flex flex-col z-40"
    >
      {/* Logo */}
      <div className="p-6 flex items-center gap-3">
        <img src="/UTNKR_RGB_01.1.svg" alt="UTNKR" className="h-8 w-auto flex-shrink-0" />
        {!collapsed && (
          <>
            <div className="w-px h-5 bg-sidebar-border flex-shrink-0" />
            <span
              className="text-sidebar-foreground flex-shrink-0"
              style={{
                fontFamily: "'Oswald', sans-serif",
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                lineHeight: 1,
                fontSize: 'clamp(18px, 3vw, 26px)',
              }}
            >
              ИНСПЕКТОР
            </span>
          </>
        )}
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* Bottom section */}
      <div className="p-4 space-y-3">
        {/* User info */}
        {user && (
          <div className="px-3 py-2">
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            <p className="text-sm font-medium text-sidebar-foreground truncate">{user.full_name}</p>
          </div>
        )}

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        </Button>

        {/* Logout */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-destructive hover:text-destructive-foreground"
        >
          <LogOut className="w-4 h-4" />
          Выйти
        </Button>
      </div>
    </motion.aside>
  )
}
