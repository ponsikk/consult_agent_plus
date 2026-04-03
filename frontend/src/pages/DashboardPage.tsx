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
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

async function fetchAnalyses(page = 1): Promise<AnalysesList> {
  const { data } = await api.get('/analyses', { params: { page, per_page: 20 } })
  return data
}

function StatusBadge({ status }: { status: AnalysisStatus }) {
  const config = {
    pending: { label: 'Ожидает', className: 'bg-muted text-muted-foreground' },
    processing: {
      label: 'Обрабатывается',
      className: 'bg-blue-500/20 text-blue-400 animate-pulse',
    },
    done: { label: 'Готово', className: 'bg-green-500/20 text-green-400' },
    error: { label: 'Ошибка', className: 'bg-destructive/20 text-destructive' },
  }
  const { label, className } = config[status]
  return <Badge className={className}>{label}</Badge>
}

function KpiCard({
  title,
  value,
  icon: Icon,
  delay,
}: {
  title: string
  value: number | string
  icon: React.ElementType
  delay: number
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
          <p className="text-3xl font-bold text-foreground font-heading">{value}</p>
        </CardContent>
      </Card>
    </motion.div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['analyses'],
    queryFn: () => fetchAnalyses(),
    refetchInterval: 10_000,
  })

  const analyses = data?.items ?? []
  const total = data?.total ?? 0

  const today = new Date().toISOString().split('T')[0]
  const doneToday = analyses.filter(
    (a) => a.status === 'done' && a.completed_at?.startsWith(today)
  ).length
  const inProcessing = analyses.filter((a) => a.status === 'processing').length
  const criticalDefects = 0 // будет считаться когда будут данные по дефектам

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
        <KpiCard title="Всего анализов" value={total} icon={BarChart3} delay={0.05} />
        <KpiCard title="Обработано сегодня" value={doneToday} icon={Clock} delay={0.1} />
        <KpiCard title="Критических дефектов" value={criticalDefects} icon={AlertTriangle} delay={0.15} />
        <KpiCard title="В обработке" value={inProcessing} icon={Loader2} delay={0.2} />
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
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : analyses.length === 0 ? (
              <EmptyState onNew={() => navigate('/analyses/new')} />
            ) : (
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
      <p className="text-muted-foreground text-center">
        Анализов пока нет. Создайте первый!
      </p>
      <Button onClick={onNew}>Новый анализ</Button>
    </div>
  )
}
