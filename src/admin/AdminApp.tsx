import { ClerkLoading, ClerkProvider, Show, SignIn, UserButton } from '@clerk/react'
import { Activity, Clapperboard, Footprints, Gauge, MessageSquareText, Users } from 'lucide-react'
import { NavLink, Route, Routes, useLocation, useSearchParams } from 'react-router-dom'
import Seo from '../components/Seo'
import Audience from './pages/Audience'
import Journey from './pages/Journey'
import Overview from './pages/Overview'
import Playback from './pages/Playback'
import ReviewsPage from './pages/Reviews'
import Visitors from './pages/Visitors'
import Watching from './pages/Watching'
import { RANGES, useRange } from './useReport'
import './admin.css'

// Clerk's dashboard names the key NEXT_PUBLIC_…; either name works.
const KEY = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) as string | undefined

// Clerk's own screens, dressed in the screening-room palette.
const appearance = {
  variables: {
    colorPrimary: '#e11d48',
    colorBackground: '#141217',
    colorForeground: '#f4efe8',
    colorMutedForeground: '#a9a2ae',
    colorInput: '#1e1b22',
    colorInputForeground: '#f4efe8',
    colorBorder: '#2e2a33',
    colorNeutral: '#f4efe8',
    fontFamily: 'Rubik, system-ui, sans-serif',
    borderRadius: '10px',
  },
}

const NAV = [
  { to: '/admin', label: 'Overview', icon: Gauge, end: true },
  { to: '/admin/audience', label: 'Audience', icon: Users },
  { to: '/admin/watching', label: 'Watching', icon: Clapperboard },
  { to: '/admin/playback', label: 'Playback', icon: Activity },
  { to: '/admin/visitors', label: 'Visitors', icon: Footprints },
  { to: '/admin/reviews', label: 'Reviews', icon: MessageSquareText },
]

export default function AdminApp() {
  if (!KEY) {
    return (
      <div className="adm adm-center">
        <Seo title="Admin" noindex />
        <div className="setup">
          <h1>Connect Clerk to open the dashboard</h1>
          <p>Add <code>VITE_CLERK_PUBLISHABLE_KEY</code> to your environment (Vercel project settings, or <code>.env.local</code> for local work), then rebuild.</p>
        </div>
      </div>
    )
  }
  return (
    <ClerkProvider publishableKey={KEY} afterSignOutUrl="/admin" signInFallbackRedirectUrl="/admin" signUpFallbackRedirectUrl="/admin" appearance={appearance}>
      <Seo title="Admin" noindex />
      <ClerkLoading>
        <div className="adm adm-center"><span className="booth-light" aria-label="Loading" /></div>
      </ClerkLoading>
      <Show when="signed-out">
        <div className="adm adm-center">
          <div className="signin">
            <p className="signin-brand">Cucuflix booth</p>
            <SignIn routing="hash" forceRedirectUrl="/admin" signUpForceRedirectUrl="/admin" />
          </div>
        </div>
      </Show>
      <Show when="signed-in">
        <Shell />
      </Show>
    </ClerkProvider>
  )
}

function Shell() {
  const range = useRange()
  const [params, setParams] = useSearchParams()
  const { pathname } = useLocation()
  const keep = params.get('range') ? `?range=${params.get('range')}` : ''
  const setRange = (key: string) => {
    const next = new URLSearchParams(params)
    next.set('range', key)
    next.delete('before')
    setParams(next, { replace: true })
  }
  const journey = /^\/admin\/visitors\/./.test(pathname)
  const here = NAV.find((n) => (n.end ? pathname.replace(/\/$/, '') === n.to : pathname.startsWith(n.to))) ?? NAV[0]

  return (
    <div className="adm">
      <aside className="side">
        <a className="side-brand" href="/" title="Open the site">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>Cucuflix <em>booth</em></span>
        </a>
        <nav aria-label="Dashboard">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={`${to}${keep}`} end={end} className="side-link">
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="side-user">
          <UserButton showName appearance={appearance} />
        </div>
      </aside>

      <main className="adm-main" id="main">
        <header className="topbar">
          <h1>{here.label}</h1>
          {!journey && (
            <div className="ranges" role="group" aria-label="Date range">
              {RANGES.map((r) => (
                <button key={r.key} type="button" className="range" aria-pressed={r.key === range.key} onClick={() => setRange(r.key)}>
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </header>
        <Routes>
          <Route index element={<Overview />} />
          <Route path="audience" element={<Audience />} />
          <Route path="watching" element={<Watching />} />
          <Route path="playback" element={<Playback />} />
          <Route path="visitors" element={<Visitors />} />
          <Route path="visitors/:session" element={<Journey />} />
          <Route path="reviews" element={<ReviewsPage />} />
          <Route path="*" element={<Overview />} />
        </Routes>
      </main>
    </div>
  )
}
