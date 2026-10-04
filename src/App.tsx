import { KeyRound } from 'lucide-react'
import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { hasApiKey } from './api'
import Navbar from './components/Navbar'
import Browse from './pages/Browse'
import Home from './pages/Home'
import Israel from './pages/Israel'
import Search from './pages/Search'
import Watch from './pages/Watch'
import NotFound from './pages/NotFound'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <a href="#main" className="skip-link">Skip to content</a>
      <Navbar />
      <main id="main">
        {!hasApiKey && (
          <div className="banner" role="alert">
            <KeyRound size={18} aria-hidden="true" />
            <span>
              Missing TMDB key. Add <code>VITE_TMDB_API_KEY</code> to <code>.env.local</code> and restart the dev server.
            </span>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/movies" element={<Browse type="movie" />} />
          <Route path="/tv" element={<Browse type="tv" />} />
          <Route path="/israel" element={<Israel />} />
          <Route path="/search" element={<Search />} />
          <Route path="/movie/:id" element={<Watch type="movie" />} />
          <Route path="/tv/:id" element={<Watch type="tv" />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="footer">
        <span>Cucuflix</span>
        <span className="muted">Metadata by TMDB. Video is served by third-party players.</span>
      </footer>
    </BrowserRouter>
  )
}
