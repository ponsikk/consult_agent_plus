import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AnalysisResultPage } from '../pages/AnalysisResultPage'
import { BrowserRouter, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: vi.fn(),
  }
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
})

describe('AnalysisResultPage', () => {
  it('shows loading state initially', () => {
    vi.mocked(useParams).mockReturnValue({ id: 'test-uuid' })
    
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AnalysisResultPage />
        </BrowserRouter>
      </QueryClientProvider>
    )
    
    expect(screen.getByText(/Анализируем фотографии/i)).toBeInTheDocument()
  })

  // More complex tests would require mocking MSW (Mock Service Worker) 
  // to intercept API calls and return sample Analysis data
  it('renders overall status when data is loaded', async () => {
    // Mock API data would go here
  })
})
