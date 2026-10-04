import { Play, X } from 'lucide-react'
import { useEffect, useState } from 'react'

const COUNTDOWN = 8

// Shown over the player when an episode ends. With autoplay on it counts down, otherwise it waits.
export default function UpNext({ label, autoplay, onPlay, onCancel }: {
  label: string
  autoplay: boolean
  onPlay: () => void
  onCancel: () => void
}) {
  const [left, setLeft] = useState(COUNTDOWN)

  useEffect(() => {
    if (!autoplay) return
    if (left <= 0) return onPlay()
    const t = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [autoplay, left, onPlay])

  return (
    <div className="upnext" role="status" aria-live="polite">
      <div className="upnext-text">
        <span className="upnext-kicker">Up next</span>
        <strong>{label}</strong>
      </div>
      <div className="upnext-actions">
        <button className="upnext-play" onClick={onPlay}>
          {autoplay && (
            <svg className="upnext-ring" viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r="16" pathLength={COUNTDOWN} style={{ strokeDashoffset: COUNTDOWN - left }} />
            </svg>
          )}
          <Play size={16} fill="currentColor" aria-hidden="true" />
          {autoplay ? `Playing in ${left}s` : 'Play next episode'}
        </button>
        <button className="upnext-cancel" onClick={onCancel} aria-label="Cancel next episode">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
