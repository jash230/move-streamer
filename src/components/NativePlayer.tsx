import Hls from 'hls.js'
import { TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { MediaType, Playback } from '../api'

// Native <video> player for VidRock: resolves the real HLS via /api/vidrock and plays it through
// the /api/stream proxy with hls.js, trying each returned server until one plays. Reports progress
// the same way the iframe players' postMessage does, via onPlayback, so Watch resumes/saves/auto-nexts
// without caring which player drew the frame.
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
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let hls: Hls | undefined
    let cancelled = false
    setFailed(false)

    const play = async () => {
      const q =
        type === 'movie' ? `type=movie&id=${id}` : `type=tv&id=${id}&season=${season}&episode=${episode}`
      let servers: { name: string; url: string }[] = []
      try { servers = (await fetch(`/api/vidrock?${q}`).then((r) => r.json())).servers ?? [] } catch { /* handled below */ }
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
          // A fatal error on this server (dead host, 403'd segments) → fall through to the next one.
          hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) load() })
        } else {
          // Safari plays HLS natively.
          video.src = src
        }
      }
      load()
    }
    play()

    return () => { cancelled = true; hls?.destroy() }
  }, [type, id, season, episode])

  if (failed) {
    return (
      <div className="player-error">
        <TriangleAlert size={32} aria-hidden="true" />
        <p>VidRock couldn't be reached. Try another server.</p>
      </div>
    )
  }

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      playsInline
      crossOrigin="anonymous"
      onLoadedMetadata={(e) => { if (resumeAt) try { e.currentTarget.currentTime = resumeAt } catch { /* ignore */ } }}
      onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) onPlayback({ watched: v.currentTime, duration: v.duration }) }}
      onEnded={() => onPlayback({ watched: 0, duration: 0, ended: true })}
    />
  )
}
