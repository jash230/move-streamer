import Hls from 'hls.js'
import { Captions, CaptionsOff, Check, Maximize, Minimize, Pause, Play, TriangleAlert, Volume2, VolumeX } from 'lucide-react'
import { type CSSProperties, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import type { MediaType, Playback } from '../api'
import { formatTime } from '../progress'
import { resolveVidrock, type VidrockServer } from '../vidrock'

type SubtitleOption = { id: number; label: string; language: string; isDefault?: boolean }
type WebkitFullscreenVideo = HTMLVideoElement & {
  webkitDisplayingFullscreen?: boolean
  webkitEnterFullscreen?: () => void
  webkitExitFullscreen?: () => void
}

const SUBTITLE_PREFERENCE_KEY = 'streambox.subs'

function loadSubtitlePreference() {
  try { return localStorage.getItem(SUBTITLE_PREFERENCE_KEY) || 'he' } catch { return 'he' }
}

function preferredSubtitle(tracks: SubtitleOption[], preference: string) {
  if (preference === 'off' || !tracks.length) return undefined
  const matches = (track: SubtitleOption) => {
    const language = `${track.language} ${track.label}`.toLowerCase()
    if (preference === 'he') return /\b(he|heb|hebrew)\b|עברית/.test(language)
    if (preference === 'en') return /\b(en|eng|english)\b/.test(language)
    return track.language.toLowerCase() === preference.toLowerCase() || track.label.toLowerCase() === preference.toLowerCase()
  }
  return tracks.find(matches) ?? tracks.find((track) => track.isDefault) ?? tracks[0]
}

function nativeSubtitleTracks(video: HTMLVideoElement): SubtitleOption[] {
  return Array.from(video.textTracks).flatMap((track, id) => {
    if (track.kind !== 'subtitles' && track.kind !== 'captions') return []
    return [{ id, label: track.label || track.language || `Subtitle ${id + 1}`, language: track.language }]
  })
}

// Native <video> player for VidRock: resolves the real HLS in the browser (see vidrock.ts) and plays
// it through the /api/stream proxy with hls.js, trying each returned server until one plays. Reports
// progress through onPlayback the way the old iframe players did, so Watch resumes, saves, and
// auto-nexts without caring which player drew the frame. Ships its own controls (the browser's
// default <video controls> looks nothing like the rest of Cucuflix).
export default function NativePlayer(props: {
  type: MediaType
  id: string
  season: number
  episode: number
  resumeAt?: number
  onPlayback: (p: Playback) => void
}) {
  const { type, id, season, episode, resumeAt, onPlayback } = props
  const videoRef = useRef<HTMLVideoElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const fullscreenRequestedRef = useRef(false)
  const sourceKeyRef = useRef<string | undefined>(undefined)
  const sourceChangeRef = useRef(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const [failed, setFailed] = useState(false)
  const [paused, setPaused] = useState(true)
  const [waiting, setWaiting] = useState(true)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleOption[]>([])
  const [selectedSubtitle, setSelectedSubtitle] = useState(-1)
  const [subtitleMenuOpen, setSubtitleMenuOpen] = useState(false)
  const subtitlePreferenceRef = useRef<string | null>(null)
  if (subtitlePreferenceRef.current === null) subtitlePreferenceRef.current = loadSubtitlePreference()

  // Resolve + attach. The player stays mounted between episodes so fullscreen is preserved.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const sourceKey = `${type}:${id}:${season}:${episode}`
    sourceChangeRef.current = sourceKeyRef.current !== undefined && sourceKeyRef.current !== sourceKey
    sourceKeyRef.current = sourceKey
    let hls: Hls | undefined
    let playWhenReady: (() => void) | undefined
    let cancelled = false
    video.pause()
    setFailed(false)
    setPaused(true)
    setWaiting(true)
    setCur(0)
    setDur(0)
    setBuffered(0)
    setSubtitleTracks([])
    setSelectedSubtitle(-1)
    setSubtitleMenuOpen(false)

    ;(async () => {
      let servers: VidrockServer[] = []
      // Resolve in the browser: VidRock's /api blocks datacenter IPs, so this can't run on the server.
      try { servers = await resolveVidrock(type, id, season, episode) } catch { /* handled below */ }
      if (cancelled) return
      if (!servers.length) { setFailed(true); return }

      let i = 0
      const load = () => {
        if (cancelled) return
        if (i >= servers.length) { setFailed(true); return }
        if (playWhenReady) video.removeEventListener('canplay', playWhenReady)
        playWhenReady = () => {
          video.removeEventListener('canplay', playWhenReady!)
          setWaiting(false)
          void video.play().catch(() => {})
        }
        video.addEventListener('canplay', playWhenReady)
        const src = servers[i++].url
        if (Hls.isSupported()) {
          hls?.destroy()
          setSubtitleTracks([])
          setSelectedSubtitle(-1)
          const player = new Hls()
          hls = player
          hlsRef.current = player
          let preferenceApplied = false
          player.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_e, data) => {
            const tracks = data.subtitleTracks.map((track) => ({
              id: track.id,
              label: track.name || track.lang || `Subtitle ${track.id + 1}`,
              language: track.lang || '',
              isDefault: track.default,
            }))
            setSubtitleTracks(tracks)
            if (preferenceApplied || !tracks.length) return
            preferenceApplied = true
            const preferred = preferredSubtitle(tracks, subtitlePreferenceRef.current!)
            if (!preferred) {
              player.subtitleTrack = -1
              player.subtitleDisplay = false
              return
            }
            player.subtitleTrack = preferred.id
            player.subtitleDisplay = true
            setSelectedSubtitle(preferred.id)
          })
          player.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (_e, data) => {
            setSelectedSubtitle(data.id)
          })
          player.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) load() }) // dead host / 403'd segments → next server
          player.loadSource(src)
          player.attachMedia(video)
        } else {
          hlsRef.current = null
          video.src = src // Safari plays HLS natively
        }
      }
      load()
    })()

    return () => {
      cancelled = true
      if (playWhenReady) video.removeEventListener('canplay', playWhenReady)
      hls?.destroy()
      hlsRef.current = null
    }
  }, [type, id, season, episode])

  // Safari exposes native HLS subtitle tracks through the video's TextTrackList.
  useEffect(() => {
    const video = videoRef.current
    if (!video || Hls.isSupported()) return
    let tracksReady = false
    const syncTracks = () => {
      const tracks = nativeSubtitleTracks(video)
      setSubtitleTracks(tracks)
      if (!tracksReady && tracks.length) {
        tracksReady = true
        const preferred = preferredSubtitle(tracks, subtitlePreferenceRef.current!)
        for (const track of tracks) video.textTracks[track.id].mode = track.id === preferred?.id ? 'showing' : 'disabled'
        if (preferred) setSelectedSubtitle(preferred.id)
        return
      }
      const showing = tracks.find((track) => video.textTracks[track.id]?.mode === 'showing')
      const selected = showing?.id ?? -1
      setSelectedSubtitle(selected)
    }
    const resetTracks = () => {
      tracksReady = false
      setSelectedSubtitle(-1)
    }
    const textTracks = video.textTracks
    textTracks.addEventListener('addtrack', syncTracks)
    textTracks.addEventListener('change', syncTracks)
    video.addEventListener('loadedmetadata', syncTracks)
    video.addEventListener('loadstart', resetTracks)
    return () => {
      textTracks.removeEventListener('addtrack', syncTracks)
      textTracks.removeEventListener('change', syncTracks)
      video.removeEventListener('loadedmetadata', syncTracks)
      video.removeEventListener('loadstart', resetTracks)
    }
  }, [])

  // Track fullscreen changes (incl. the user pressing Esc).
  useEffect(() => {
    const video = videoRef.current as WebkitFullscreenVideo | null
    const onChange = () => {
      const active = document.fullscreenElement === wrapRef.current || Boolean(video?.webkitDisplayingFullscreen)
      setFullscreen(active)
      if (!active && fullscreenRequestedRef.current && !video?.ended && !sourceChangeRef.current) fullscreenRequestedRef.current = false
    }
    const onNativeEnd = () => {
      setFullscreen(false)
      if (video) video.controls = false
      if (fullscreenRequestedRef.current && (video?.ended || sourceChangeRef.current)) setPseudoFullscreen(true)
      else fullscreenRequestedRef.current = false
    }
    document.addEventListener('fullscreenchange', onChange)
    video?.addEventListener('webkitbeginfullscreen', onChange)
    video?.addEventListener('webkitendfullscreen', onNativeEnd)
    onChange()
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      video?.removeEventListener('webkitbeginfullscreen', onChange)
      video?.removeEventListener('webkitendfullscreen', onNativeEnd)
    }
  }, [])

  useEffect(() => {
    if (!pseudoFullscreen) return
    const player = wrapRef.current?.parentElement
    const root = document.documentElement
    const previousOverflow = document.body.style.overflow
    const previousRootOverflow = root.style.overflow
    document.body.style.overflow = 'hidden'
    root.style.overflow = 'hidden'
    player?.classList.add('np-pseudo-fullscreen-parent')
    return () => {
      document.body.style.overflow = previousOverflow
      root.style.overflow = previousRootOverflow
      player?.classList.remove('np-pseudo-fullscreen-parent')
    }
  }, [pseudoFullscreen])

  // Reveal the controls, then hide them again after a pause in activity while playing.
  const poke = () => {
    setShowControls(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => { if (videoRef.current && !videoRef.current.paused) setShowControls(false) }, 2600)
  }
  useEffect(() => () => clearTimeout(hideTimer.current), [])

  const v = () => videoRef.current
  const togglePlay = () => { const el = v(); if (!el) return; if (el.paused) el.play(); else el.pause() }
  const seek = (t: number) => { const el = v(); if (el) el.currentTime = t }
  const skip = (d: number) => { const el = v(); if (el) el.currentTime = Math.min(dur || el.duration, Math.max(0, el.currentTime + d)) }
  const setVol = (val: number) => { const el = v(); if (!el) return; el.volume = val; el.muted = val === 0 }
  const toggleMute = () => { const el = v(); if (el) el.muted = !el.muted }
  const toggleFullscreen = async () => {
    const video = videoRef.current as WebkitFullscreenVideo | null
    const wrap = wrapRef.current
    if (!video || !wrap) return
    if (pseudoFullscreen) {
      fullscreenRequestedRef.current = false
      setPseudoFullscreen(false)
      return
    }
    if (document.fullscreenElement === wrap || video.webkitDisplayingFullscreen) {
      fullscreenRequestedRef.current = false
      if (document.fullscreenElement === wrap) await document.exitFullscreen()
      else video.webkitExitFullscreen?.()
      return
    }
    fullscreenRequestedRef.current = true
    if (wrap.requestFullscreen) {
      try { await wrap.requestFullscreen(); return } catch { /* Fall through for browsers that only fullscreen video. */ }
    }
    if (video.webkitEnterFullscreen) {
      video.controls = true
      try { video.webkitEnterFullscreen(); return } catch { video.controls = false }
    }
    setPseudoFullscreen(true)
  }

  const selectSubtitle = (id: number) => {
    const option = subtitleTracks.find((track) => track.id === id)
    const preference = option ? option.language || option.label : 'off'
    setSelectedSubtitle(id)
    setSubtitleMenuOpen(false)
    subtitlePreferenceRef.current = preference
    try { localStorage.setItem(SUBTITLE_PREFERENCE_KEY, preference) } catch { /* ignore */ }
    const player = hlsRef.current
    if (player) {
      player.subtitleTrack = id
      player.subtitleDisplay = id >= 0
      return
    }
    const tracks = videoRef.current?.textTracks
    if (tracks) Array.from(tracks).forEach((track, index) => {
      if (track.kind === 'subtitles' || track.kind === 'captions') track.mode = index === id ? 'showing' : 'disabled'
    })
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && (subtitleMenuOpen || pseudoFullscreen)) {
      setSubtitleMenuOpen(false)
      fullscreenRequestedRef.current = false
      setPseudoFullscreen(false)
      return
    }
    if (e.target !== e.currentTarget && (e.target as HTMLElement).closest('button, input, select')) return
    const keys = [' ', 'ArrowLeft', 'ArrowRight', 'f', 'm']
    if (!keys.includes(e.key)) return
    e.preventDefault()
    if (e.key === ' ') togglePlay()
    else if (e.key === 'ArrowLeft') skip(-10)
    else if (e.key === 'ArrowRight') skip(10)
    else if (e.key === 'f') void toggleFullscreen()
    else if (e.key === 'm') toggleMute()
    poke()
  }

  const pct = (n: number) => (dur > 0 ? `${Math.min(100, (n / dur) * 100)}%` : '0%')

  return (
    <div
      ref={wrapRef}
      className={`np${showControls || paused || subtitleMenuOpen ? ' np-active' : ''}${pseudoFullscreen ? ' np-pseudo-fullscreen' : ''}`}
      onMouseMove={poke}
      onTouchStart={poke}
      onKeyDown={onKey}
      tabIndex={0}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        onClick={togglePlay}
        onLoadedMetadata={(e) => { const el = e.currentTarget; setDur(el.duration); if (resumeAt) try { el.currentTime = resumeAt } catch { /* ignore */ } }}
        onPlay={() => { setPaused(false); poke() }}
        onPause={() => { setPaused(true); setShowControls(true) }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => { sourceChangeRef.current = false; setWaiting(false) }}
        onTimeUpdate={(e) => { const el = e.currentTarget; setCur(el.currentTime); if (el.duration) onPlayback({ watched: el.currentTime, duration: el.duration }) }}
        onProgress={(e) => { const b = e.currentTarget.buffered; if (b.length) setBuffered(b.end(b.length - 1)) }}
        onVolumeChange={(e) => { setMuted(e.currentTarget.muted); setVolume(e.currentTarget.volume) }}
        onEnded={() => onPlayback({ watched: 0, duration: 0, ended: true })}
      />

      {failed && (
        <div className="np-error">
          <TriangleAlert size={30} aria-hidden="true" />
          <p>This title wouldn't load. It may be temporarily unavailable — try again in a bit.</p>
        </div>
      )}

      {!failed && waiting && <div className="np-spinner" aria-label="Loading" />}

      {!failed && paused && !waiting && (
        <button className="np-big" onClick={togglePlay} aria-label="Play">
          <Play size={40} fill="currentColor" />
        </button>
      )}

      <div className="np-bar">
        <input
          className="np-seek"
          type="range"
          min={0}
          max={dur || 0}
          step="any"
          value={cur}
          onChange={(e) => seek(Number(e.target.value))}
          style={{ '--played': pct(cur), '--buffered': pct(buffered) } as CSSProperties}
          aria-label="Seek"
        />
        <div className="np-row">
          <button className="np-btn" onClick={togglePlay} aria-label={paused ? 'Play' : 'Pause'}>
            {paused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
          </button>

          <div className="np-vol">
            <button className="np-btn" onClick={toggleMute} aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}>
              {muted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <input
              className="np-volrange"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => setVol(Number(e.target.value))}
              style={{ '--played': `${(muted ? 0 : volume) * 100}%` } as CSSProperties}
              aria-label="Volume"
            />
          </div>

          <button
            className="np-btn np-subtitle-trigger"
            onClick={() => setSubtitleMenuOpen((open) => !open)}
            aria-label={subtitleTracks.length ? 'Subtitles' : 'No subtitles available'}
            aria-expanded={subtitleMenuOpen}
            aria-controls="np-subtitle-menu"
            title={subtitleTracks.length ? 'Subtitles' : 'No subtitles available'}
            disabled={!subtitleTracks.length}
          >
            {selectedSubtitle < 0 ? <CaptionsOff size={20} /> : <Captions size={20} />}
          </button>

          <span className="np-time">{formatTime(cur)} <span className="np-time-sep">/</span> {dur ? formatTime(dur) : '--:--'}</span>

          <button className="np-btn np-fs" onClick={() => void toggleFullscreen()} aria-label={fullscreen || pseudoFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {fullscreen || pseudoFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        </div>
        {subtitleMenuOpen && subtitleTracks.length > 0 && (
          <div id="np-subtitle-menu" className="np-subtitle-menu" role="group" aria-label="Subtitle language">
            <button className="np-subtitle-option" onClick={() => selectSubtitle(-1)} aria-pressed={selectedSubtitle === -1}>
              <span>Off</span>{selectedSubtitle === -1 && <Check size={16} aria-hidden="true" />}
            </button>
            {subtitleTracks.map((track) => (
              <button key={`${track.id}-${track.language}`} className="np-subtitle-option" onClick={() => selectSubtitle(track.id)} aria-pressed={selectedSubtitle === track.id}>
                <span>{track.label}</span>{selectedSubtitle === track.id && <Check size={16} aria-hidden="true" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
