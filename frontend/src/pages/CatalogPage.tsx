import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Search, BookOpen, Loader2 } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import type { DefectType } from '@/lib/types'

const SYSTEM_LABELS: Record<string, string> = {
  roof_flat: 'Кровля плоская',
  roof_slate: 'Кровля шиферная',
  facades: 'Фасады',
  water_supply: 'Водоснабжение',
  heat_supply: 'Теплоснабжение',
}

const CRITICALITY_CONFIG = {
  critical: { label: 'Критический', className: 'badge-critical whitespace-nowrap shrink-0' },
  significant: { label: 'Значительный', className: 'badge-significant whitespace-nowrap shrink-0' },
  minor: { label: 'Незначительный', className: 'badge-minor whitespace-nowrap shrink-0' },
}

async function fetchCatalog(): Promise<DefectType[]> {
  const { data } = await api.get('/defects/catalog')
  return data
}

export function CatalogPage() {
  const [search, setSearch] = useState('')

  const { data: defects = [], isLoading } = useQuery({
    queryKey: ['defects-catalog'],
    queryFn: fetchCatalog,
  })

  const filtered = defects.filter(
    (d) =>
      search === '' ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.code.toLowerCase().includes(search.toLowerCase())
  )

  // Group by system
  const bySystem = filtered.reduce<Record<string, DefectType[]>>((acc, d) => {
    if (!acc[d.system]) acc[d.system] = []
    acc[d.system].push(d)
    return acc
  }, {})

  const systems = Object.keys(SYSTEM_LABELS).filter((s) => bySystem[s]?.length > 0)

  return (
    <div className="w-full space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="font-heading text-3xl font-semibold text-foreground">Справочник дефектов</h1>
        <p className="text-muted-foreground mt-1">
          {defects.length} дефектов по {Object.keys(SYSTEM_LABELS).length} системам
        </p>
      </motion.div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="relative"
      >
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Поиск по названию или коду..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </motion.div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <BookOpen className="w-12 h-12 text-muted-foreground" />
          <p className="text-muted-foreground">Ничего не найдено по запросу «{search}»</p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Accordion type="multiple" defaultValue={systems} className="space-y-2">
            {systems.map((system, sIdx) => (
              <motion.div
                key={system}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 * sIdx }}
              >
                <AccordionItem value={system} className="border border-border rounded-lg bg-card">
                  <AccordionTrigger className="font-heading text-lg px-4 py-4 hover:no-underline flex items-center justify-between w-full">
                    <span className="flex items-center gap-3">
                      {SYSTEM_LABELS[system]}
                      <Badge variant="secondary">{bySystem[system].length}</Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 pt-3 pb-4">
                      {bySystem[system].map((defect) => (
                        <DefectCard key={defect.id} defect={defect} />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </motion.div>
            ))}
          </Accordion>
        </motion.div>
      )}
    </div>
  )
}

function DefectCard({ defect }: { defect: DefectType }) {
  const crit = CRITICALITY_CONFIG[defect.default_criticality]

  return (
    <div className="rounded-md bg-muted/40 p-3 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground break-words">{defect.name}</p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{defect.code}</p>
        </div>
        <Badge variant="outline" className={crit.className}>{crit.label}</Badge>
      </div>

      {defect.norm_references && defect.norm_references.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Нормативы</p>
          <div className="flex flex-wrap gap-1">
            {defect.norm_references.map((ref) => (
              <Badge key={ref} variant="secondary" className="text-xs">
                {ref}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
