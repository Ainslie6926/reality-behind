import { useCallback, useEffect, useRef, useState } from 'react'
import { CameraLayer } from './components/CameraLayer'
import { HandTracker } from './components/HandTracker'
import type { HandGesture } from './components/HandTracker'
import { TriangleRevealLayer } from './components/TriangleRevealLayer'
import { EmotionTracker, type Mood } from './components/EmotionTracker'
import { SoundManager } from './audio/SoundManager'
import { IntroSurface } from './components/IntroSurface'
import './App.css'

type ExperienceStatus = 'idle' | 'requesting' | 'live' | 'stopped' | 'error'

function describeCameraError(error: unknown): string {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return '当前页面不是安全环境，浏览器不允许打开摄像头。请使用 localhost 或 HTTPS 访问。'
  }

  if (!(error instanceof DOMException) && !(error instanceof Error)) {
    return '无法打开摄像头，请检查设备后重试。'
  }

  const name = error instanceof DOMException ? error.name : ''

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return '无法访问摄像头：你拒绝了权限。请在浏览器地址栏允许摄像头后，点击“重新开始”。'
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return '未检测到可用的摄像头设备。请连接摄像头后重试。'
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return '摄像头正被其他程序占用，请关闭占用后再试。'
  }

  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return '当前摄像头不满足所需配置，请更换设备后重试。'
  }

  if (name === 'SecurityError') {
    return '浏览器因安全策略阻止了摄像头访问。请确认站点权限后重试。'
  }

  return error.message || '无法打开摄像头，请检查设备后重试。'
}

function App() {
  const [status, setStatus] = useState<ExperienceStatus>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [gestures, setGestures] = useState<HandGesture[]>([])
  const [mood, setMood] = useState<Mood>('calm')
  const streamRef = useRef<MediaStream | null>(null)
  const [showIntro, setShowIntro] = useState(false)
  const [hasInteracted, setHasInteracted] = useState(false)
  const soundRef = useRef(new SoundManager())
  const previousGestureCountRef = useRef(0)
  const previousPinchRef = useRef(false)
  const previousFistRef = useRef(false)
  const previousSpreadRef = useRef(0)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setStream(null)
  }, [])

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStream(null)
      setErrorMessage('当前浏览器不支持摄像头访问。请改用最新版桌面浏览器。')
      setStatus('error')
      return
    }

    setErrorMessage('')
    setStatus('requesting')
    setShowIntro(true)
    setHasInteracted(false)
    setGestures([])
    setMood('calm')
    previousGestureCountRef.current = 0
    previousPinchRef.current = false
    previousFistRef.current = false
    previousSpreadRef.current = 0
    soundRef.current.start()
    stopCamera()

    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })

      streamRef.current = nextStream
      setStream(nextStream)
      setStatus('live')
    } catch (error) {
      streamRef.current = null
      setStream(null)
      setErrorMessage(describeCameraError(error))
      setStatus('error')
    }
  }, [stopCamera])

  const closeCamera = useCallback(() => {
    if (hasInteracted) soundRef.current.playClose()
    stopCamera()
    setGestures([])
    setMood('calm')
    setErrorMessage('')
    setStatus('stopped')
  }, [hasInteracted, stopCamera])

  useEffect(() => {
    if (gestures.length > 0) {
      setShowIntro(false)
      setHasInteracted(true)
    }

    if (gestures.length > 0 && previousGestureCountRef.current === 0) soundRef.current.playOpen()
    if (gestures.length >= 2 && previousGestureCountRef.current < 2) soundRef.current.playConnect()

    const isPinch = gestures.some((gesture) => gesture.isPinch)
    const isFist = gestures.some((gesture) => gesture.isFist)
    if (isFist && !previousFistRef.current) soundRef.current.playClose()
    if (isPinch && !previousPinchRef.current) soundRef.current.playOpen()

    const spread = gestures.length >= 2
      ? Math.hypot(gestures[1].pinchCenter.x - gestures[0].pinchCenter.x, gestures[1].pinchCenter.y - gestures[0].pinchCenter.y)
      : gestures[0]?.pinchDistance ?? 0
    if (spread - previousSpreadRef.current > 0.035) soundRef.current.playExpand(Math.min(1, spread))

    previousGestureCountRef.current = gestures.length
    previousPinchRef.current = isPinch
    previousFistRef.current = isFist
    previousSpreadRef.current = spread
  }, [gestures])

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  return (
    <main className="experience">
      <CameraLayer stream={stream} />
      {status === 'idle' && <IntroSurface onEnter={startCamera} />}
      {status === 'live' && stream && (
        <>
          <TriangleRevealLayer gestures={gestures} mood={mood} />
          <HandTracker stream={stream} onGestureChange={setGestures} />
          <EmotionTracker stream={stream} onMoodChange={setMood} />
        </>
      )}

      <div className="experience__overlay">
        {status === 'requesting' && (
          <section className="experience__panel">
            <p>正在请求摄像头权限…</p>
          </section>
        )}

        {status === 'live' && (
          <>
            {showIntro && (
              <section className="experience__intro">
                <p className="experience__eyebrow">现实的背面</p>
                <h2>把现实打开一道缝</h2>
                <p>用拇指和食指并拢，打开隐藏的世界。让另一只手加入，扩大你看到的范围。</p>
              </section>
            )}
            <div className="experience__controls">
              <button type="button" className="experience__button experience__button--ghost" onClick={closeCamera}>
                关闭摄像头
              </button>
              <button type="button" className="experience__button" onClick={startCamera}>
                重新开始
              </button>
            </div>
          </>
        )}

        {status === 'stopped' && (
          <section className="experience__panel">
            {hasInteracted ? <p className="experience__ending">你看到的世界，属于你吗？</p> : <p>摄像头已关闭。画面没有被保存。</p>}
            <div className="experience__controls">
              <button type="button" className="experience__button" onClick={startCamera}>
                重新开始
              </button>
            </div>
          </section>
        )}

        {status === 'error' && (
          <section className="experience__panel" role="alert">
            <p className="experience__error">{errorMessage}</p>
            <div className="experience__controls">
              <button type="button" className="experience__button" onClick={startCamera}>
                重新开始
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

export default App
