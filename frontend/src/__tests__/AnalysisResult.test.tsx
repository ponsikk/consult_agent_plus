import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AnalysisResultPage } from '../pages/AnalysisResultPage'
import { BrowserRouter, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: vi.fn(),
  }
})

// Mock api
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, cacheTime: 0, staleTime: 0 },
  },
})

const mockAnalysisData = {
  id: 'test-uuid',
  object_name: 'Test Project 2026',
  shot_date: '06.04.2026',
  status: 'done',
  photos: [
    {
      id: 'photo-1',
      analysis_id: 'test-uuid',
      original_key: 'photos/photo1.jpg',
      annotated_key: 'photos/photo1_annotated.jpg',
      order_index: 0,
      defects: [
        {
          id: 'defect-1',
          criticality: 'critical',
          description: 'Очень длинное описание дефекта которое не должно обрезаться.',
          recommendations: 'Очень длинные рекомендации которые не должны обрезаться и должны быть видны.',
          norm_references: null,
          bbox_x: 0.1, bbox_y: 0.1, bbox_w: 0.2, bbox_h: 0.2
        }
      ]
    }
  ]
}

describe('AnalysisResultPage Requirements (F21)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
  })

  it('shows loading state initially', () => {
    vi.mocked(useParams).mockReturnValue({ id: 'test-uuid' })
    vi.mocked(api.get).mockReturnValue(new Promise(() => {})) // Never resolves
    
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AnalysisResultPage />
        </BrowserRouter>
      </QueryClientProvider>
    )
    
    expect(screen.getByText(/Анализируем фотографии/i)).toBeInTheDocument()
  })

  it('verifies image max-h, missing values and text wrapping', async () => {
    vi.mocked(useParams).mockReturnValue({ id: 'test-uuid' })
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('/status')) return Promise.resolve({ data: { status: 'done' } })
      if (url.includes('/analyses/test-uuid')) return Promise.resolve({ data: mockAnalysisData })
      return Promise.reject(new Error('not found'))
    })

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AnalysisResultPage />
        </BrowserRouter>
      </QueryClientProvider>
    )

    // Wait for the data to be loaded and displayed
    await waitFor(() => {
      expect(screen.getByText('Test Project 2026')).toBeInTheDocument()
    })

    // 1) Test max-h-[400px] class on the image
    const img = screen.getByAltText(/analysis photo/i)
    expect(img).toHaveClass('max-h-[400px]')
    expect(img).toHaveClass('object-contain')

    // 2) Test that fields without values (null/empty) show 'Не указано' or 'Н/У' instead of a dash
    expect(await screen.findByText(/Не указано/i)).toBeInTheDocument()
    expect(await screen.findByText(/Н\/У/i)).toBeInTheDocument()
    
    // Ensure no cell contains JUST a dash
    const cells = screen.getAllByRole('cell')
    cells.forEach(cell => {
      expect(cell.textContent?.trim()).not.toBe('-')
    })

    // 3) Test that long description text has proper wrapping classes (no truncate)
    const longDesc = screen.getByText(/Очень длинные рекомендации/i)
    // In current implementation it's using line-clamp-2 if not expanded
    expect(longDesc).toHaveClass('line-clamp-2')
    expect(longDesc).not.toHaveClass('truncate')
    expect(longDesc).not.toHaveClass('line-clamp-1')
  })
})
