import { useRef } from 'react'
import './IntroSurface.css'

type IntroSurfaceProps = {
  onEnter: () => void
}

const particles = Array.from({ length: 24 }, (_, index) => ({
  left: `${8 + ((index * 37) % 84)}%`,
  top: `${12 + ((index * 53) % 76)}%`,
  delay: `${(index % 9) * 0.7}s`,
  duration: `${5 + (index % 5)}s`,
}))

export function IntroSurface({ onEnter }: IntroSurfaceProps) {
  const surfaceRef = useRef<HTMLElement>(null)

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const element = surfaceRef.current
    if (!element) return
    const bounds = element.getBoundingClientRect()
    const x = ((event.clientX - bounds.left) / bounds.width) * 100
    const y = ((event.clientY - bounds.top) / bounds.height) * 100
    element.style.setProperty('--pointer-x', `${x}%`)
    element.style.setProperty('--pointer-y', `${y}%`)
  }

  return (
    <section ref={surfaceRef} className="intro-surface" onPointerMove={handlePointerMove}>
      <div className="intro-surface__noise" aria-hidden="true" />
      <div className="intro-surface__glow" aria-hidden="true" />
      <div className="intro-surface__particles" aria-hidden="true">
        {particles.map((particle, index) => (
          <i key={index} style={{ left: particle.left, top: particle.top, animationDelay: particle.delay, animationDuration: particle.duration }} />
        ))}
      </div>

      <div className="intro-surface__membrane" aria-hidden="true">
        <div className="intro-surface__orbit intro-surface__orbit--outer" />
        <div className="intro-surface__orbit intro-surface__orbit--inner" />
        <svg className="intro-surface__triangle" viewBox="0 0 300 260" preserveAspectRatio="none">
          <path d="M150 16 C172 62 226 160 272 226 C220 242 78 242 28 226 C78 160 128 62 150 16Z" />
        </svg>
        <span className="intro-surface__core" />
      </div>

      <div className="intro-surface__content">
        <p className="intro-surface__eyebrow">BEHIND REALITY / 01</p>
        <h1>现实的背面</h1>
        <p className="intro-surface__tagline">你看到的现实，也许只是一层表面。</p>
        <button type="button" className="intro-surface__button" onClick={onEnter}>
          <span>触碰表面</span>
          <small>ENTER THE OTHER SIDE</small>
        </button>
        <p className="intro-surface__privacy">摄像头画面仅在本机处理，不会上传或保存</p>
      </div>
    </section>
  )
}
