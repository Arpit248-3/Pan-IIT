import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Toaster
      position="top-right"
      richColors
      closeButton
      duration={3500}
      toastOptions={{
        style: {
          fontFamily: 'var(--font-sans, Inter, sans-serif)',
          fontSize: '13px',
        }
      }}
    />
  </StrictMode>,
)
