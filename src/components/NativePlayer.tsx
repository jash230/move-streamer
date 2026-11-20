import Hls from 'hls.js'
import { Maximize, Minimize, Pause, Play, TriangleAlert, Volume2, VolumeX } from 'lucide-react'
import { type CSSProperties, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import type { MediaType, Playback } from '../api'
import { formatTime } from '../progress'
import { resolveVidrock, type VidrockServer } from '../vidrock'

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
  const [showControls, setShowControls] = useState(true)

  // Resolve + attach. Re-runs per episode (the key in Watch also remounts us, but this keeps it safe).
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let hls: Hls | undefined
    let cancelled = false
    setFailed(false)

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
        const src = servers[i++].url
        if (Hls.isSupported()) {
          hls?.destroy()
          hls = new Hls()
          hls.loadSource(src)
          hls.attachMedia(video)
          hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) load() }) // dead host / 403'd segments → next server
        } else {
          video.src = src // Safari plays HLS natively
        }
      }
      load()
    })()

    return () => { cancelled = true; hls?.destroy() }
  }, [type, id, season, episode])

  // Track fullscreen changes (incl. the user pressing Esc).
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === wrapRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

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
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else wrapRef.current?.requestFullscreen?.()
  }

  const onKey = (e: KeyboardEvent) => {
    const keys = [' ', 'ArrowLeft', 'ArrowRight', 'f', 'm']
    if (!keys.includes(e.key)) return
    e.preventDefault()
    if (e.key === ' ') togglePlay()
    else if (e.key === 'ArrowLeft') skip(-10)
    else if (e.key === 'ArrowRight') skip(10)
    else if (e.key === 'f') toggleFullscreen()
    else if (e.key === 'm') toggleMute()
    poke()
  }

  if (failed) {
    return (
      <div className="np-error">
        <TriangleAlert size={30} aria-hidden="true" />
        <p>This title wouldn't load. It may be temporarily unavailable — try again in a bit.</p>
      </div>
    )
  }

  const pct = (n: number) => (dur > 0 ? `${Math.min(100, (n / dur) * 100)}%` : '0%')

  return (
    <div
      ref={wrapRef}
      className={`np${showControls || paused ? ' np-active' : ''}`}
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
        onPlaying={() => setWaiting(false)}
        onTimeUpdate={(e) => { const el = e.currentTarget; setCur(el.currentTime); if (el.duration) onPlayback({ watched: el.currentTime, duration: el.duration }) }}
        onProgress={(e) => { const b = e.currentTarget.buffered; if (b.length) setBuffered(b.end(b.length - 1)) }}
        onVolumeChange={(e) => { setMuted(e.currentTarget.muted); setVolume(e.currentTarget.volume) }}
        onEnded={() => onPlayback({ watched: 0, duration: 0, ended: true })}
      />

      {waiting && <div className="np-spinner" aria-label="Loading" />}

      {paused && !waiting && (
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

          <span className="np-time">{formatTime(cur)} <span className="np-time-sep">/</span> {dur ? formatTime(dur) : '--:--'}</span>

          <button className="np-btn np-fs" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        </div>
      </div>
    </div>
  )
}
