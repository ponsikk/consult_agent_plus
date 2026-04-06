import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  TableIcon,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Image as ImageIcon,
  ChevronDown,
} from 'lucide-react'
import { TypewriterLoader } from '@/components/ui/TypewriterLoader'
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
      <TypewriterLoader text="Анализируем фотографии..." />
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="text-muted-foreground text-sm text-center"
      >
        AI проверяет каждый дефект по нормативам СП/СНиП/ГОСТ
      </motion.p>
    </div>
  )
}

function CompactStatus({ analysis }: { analysis: Analysis }) {
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
      className: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/30',
    },
    unsatisfactory: {
      icon: AlertCircle,
      label: 'Неудовлетворительное',
      className: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 border-orange-200 dark:bg-orange-500/10 dark:border-orange-500/30',
    },
    satisfactory: {
      icon: CheckCircle2,
      label: 'Удовлетворительное',
      className: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 border-green-200 dark:bg-green-500/10 dark:border-green-500/30',
    },
  }

  const { icon: Icon, label, className, bg } = config[status]

  return (
    <div className={`rounded-lg border px-3 py-2 flex items-center gap-2 shrink-0 ${bg}`}>
      <Icon className={`w-4 h-4 ${className}`} />
      <span className={`text-sm font-medium ${className}`}>{label}</span>
      <span className="text-xs text-muted-foreground ml-1">{defects.length} дефектов</span>
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

  const getRenderedRect = useCallback(() => {
    const img = imgRef.current
    if (!img || !imgLoaded) return null
    const { naturalWidth, naturalHeight } = img
    const elemW = img.clientWidth
    const elemH = img.clientHeight
    if (!elemW || !elemH) return null
    const naturalAspect = naturalWidth / naturalHeight
    const elemAspect = elemW / elemH
    let renderedW: number, renderedH: number
    if (elemAspect > naturalAspect) {
      renderedH = elemH
      renderedW = elemH * naturalAspect
    } else {
      renderedW = elemW
      renderedH = elemW / naturalAspect
    }
    const offsetX = (elemW - renderedW) / 2
    const offsetY = (elemH - renderedH) / 2
    return { renderedW, renderedH, offsetX, offsetY, naturalWidth, naturalHeight }
  }, [imgLoaded])

  const drawBoxes = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !imgLoaded) return
    const r = getRenderedRect()
    if (!r) return
    const { renderedW, renderedH, offsetX, offsetY, naturalWidth, naturalHeight } = r

    canvas.width = renderedW
    canvas.height = renderedH
    canvas.style.left = `${offsetX}px`
    canvas.style.top = `${offsetY}px`
    canvas.style.width = `${renderedW}px`
    canvas.style.height = `${renderedH}px`

    const scaleX = renderedW / naturalWidth
    const scaleY = renderedH / naturalHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, renderedW, renderedH)

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

      const label = d.defect_type?.name ?? d.criticality
      ctx.font = '11px Manrope, sans-serif'
      const textW = ctx.measureText(label).width
      const labelX = Math.max(0, x)
      const labelY = Math.max(16, y)
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(labelX, labelY - 16, textW + 8, 16)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(label, labelX + 4, labelY - 4)
    })
  }, [photo, imgLoaded, hoveredDefect, getRenderedRect])

  useEffect(() => { drawBoxes() }, [drawBoxes])

  useEffect(() => {
    const handleResize = () => drawBoxes()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [drawBoxes])

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const r = getRenderedRect()
    if (!r) return
    const { renderedW, renderedH, naturalWidth, naturalHeight } = r

    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const scaleX = renderedW / naturalWidth
    const scaleY = renderedH / naturalHeight

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
  }

  return (
    <div ref={containerRef} className="relative w-full rounded-lg overflow-hidden bg-muted/10 flex items-center justify-center min-h-[120px]">
      <img
        ref={imgRef}
        src={imageUrl}
        alt="analysis photo"
        className="w-full max-h-[450px] object-contain rounded-lg block"
        onLoad={() => setImgLoaded(true)}
      />
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { onHoverDefect(null); setTooltip(null) }}
        className="absolute cursor-crosshair"
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

