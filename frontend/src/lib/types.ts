export type AnalysisStatus = 'pending' | 'processing' | 'done' | 'error'

export interface Analysis {
  id: string
  user_id: string
  object_name: string
  shot_date: string
  status: AnalysisStatus
  error_message: string | null
  created_at: string
  completed_at: string | null
  photos?: AnalysisPhoto[]
}

export interface AnalysisPhoto {
  id: string
  analysis_id: string
  original_key: string
  annotated_key: string | null
  order_index: number
  defects?: Defect[]
}

export interface Defect {
  id: string
  photo_id: string
  defect_type_id: string
  criticality: 'critical' | 'significant' | 'minor'
  bbox_x: number
  bbox_y: number
  bbox_w: number
  bbox_h: number
  description: string
  consequences: string
  norm_references: string[]
  recommendations: string
  defect_type?: DefectType
}

export interface DefectType {
  id: string
  code: string
  system: string
  system_name: string
  name: string
  default_criticality: 'critical' | 'significant' | 'minor'
  norm_references: string[]
}

export interface AnalysesList {
  items: Analysis[]
  total: number
  page: number
  per_page: number
  pages: number
}
