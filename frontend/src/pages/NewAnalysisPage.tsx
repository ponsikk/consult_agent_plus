import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { useMutation } from '@tanstack/react-query'
import { Upload, X, ImageIcon, AlertCircle, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TypewriterLoader } from '@/components/ui/TypewriterLoader'
import { api } from '@/lib/api'
import { toast } from 'sonner'

const ACCEPTED_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/heic': ['.heic'],
  'image/tiff': ['.tiff', '.tif'],
}

const MAX_FILES = 10
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

interface FilePreview {
  file: File
  preview: string
}

export function NewAnalysisPage() {
  const [files, setFiles] = useState<FilePreview[]>([])
  const [objectName, setObjectName] = useState('')
  const [shotDate, setShotDate] = useState(new Date().toISOString().split('T')[0])
  const navigate = useNavigate()

  const onDrop = useCallback(
    (accepted: File[], rejected: import('react-dropzone').FileRejection[]) => {
      // Show size/type errors for rejected files
      if (rejected.length > 0) {
        const sizeErrors = rejected.filter((r) =>
          r.errors.some((e) => e.code === 'file-too-large')
        )
        const typeErrors = rejected.filter((r) =>
          r.errors.some((e) => e.code === 'file-invalid-type')
        )
        if (sizeErrors.length > 0) {
          toast.error(
            `${sizeErrors.length} файл(а) превышают 10 МБ и не добавлены`
          )
        }
        if (typeErrors.length > 0) {
          toast.error(
            `${typeErrors.length} файл(а) имеют неподдерживаемый формат (нужны JPEG, PNG, HEIC, TIFF)`
          )
        }
      }

      if (accepted.length === 0) return

      const remaining = MAX_FILES - files.length
      if (remaining <= 0) {
        toast.error(`Максимум ${MAX_FILES} файлов`)
        return
      }

      const toAdd = accepted.slice(0, remaining)
      const previews = toAdd.map((f) => ({
        file: f,
        preview: URL.createObjectURL(f),
      }))
      setFiles((prev) => [...prev, ...previews])

      if (accepted.length > remaining) {
        toast.warning(
          `Добавлено ${toAdd.length} из ${accepted.length} файлов (лимит ${MAX_FILES})`
        )
      }
    },
    [files.length]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: MAX_FILES,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
  })

  const removeFile = (index: number) => {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData()
      formData.append('object_name', objectName)
      formData.append('shot_date', shotDate)
      files.forEach((fp) => formData.append('photos', fp.file))
      const { data } = await api.post('/analyses', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onSuccess: (data) => {
      toast.success('Анализ запущен!')
      navigate(`/analyses/${data.id}`)
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { detail?: string } } }
      toast.error(err.response?.data?.detail ?? 'Ошибка запуска анализа')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (files.length === 0) {
      toast.error('Добавьте хотя бы одну фотографию')
      return
    }
    mutation.mutate()
  }

  if (mutation.isPending) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <TypewriterLoader text="Загружаем фотографии..." />
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="font-heading text-3xl font-semibold text-foreground">Новый анализ</h1>
        <p className="text-muted-foreground mt-1">
          Загрузите фотографии объекта для AI-анализа дефектов
        </p>
      </motion.div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Drop zone */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                Фотографии ({files.length}/{MAX_FILES})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Dropzone */}
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-muted/20'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                {isDragActive ? (
                  <p className="text-primary font-medium">Отпустите файлы здесь...</p>
                ) : (
                  <>
                    <p className="text-foreground font-medium">
                      Перетащите фото или нажмите для выбора
                    </p>
                    <p className="text-muted-foreground text-sm mt-1">
                      JPEG, PNG, HEIC, TIFF · до {MAX_FILES} файлов · макс. 10 МБ каждый
                    </p>
                  </>
                )}
              </div>

              {/* Size hint */}
              {files.some((fp) => fp.file.size > MAX_FILE_SIZE * 0.8) && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-yellow-500" />
                  <span>Некоторые файлы близки к лимиту 10 МБ</span>
                </div>
              )}

              {/* Preview grid */}
              {files.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  <AnimatePresence>
                    {files.map((fp, index) => (
                      <motion.div
                        key={fp.preview}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.2 }}
                        className="relative group aspect-square rounded-lg overflow-hidden border border-border"
                      >
                        <img
                          src={fp.preview}
                          alt={fp.file.name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => removeFile(index)}
                            className="p-1 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/80 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 flex items-center justify-between">
                          <p className="text-white text-xs">{index + 1}</p>
                          <p className="text-white/70 text-xs">
                            {(fp.file.size / 1024 / 1024).toFixed(1)}MB
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {/* Empty slots */}
                  {files.length < MAX_FILES &&
                    Array.from({ length: Math.min(2, MAX_FILES - files.length) }).map((_, i) => (
                      <div
                        key={`empty-${i}`}
                        className="aspect-square rounded-lg border-2 border-dashed border-border flex items-center justify-center"
                      >
                        <ImageIcon className="w-6 h-6 text-muted-foreground/30" />
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Metadata */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">Данные объекта</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="objectName">
                  Наименование объекта <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="objectName"
                  placeholder="Жилой дом ул. Ленина 5, кровля"
                  value={objectName}
                  onChange={(e) => setObjectName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shotDate">Дата съёмки</Label>
                <Input
                  id="shotDate"
                  type="date"
                  value={shotDate}
                  onChange={(e) => setShotDate(e.target.value)}
                  required
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Submit */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={mutation.isPending || files.length === 0 || !objectName}
          >
            {mutation.isPending ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Запускаем...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Rocket className="w-5 h-5" />
                Запустить анализ
              </span>
            )}
          </Button>
        </motion.div>
      </form>
    </div>
  )
}
