import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import {
  BarChart3,
  Clock,
  AlertTriangle,
  Loader2,
  Eye,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import type { AnalysesList, Analysis, AnalysisStatus } from '@/lib/types'

const PER_PAGE = 20

async function fetchAnalyses(page: number, perPage: number): Promise<AnalysesList> {
  const { data } = await api.get('/analyses', { params: { page, per_page: perPage } })
  return data
}

interface AnalysesStats {
  total: number
  processed_today: number
  critical_defects: number
  in_progress: number
}

async function fetchStats(): Promise<AnalysesStats> {
  const { data } = await api.get('/analyses/stats')
  return data
}

function StatusBadge({ status }: { status: AnalysisStatus }) {
  const config: Record<AnalysisStatus, { label: string; className: string }> = {
    pending: { label: 'Ожидает', className: 'bg-muted text-muted-foreground' },
    uploading: { label: 'Загрузка', className: 'bg-muted text-muted-foreground' },
    processing: {
      label: 'Обрабатывается',
      className: 'bg-blue-500/20 text-blue-400 animate-pulse',
    },
    done: { label: 'Готово', className: 'bg-green-500/20 text-green-400' },
    error: { label: 'Ошибка', className: 'bg-destructive/20 text-destructive' },
  }
  const { label, className } = config[status] ?? config.pending
  return <Badge className={className}>{label}</Badge>
}

function KpiCard({
  title,
  value,
  icon: Icon,
  delay,
  loading,
}: {
  title: string
  value: number | string
  icon: React.ElementType
  delay: number
  loading?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <Icon className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-9 w-16" />
          ) : (
            <p className="text-3xl font-bold text-foreground font-heading">{value}</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 items-center">
          <Skeleton className="h-5 flex-1" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)

  // Table query — paginated
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analyses', page],
    queryFn: () => fetchAnalyses(page, PER_PAGE),
    refetchInterval: 10_000,
  })

  // Stats query — dedicated endpoint /analyses/stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['analyses-stats'],
    queryFn: fetchStats,
    refetchInterval: 30_000,
  })

  const analyses = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.pages ?? 1

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="font-heading text-3xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Обзор результатов технического надзора</p>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Всего анализов" value={stats?.total ?? 0} icon={BarChart3} delay={0.05} loading={statsLoading} />
        <KpiCard title="Обработано сегодня" value={stats?.processed_today ?? 0} icon={Clock} delay={0.1} loading={statsLoading} />
        <KpiCard title="Критических дефектов" value={stats?.critical_defects ?? 0} icon={AlertTriangle} delay={0.15} loading={statsLoading} />
        <KpiCard title="В обработке" value={stats?.in_progress ?? 0} icon={Loader2} delay={0.2} loading={statsLoading} />
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">Анализы</CardTitle>
          </CardHeader>
          <CardContent>
            {isError ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3 text-destructive">
                <AlertCircle className="w-8 h-8" />
                <p className="text-sm">Не удалось загрузить анализы. Проверьте подключение.</p>
                <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                  Повторить
                </Button>
              </div>
            ) : isLoading ? (
              <TableSkeleton />
            ) : analyses.length === 0 ? (
              <EmptyState onNew={() => navigate('/analyses/new')} />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Объект</TableHead>
                      <TableHead>Дата съёмки</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Создан</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analyses.map((analysis: Analysis) => (
                      <TableRow key={analysis.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-medium">{analysis.object_name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(analysis.shot_date), 'dd MMM yyyy', { locale: ru })}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={analysis.status} />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(analysis.created_at), 'dd.MM.yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/analyses/${analysis.id}`)}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Открыть
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground">
                      Страница {page} из {totalPages} · Всего {total}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Назад
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >
                        Вперёд
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <FolderOpen className="w-12 h-12 text-muted-foreground" />
      <p className="text-muted-foreground text-center">Анализов пока нет. Создайте первый!</p>
      <Button onClick={onNew}>Новый анализ</Button>
    </div>
  )
}
