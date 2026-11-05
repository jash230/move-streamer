import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initAccounts } from './auth'

// Crawler-facing defaults from index.html; each route renders its own via <Seo>.
document.querySelectorAll('head [data-static]').forEach((el) => el.remove())

initAccounts()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
