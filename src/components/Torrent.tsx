import { HardDrive, LoaderCircle, RotateCw, TriangleAlert, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  getTorrentStreams,
  pickDefaultStream,
  STREMIO_SERVER,
  stremioServerUp,
  torrentPeers,
  transcodeUrl,
  type MediaType,
  type TorrentStream,
} from '../api'
import Dropdown, { type DropdownGroup } from './Dropdown'

type Status = 'loading' | 'no-imdb' | 'no-server' | 'error' | 'ready'

export function useTorrentStreams(imdbId: string | undefined, type: MediaType, season: number, episode: number, enabled: boolean) {
  const [status, setStatus] = useState<Status>('loading')
  const [streams, setStreams] = useState<TorrentStream[]>([])
  const [error, setError] = useState<string>()
  const [selected, setSelected] = useState<TorrentStream>()
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return
    if (!imdbId) return setStatus('no-imdb')
    let cancelled = false
    setStatus('loading')
    setStreams([])
    setSelected(undefined)
    Promise.all([getTorrentStreams(imdbId, type, season, episode), stremioServerUp()])
      .then(([list, serverUp]) => {
        if (cancelled) return
        setStreams(list)
        setSelected(pickDefaultStream(list))
        // Debrid links play straight from the web; only plain torrents need the local Stremio server.
        const needsServer = list.length > 0 && list.every((s) => s.url.startsWith(STREMIO_SERVER))
        setStatus(needsServer && !serverUp ? 'no-server' : 'ready')
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message)
        setStatus('error')
      })
    return () => { cancelled = true }
  }, [imdbId, type, season, episode, enabled, attempt])

  return { status, streams, error, selected, select: setSelected, retry: () => setAttempt((n) => n + 1) }
}

export type TorrentState = ReturnType<typeof useTorrentStreams>

export function TorrentVideo({ torrent, title, onEnded }: { torrent: TorrentState; title: string; onEnded?: () => void }) {
  const { status, selected } = torrent
  if (status === 'loading') return <PlayerNote busy>Finding torrents…</PlayerNote>
  if (status !== 'ready') return <PlayerNote>See the message below the player.</PlayerNote>
  if (!selected) return <PlayerNote>No torrents found. Try another server.</PlayerNote>
  return <TorrentStreamVideo key={selected.key} stream={selected} title={title} onEnded={onEnded} />
}

function PlayerNote({ children, busy }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <div className="tp-note" role="status">
      {busy ? <LoaderCircle className="tp-spin" size={28} aria-hidden="true" /> : <TriangleAlert size={28} aria-hidden="true" />}
      <p>{children}</p>
    </div>
  )
}

function TorrentStreamVideo({ stream, title, onEnded }: { stream: TorrentStream; title: string; onEnded?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [mode, setMode] = useState<'direct' | 'hls'>(stream.needsTranscode ? 'hls' : 'direct')
  const [phase, setPhase] = useState<'connecting' | 'playing' | 'buffering' | 'failed'>('connecting')
  const [peers, setPeers] = useState<number>()
  const resumeAt = useRef(0)

  // Fall back to Stremio's transcoder, keeping the viewer's position.
  const toHls = () => {
    resumeAt.current = videoRef.current?.currentTime ?? 0
    setMode('hls')
    setPhase('buffering')
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let destroy = () => {}
    if (mode === 'direct') {
      video.src = stream.url
    } else {
      const src = transcodeUrl(stream.url)
      // Prefer hls.js: Chrome's newer native HLS can't handle Stremio's separate audio/subtitle renditions.
      if (typeof MediaSource === 'undefined' && video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src
      } else {
        let cancelled = false
        import('hls.js').then(({ default: Hls }) => {
          if (cancelled) return
          if (!Hls.isSupported()) {
            video.src = src
            return
          }
          const hls = new Hls({ maxBufferLength: 60 })
          hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) setPhase('failed') })
          hls.loadSource(src)
          hls.attachMedia(video)
          destroy = () => hls.destroy()
        })
        destroy = () => { cancelled = true }
      }
    }
    return () => {
      destroy()
      video.removeAttribute('src')
      video.load()
    }
  }, [mode, stream.url])

  // Show swarm size while the torrent is still warming up.
  useEffect(() => {
    if (phase === 'playing' || phase === 'failed') return
    const tick = () => torrentPeers(stream.url).then(setPeers)
    tick()
    const t = setInterval(tick, 2000)
    return () => clearInterval(t)
  }, [phase, stream.url])

  const onTimeUpdate = () => {
    const video = videoRef.current as (HTMLVideoElement & { webkitAudioDecodedByteCount?: number }) | null
    // Chrome plays video it can decode even when the audio codec (AC3, DTS…) is unsupported, so check for silence.
    if (video && mode === 'direct' && video.currentTime > 3 && video.webkitAudioDecodedByteCount === 0) toHls()
  }

  return (
    <>
      <video
        ref={videoRef}
        className="tp-video"
        controls
        autoPlay
        playsInline
        title={`${title} player`}
        onLoadedMetadata={(e) => {
          if (resumeAt.current) e.currentTarget.currentTime = resumeAt.current
        }}
        onPlaying={() => setPhase('playing')}
        onWaiting={() => setPhase((p) => (p === 'connecting' ? p : 'buffering'))}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        onError={() => (mode === 'direct' ? toHls() : setPhase('failed'))}
      />
      {phase === 'connecting' && (
        <PlayerNote busy>
          Connecting to peers{peers ? ` (${peers} found)` : ''}. Torrents can take up to a minute to start.
        </PlayerNote>
      )}
      {phase === 'failed' && <PlayerNote>This torrent won't play. Pick another source below.</PlayerNote>}
    </>
  )
}

