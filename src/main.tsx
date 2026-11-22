import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initAccounts } from './auth'

// Crawler-facing defaults from index.html; each route renders its own via <Seo>.
document.querySelectorAll('head [data-static]').forEach((el) => el.remove())

// After a deploy, an open tab still asks for the old lazy chunks (e.g. the dashboard), which no
// longer exist, and the page stays blank. Reload once to pick up the new build.
window.addEventListener('vite:preloadError', (e) => {
  if (sessionStorage.getItem('reloaded-for-chunk')) return
  e.preventDefault()
  sessionStorage.setItem('reloaded-for-chunk', '1')
  location.reload()
})

initAccounts()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
