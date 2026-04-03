import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Download,
  FileText,
  TableIcon,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Image as ImageIcon,
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
import type { Analysis, AnalysisPhoto, Defect } from '@/lib/types'

const CRITICALITY_COLORS = {
  critical: '#ef4444',
  significant: '#f97316',
  minor: '#eab308',
}

const CRITICALITY_LABELS = {
  critical: 'Критический',
  significant: 'Значительный',
  minor: 'Незначительный',
}

async function fetchAnalysis(id: string): Promise<Analysis> {
  const { data } = await api.get(`/analyses/${id}`)
  return data
}

async function fetchStatus(id: string) {
  const { data } = await api.get(`/analyses/${id}/status`)
  return data
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
      >
        <Loader2 className="w-12 h-12 text-primary" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="text-center space-y-2"
      >
        <p className="text-xl font-heading font-semibold text-foreground">
          Анализируем фотографии...
        </p>
        <p className="text-muted-foreground text-sm">
          AI проверяет каждый дефект по нормативам СП/СНиП/ГОСТ
        </p>
      </motion.div>
    </div>
  )
}

function OverallStatus({ analysis }: { analysis: Analysis }) {
  const defects = analysis.photos?.flatMap((p) => p.defects ?? []) ?? []
  const hasCritical = defects.some((d) => d.criticality === 'critical')
  const hasSignificant = defects.some((d) => d.criticality === 'significant')

  let status: 'critical' | 'unsatisfactory' | 'satisfactory'
  if (hasCritical) status = 'critical'
  else if (hasSignificant) status = 'unsatisfactory'
  else status = 'satisfactory'

  const config = {
    critical: {
      icon: XCircle,
      label: 'Критическое состояние',
      className: 'text-red-500',
      bg: 'bg-red-500/10 border-red-500/30',
    },
    unsatisfactory: {
      icon: AlertCircle,
      label: 'Неудовлетворительное состояние',
      className: 'text-orange-500',
      bg: 'bg-orange-500/10 border-orange-500/30',
    },
    satisfactory: {
      icon: CheckCircle2,
      label: 'Удовлетворительное состояние',
      className: 'text-green-500',
      bg: 'bg-green-500/10 border-green-500/30',
    },
  }

  const { icon: Icon, label, className, bg } = config[status]

  return (
    <div className={`rounded-lg border p-4 flex items-center gap-3 ${bg}`}>
      <Icon className={`w-6 h-6 ${className}`} />
      <div>
        <p className={`font-semibold ${className}`}>{label}</p>
        <p className="text-sm text-muted-foreground">
          Дефектов найдено: {defects.length} (критических:{' '}
          {defects.filter((d) => d.criticality === 'critical').length})
        </p>
      </div>
    </div>
  )
}

function PhotoCanvas({
  photo,
  hoveredDefect,
  onHoverDefect,
}: {
  photo: AnalysisPhoto
  hoveredDefect: string | null
  onHoverDefect: (id: string | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)

  const imageUrl = photo.annotated_key
    ? `http://localhost:8000/api/v1/analyses/${photo.analysis_id}/photos/${photo.id}/annotated`
    : `http://localhost:8000/api/v1/analyses/${photo.analysis_id}/photos/${photo.id}/original`

  const drawBoxes = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !imgLoaded) return

    const { naturalWidth, naturalHeight } = img
    const { width, height } = img.getBoundingClientRect()

    canvas.width = width
    canvas.height = height

    const scaleX = width / naturalWidth
    const scaleY = height / naturalHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)

    const defects = photo.defects ?? []
    defects.forEach((d) => {
      const x = d.bbox_x * naturalWidth * scaleX
      const y = d.bbox_y * naturalHeight * scaleY
      const w = d.bbox_w * naturalWidth * scaleX
      const h = d.bbox_h * naturalHeight * scaleY

      const color = CRITICALITY_COLORS[d.criticality]
      ctx.strokeStyle = color
      ctx.lineWidth = d.id === hoveredDefect ? 3 : 2
      ctx.fillStyle = `${color}22`
      ctx.fillRect(x, y, w, h)
      ctx.strokeRect(x, y, w, h)

      // Label
      const label = d.defect_type?.name ?? d.criticality
      ctx.font = '11px Manrope, sans-serif'
      const textW = ctx.measureText(label).width
      ctx.fillStyle = color
      ctx.fillRect(x, y - 16, textW + 8, 16)
      ctx.fillStyle = '#fff'
      ctx.fillText(label, x + 4, y - 3)
    })
  }, [photo, imgLoaded, hoveredDefect])

  useEffect(() => {
    drawBoxes()
  }, [drawBoxes])

  useEffect(() => {
    const handleResize = () => drawBoxes()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [drawBoxes])

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return

    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const { naturalWidth, naturalHeight, width, height } = img as HTMLImageElement & { width: number; height: number }
    const bRect = img.getBoundingClientRect()
    const scaleX = bRect.width / naturalWidth
    const scaleY = bRect.height / naturalHeight

    const defects = photo.defects ?? []
    const hit = defects.find((d) => {
      const x = d.bbox_x * naturalWidth * scaleX
      const y = d.bbox_y * naturalHeight * scaleY
      const w = d.bbox_w * naturalWidth * scaleX
      const h = d.bbox_h * naturalHeight * scaleY
      return mx >= x && mx <= x + w && my >= y && my <= y + h
    })

    if (hit) {
      onHoverDefect(hit.id)
      const label = `${hit.defect_type?.name ?? hit.criticality} · ${CRITICALITY_LABELS[hit.criticality]}`
      setTooltip({ x: mx, y: my, text: label })
    } else {
      onHoverDefect(null)
      setTooltip(null)
    }

    // suppress unused
    void naturalWidth; void naturalHeight; void width; void height
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <img
        ref={imgRef}
        src={imageUrl}
        alt="analysis photo"
        className="w-full rounded-lg"
        onLoad={() => setImgLoaded(true)}
        style={{ display: 'block' }}
      />
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { onHoverDefect(null); setTooltip(null) }}
        className="absolute inset-0 w-full h-full cursor-crosshair"
        style={{ pointerEvents: 'all' }}
      />
      {tooltip && (
        <div
          className="absolute z-10 bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-lg pointer-events-none border border-border"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  )
}

