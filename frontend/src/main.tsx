import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AnimateUIProvider } from '@animate-ui/react/provider'
import { ReducedMotionConfig } from '@animate-ui/react/utils/motion'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AnimateUIProvider tempo={0.8} reducedMotion="user">
      <ReducedMotionConfig>
        <App />
      </ReducedMotionConfig>
    </AnimateUIProvider>
  </StrictMode>,
)
