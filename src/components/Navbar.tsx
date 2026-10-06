import { Clapperboard, Film, Home, Loader2, MessageSquareHeart, Search, Star, Tv } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { img, search, warmSearch, type Media } from '../api'
import ReviewDialog from './ReviewDialog'

const LINKS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/movies', label: 'Movies', icon: Film },
  { to: '/tv', label: 'TV Shows', icon: Tv },
  { to: '/israel', label: 'Israeli TV', icon: Clapperboard },
]

export default function Navbar() {
  const [q, setQ] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const [results, setResults] = useState<Media[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [reviewing, setReviewing] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const term = q.trim()

  useEffect(() => {
    if (!term) {
      setResults([])
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    const t = setTimeout(() => {
      search(term)
        .then((r) => alive && setResults(r.slice(0, 8)))
        .catch(() => alive && setResults([]))
        .finally(() => alive && setLoading(false))
    }, 150)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [term])

  useEffect(() => setActive(-1), [results])

  useEffect(() => {
    setOpen(false)
    ;(document.activeElement as HTMLElement | null)?.blur()
  }, [pathname])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!formRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setOpen(false)
    const pick = results[active]
    if (pick) navigate(`/${pick.media_type}/${pick.id}`)
    else if (term) navigate(`/search?q=${encodeURIComponent(term)}`)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') return setOpen(false)
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    setOpen(true)
    const n = results.length
    if (n) setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % n : (i <= 0 ? n : i) - 1))
  }

  const showPanel = open && term !== ''

  return (
    <header className={scrolled || pathname !== '/' ? 'nav solid' : 'nav'}>
      <Link to="/" className="logo" aria-label="Cucuflix home">
        <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M23.66 22.43A10 10 0 1 1 23.66 9.57" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
          <path d="M12.5 11.2v9.6l9-4.8z" fill="#fff" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <span>Cucu<span className="logo-accent">flix</span></span>
      </Link>
      <nav aria-label="Primary">
        {LINKS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <form ref={formRef} onSubmit={submit} role="search" className="search">
        <label htmlFor="q" className="sr-only">Search movies and shows</label>
        <Search size={18} className="search-icon" aria-hidden="true" />
        <input
          id="q"
          type="search"
          autoComplete="off"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            warmSearch()
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
          placeholder="Search movies & shows"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="search-suggest"
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `suggest-${active}` : undefined}
        />
        {showPanel && (
          <div className="suggest" id="search-suggest">
            {results.length > 0 && (
              <ul role="listbox" aria-label="Suggestions">
                {results.map((m, i) => {
                  const year = m.date.slice(0, 4)
                  const poster = img(m.poster_path, 'w92')
                  return (
                    <li key={`${m.media_type}-${m.id}`} id={`suggest-${i}`} role="option" aria-selected={i === active}>
                      <Link
                        to={`/${m.media_type}/${m.id}`}
                        className={i === active ? 'suggest-item active' : 'suggest-item'}
                        onMouseEnter={() => setActive(i)}
                        tabIndex={-1}
                      >
                        {poster ? <img src={poster} alt="" width={40} height={60} /> : <span className="suggest-noposter" />}
                        <span className="suggest-text">
                          <span className="suggest-title">{m.title}</span>
                          <span className="suggest-sub">
                            {m.media_type === 'tv' ? 'Series' : 'Movie'}
                            {year && ` · ${year}`}
                            {m.vote_average > 0 && (
                              <>
                                {' · '}
                                <Star size={11} fill="currentColor" className="suggest-star" aria-hidden="true" /> {m.vote_average.toFixed(1)}
                              </>
                            )}
                          </span>
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
            {loading && results.length === 0 && (
              <p className="suggest-status"><Loader2 size={16} className="spin" aria-hidden="true" /> Searching…</p>
            )}
            {!loading && results.length === 0 && <p className="suggest-status">No matches for “{term}”</p>}
            {results.length > 0 && (
              <Link to={`/search?q=${encodeURIComponent(term)}`} className="suggest-all" tabIndex={-1}>
                See all results for “{term}”
              </Link>
            )}
          </div>
        )}
      </form>
      <button type="button" className="nav-review" onClick={() => setReviewing(true)} aria-haspopup="dialog">
        <MessageSquareHeart size={18} aria-hidden="true" />
        <span>Review</span>
      </button>
      <ReviewDialog open={reviewing} onClose={() => setReviewing(false)} />
    </header>
  )
}