// Group sources by resolution ("4k", "1080p"…), keeping Torrentio's ranking inside each group.
function groupByQuality(streams: TorrentStream[]): DropdownGroup<TorrentStream>[] {
  const groups = new Map<string, TorrentStream[]>()
  for (const s of streams) {
    const q = s.quality.split(' ')[0]
    groups.set(q, [...(groups.get(q) ?? []), s])
  }
  return [...groups].map(([label, items]) => ({ label, items }))
}

function SourceMeta({ s }: { s: TorrentStream }) {
  return (
    <span className="src-meta">
      {s.seeders !== undefined && <span><Users size={13} aria-label="Seeders" /> {s.seeders}</span>}
      {s.size && <span><HardDrive size={13} aria-label="Size" /> {s.size}</span>}
      {s.source && <span>{s.source}</span>}
    </span>
  )
}

// Source dropdown, shown beside the server picker while Torrentio is selected.
export function SourcePicker({ torrent, onPick }: { torrent: TorrentState; onPick: () => void }) {
  const { status, streams, selected, select } = torrent
  const ready = status === 'ready' && streams.length > 0
  return (
    <Dropdown
      label="Source"
      wide
      groups={ready ? groupByQuality(streams) : []}
      value={selected}
      getKey={(s) => s.key}
      disabled={!ready}
      onChange={(s) => { select(s); onPick() }}
      renderValue={(s) =>
        status === 'loading' ? <span className="dd-note">Finding torrents…</span>
          : !s ? <span className="dd-note">No sources</span>
          : (
            <>
              <span className="dd-name">{s.quality}</span>
              <span className="dd-note" title={s.title}>{s.title}</span>
            </>
          )}
      renderOption={(s) => (
        <span className="src-option">
          <span className="src-title" title={s.file ? `${s.title}\n${s.file}` : s.title}>
            <span className="src-title-text">{s.title}</span>
            {s.quality.includes(' ') && <span className="src-tag">{s.quality.split(' ').slice(1).join(' ')}</span>}
          </span>
          <SourceMeta s={s} />
        </span>
      )}
    />
  )
}

// Explains why there's nothing to play, with a way forward.
export function TorrentNotice({ torrent, isTv }: { torrent: TorrentState; isTv: boolean }) {
  const { status, streams, retry, error } = torrent
  const what = isTv ? 'this episode' : 'this title'

  if (status === 'no-imdb') {
    return <Notice>Torrentio looks titles up by IMDb ID, and {what} doesn't have one. Try another server.</Notice>
  }
  if (status === 'no-server') {
    return (
      <Notice action={<button className="btn btn-secondary" onClick={retry}><RotateCw size={16} aria-hidden="true" /> Check again</button>}>
        Torrent streaming runs through Stremio on this computer. Open the{' '}
        <a href="https://www.stremio.com/downloads" target="_blank" rel="noreferrer">Stremio app</a>, then check again.
      </Notice>
    )
  }
  if (status === 'error') {
    return (
      <Notice action={<button className="btn btn-secondary" onClick={retry}><RotateCw size={16} aria-hidden="true" /> Try again</button>}>
        Couldn't reach Torrentio ({error}).
      </Notice>
    )
  }
  if (status === 'ready' && streams.length === 0) return <Notice>No torrents found for {what}. Try another server.</Notice>
  return null
}

function Notice({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="tnotice" role="status">
      <TriangleAlert size={20} aria-hidden="true" />
      <p>{children}</p>
      {action}
    </div>
  )
}
