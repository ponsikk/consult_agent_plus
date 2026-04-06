import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { api } from '@/lib/api'
import { toast } from 'sonner'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, token } = useAuthStore()
  const { theme } = useThemeStore()
  const navigate = useNavigate()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  if (token) {
    navigate('/', { replace: true })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.post('/auth/login', { email, password })
      const meRes = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${res.data.access_token}` },
      })
      login(meRes.data, res.data.access_token)
      navigate('/')
    } catch {
      toast.error('Неверный email или пароль')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <img src="/UTNKR_RGB_01.1.svg" alt="UTNKR" className="h-12 w-auto flex-shrink-0" />
            <div className="w-px h-6 bg-border flex-shrink-0" />
            <span
              className="text-foreground flex-shrink-0"
              style={{
                fontFamily: "'Oswald', sans-serif",
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                lineHeight: 1,
                fontSize: '28px',
              }}
            >
              ИНСПЕКТОР
            </span>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="font-heading text-2xl text-center">Вход</CardTitle>
            <CardDescription className="text-center">
              Войдите в систему технадзора
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="inspector@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Пароль</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Вход...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <LogIn className="w-4 h-4" />
                    Войти
                  </span>
                )}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Нет аккаунта?{' '}
              <Link to="/register" className="text-primary hover:underline font-medium">
                Регистрация
              </Link>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
