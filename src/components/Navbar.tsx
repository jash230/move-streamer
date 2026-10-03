import { Clapperboard, Film, Home, Search, Tv } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'

const LINKS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/movies', label: 'Movies', icon: Film },
  { to: '/tv', label: 'TV Shows', icon: Tv },
  { to: '/israel', label: 'Israeli TV', icon: Clapperboard },
]

export default function Navbar() {
  const [q, setQ] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <header className={scrolled || pathname !== '/' ? 'nav solid' : 'nav'}>
      <Link to="/" className="logo" aria-label="StreamBox home">
        <span className="logo-mark" aria-hidden="true" />
        <span>Stream<span className="logo-accent">Box</span></span>
      </Link>
      <nav aria-label="Primary">
        {LINKS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <form onSubmit={submit} role="search" className="search">
        <label htmlFor="q" className="sr-only">Search movies and shows</label>
        <Search size={18} className="search-icon" aria-hidden="true" />
        <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search movies & shows" />
      </form>
    </header>
  )
}