function DefectTable({ defects, hoveredId, onHover }: {
  defects: Defect[]
  hoveredId: string | null
  onHover: (id: string | null) => void
}) {
  if (defects.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Дефектов не обнаружено
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Тип дефекта</TableHead>
          <TableHead>Критичность</TableHead>
          <TableHead>Норматив</TableHead>
          <TableHead>Рекомендации</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {defects.map((d) => (
          <TableRow
            key={d.id}
            onMouseEnter={() => onHover(d.id)}
            onMouseLeave={() => onHover(null)}
            className={`cursor-pointer transition-colors ${d.id === hoveredId ? 'bg-muted/50' : ''}`}
          >
            <TableCell className="font-medium">
              {d.defect_type?.name ?? '—'}
            </TableCell>
            <TableCell>
              <Badge
                className={
                  d.criticality === 'critical'
                    ? 'bg-red-500/20 text-red-400'
                    : d.criticality === 'significant'
                    ? 'bg-orange-500/20 text-orange-400'
                    : 'bg-yellow-500/20 text-yellow-400'
                }
              >
                {CRITICALITY_LABELS[d.criticality]}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {d.norm_references?.join(', ') ?? '—'}
            </TableCell>
            <TableCell className="text-sm max-w-xs truncate">
              {d.recommendations}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function AnalysisResultPage() {
  const { id } = useParams<{ id: string }>()
  const [selectedPhoto, setSelectedPhoto] = useState<AnalysisPhoto | null>(null)
  const [hoveredDefect, setHoveredDefect] = useState<string | null>(null)

  const { data: status } = useQuery({
    queryKey: ['analysis-status', id],
    queryFn: () => fetchStatus(id!),
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'pending' || s === 'processing' ? 3000 : false
    },
    enabled: !!id,
  })

  const { data: analysis } = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => fetchAnalysis(id!),
    enabled: status?.status === 'done' || status?.status === 'error',
  })

  useEffect(() => {
    if (analysis?.photos && analysis.photos.length > 0 && !selectedPhoto) {
      setSelectedPhoto(analysis.photos[0])
    }
  }, [analysis, selectedPhoto])

  const handleDownload = async (format: 'pdf' | 'excel') => {
    const ext = format === 'pdf' ? 'pdf' : 'xlsx'
    const { data } = await api.get(`/analyses/${id}/report/${format}`, {
      responseType: 'blob',
    })
    const url = URL.createObjectURL(new Blob([data]))
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${id}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!status || status.status === 'pending' || status.status === 'processing') {
    return <LoadingState />
  }

  if (status.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <XCircle className="w-12 h-12 text-destructive" />
        <p className="text-xl font-heading font-semibold">Ошибка анализа</p>
        <p className="text-muted-foreground text-sm">{analysis?.error_message ?? 'Неизвестная ошибка'}</p>
      </div>
    )
  }

  if (!analysis) return <LoadingState />

  const currentDefects = selectedPhoto?.defects ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between flex-wrap gap-4"
      >
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            {analysis.object_name}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Дата съёмки: {analysis.shot_date}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleDownload('pdf')}>
            <FileText className="w-4 h-4 mr-2" />
            Скачать PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleDownload('excel')}>
            <TableIcon className="w-4 h-4 mr-2" />
            Скачать Excel
          </Button>
        </div>
      </motion.div>

      {/* Overall status */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
        <OverallStatus analysis={analysis} />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">
        {/* Photo list */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 }}
          className="space-y-2"
        >
          {(analysis.photos ?? []).map((photo) => {
            const defectCount = photo.defects?.length ?? 0
            const hasCritical = photo.defects?.some((d) => d.criticality === 'critical')
            return (
              <button
                key={photo.id}
                onClick={() => setSelectedPhoto(photo)}
                className={`w-full text-left rounded-lg border p-2 transition-all ${
                  selectedPhoto?.id === photo.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate">Фото {photo.order_index + 1}</span>
                  {defectCount > 0 && (
                    <Badge
                      className={`ml-auto text-xs ${hasCritical ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'}`}
                    >
                      {defectCount}
                    </Badge>
                  )}
                </div>
              </button>
            )
          })}
        </motion.div>

        {/* Photo + defects */}
        <div className="space-y-6">
          <AnimatePresence mode="wait">
            {selectedPhoto && (
              <motion.div
                key={selectedPhoto.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardContent className="pt-4">
                    <PhotoCanvas
                      photo={selectedPhoto}
                      hoveredDefect={hoveredDefect}
                      onHoverDefect={setHoveredDefect}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="font-heading text-base flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      Дефекты на фото ({currentDefects.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DefectTable
                      defects={currentDefects}
                      hoveredId={hoveredDefect}
                      onHover={setHoveredDefect}
                    />
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