function DefectTable({
  defects,
  hoveredId,
  onHover,
}: {
  defects: Defect[]
  hoveredId: string | null
  onHover: (id: string | null) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (defects.length === 0) {
    return <p className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">Дефектов не обнаружено</p>
  }

  return (
    <div className="overflow-hidden border border-border rounded-lg">
      <Table className="table-fixed w-full">
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead className="w-[50%]">Тип дефекта</TableHead>
            <TableHead className="w-[20%]">Критичность</TableHead>
            <TableHead className="w-[30%]">Норматив</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {defects.map((d) => {
            const isExpanded = expandedId === d.id
            const norms = d.norm_references ?? []
            const firstNorm = norms[0]
            const extraNormsCount = norms.length - 1

            return (
              <React.Fragment key={d.id}>
                <TableRow
                  onMouseEnter={() => onHover(d.id)}
                  onMouseLeave={() => onHover(null)}
                  onClick={() => setExpandedId(isExpanded ? null : d.id)}
                  className={`cursor-pointer transition-colors ${d.id === hoveredId ? 'bg-muted/50' : 'hover:bg-muted/30'}`}
                >
                  <TableCell className="py-2.5 px-3 text-sm font-medium align-middle">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate" title={d.defect_type?.name ?? 'Не указано'}>
                        {d.defect_type?.name ? d.defect_type.name : <span className="text-muted-foreground">Не указано</span>}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5 px-3 align-middle">
                    <Badge
                      variant="outline"
                      className={`text-xs whitespace-nowrap ${
                        d.criticality === 'critical'
                          ? 'badge-critical'
                          : d.criticality === 'significant'
                          ? 'badge-significant'
                          : 'badge-minor'
                      }`}
                    >
                      {CRITICALITY_LABELS[d.criticality]}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2.5 px-3 text-xs text-muted-foreground align-middle">
                    {norms.length === 0 ? (
                      <span className="text-muted-foreground/60">Не указано</span>
                    ) : (
                      <span className="flex items-center gap-1 flex-wrap">
                        <span className="truncate max-w-[100px]" title={firstNorm}>{firstNorm}</span>
                        {extraNormsCount > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                            +{extraNormsCount} ещё
                          </Badge>
                        )}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow className="bg-muted/10 hover:bg-muted/10">
                    <TableCell colSpan={3} className="p-0 border-b">
                      <AnimatePresence>
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4 space-y-4 text-sm">
                            {d.description && (
                              <div>
                                <p className="text-xs font-semibold uppercase text-muted-foreground mb-1 tracking-wider">Описание проблемы</p>
                                <p className="text-foreground whitespace-normal break-words">{d.description}</p>
                              </div>
                            )}
                            {d.recommendations && (
                              <div>
                                <p className="text-xs font-semibold uppercase text-muted-foreground mb-1 tracking-wider">Рекомендации по устранению</p>
                                <p className="text-foreground whitespace-normal break-words">{d.recommendations}</p>
                              </div>
                            )}
                            {norms.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold uppercase text-muted-foreground mb-1 tracking-wider">Все нормативы</p>
                                <ul className="list-disc list-inside pl-4 text-muted-foreground space-y-0.5">
                                  {norms.map((norm, idx) => (
                                    <li key={idx}>{norm}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      </AnimatePresence>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

export function AnalysisResultPage() {
  const { id } = useParams()
  const [selectedPhoto, setSelectedPhoto] = useState<AnalysisPhoto | null>(null)
  const [hoveredDefect, setHoveredDefect] = useState<string | null>(null)

  const { data: statusData } = useQuery({
    queryKey: ['analysis-status', id],
    queryFn: () => fetchStatus(id as string),
    refetchInterval: (query) => {
      const state = query.state.data?.status
      if (state === 'pending' || state === 'processing') return 3000
      return false
    },
    enabled: !!id,
  })

  const { data: analysis } = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => fetchAnalysis(id as string),
    enabled: statusData?.status === 'done' || statusData?.status === 'error',
  })

  useEffect(() => {
    if (analysis?.photos && analysis.photos.length > 0 && !selectedPhoto) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPhoto(analysis.photos[0])
    }
  }, [analysis, selectedPhoto])

  const handleDownload = async (type: 'pdf' | 'excel') => {
    const ext = type === 'pdf' ? 'pdf' : 'xlsx'
    const { data } = await api.get(`/analyses/${id}/report/${type}`, { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([data]))
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${id}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!statusData || statusData.status === 'pending' || statusData.status === 'processing') {
    return <LoadingState />
  }

  if (statusData.status === 'error') {
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
      {/* === ВЕРХ СТРАНИЦЫ === */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-4"
      >
        <div className="flex items-center gap-4">
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            {analysis.object_name}
          </h1>
          <span className="text-muted-foreground text-sm border-l pl-4 border-border">
            {analysis.shot_date}
          </span>
        </div>
        <CompactStatus analysis={analysis} />
      </motion.div>

      {/* === ОСНОВНОЙ LAYOUT === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        
        {/* ЛЕВАЯ КОЛОНКА — фото с canvas */}
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
          {/* Tabs */}
          <div className="flex gap-2 flex-wrap">
            {(analysis.photos ?? []).map((photo) => {
              const defectCount = photo.defects?.length ?? 0
              const hasCritical = photo.defects?.some((d) => d.criticality === 'critical')
              return (
                <button
                  key={photo.id}
                  onClick={() => setSelectedPhoto(photo)}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-all ${
                    selectedPhoto?.id === photo.id
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border hover:border-primary/40 text-muted-foreground bg-card'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Фото {photo.order_index + 1}
                  {defectCount > 0 && (
                    <span className={`ml-1 font-semibold ${hasCritical ? 'text-red-500' : 'text-orange-500'}`}>
                      ({defectCount})
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <AnimatePresence mode="wait">
                {selectedPhoto ? (
                  <motion.div
                    key={selectedPhoto.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <PhotoCanvas
                      photo={selectedPhoto}
                      hoveredDefect={hoveredDefect}
                      onHoverDefect={setHoveredDefect}
                    />
                  </motion.div>
                ) : (
                  <div className="min-h-[300px] flex items-center justify-center text-muted-foreground">
                    Выберите фото для просмотра
                  </div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>

        {/* ПРАВАЯ КОЛОНКА — таблица дефектов */}
        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="font-heading text-lg">
                Дефекты ({currentDefects.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <DefectTable
                defects={currentDefects}
                hoveredId={hoveredDefect}
                onHover={setHoveredDefect}
              />
            </CardContent>
          </Card>
        </motion.div>

      </div>

      {/* === НИЗ СТРАНИЦЫ === */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex gap-3 justify-end pt-4"
      >
        <Button variant="outline" onClick={() => handleDownload('pdf')}>
          <FileText className="w-4 h-4 mr-2" />
          Скачать PDF
        </Button>
        <Button variant="outline" onClick={() => handleDownload('excel')}>
          <TableIcon className="w-4 h-4 mr-2" />
          Скачать Excel
        </Button>
      </motion.div>
    </div>
  )
}
