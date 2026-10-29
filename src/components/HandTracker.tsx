import { useEffect, useState } from 'react'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import './HandTracker.css'

export type HandPoint = { x: number; y: number }

export type HandGesture = {
  point: HandPoint
  pinchDistance: number
  pinchCenter: HandPoint
  triangle: {
    thumb: HandPoint
    index: HandPoint
    palm: HandPoint
  }
  isPinch: boolean
  isFist: boolean
  isIndexOnly: boolean
  rotation: number
}

type HandTrackerProps = {
  stream: MediaStream
  onGestureChange?: (gestures: HandGesture[]) => void
}

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

export function HandTracker({ stream, onGestureChange }: HandTrackerProps) {
  const [status, setStatus] = useState('正在加载手部识别…')

  useEffect(() => {
    let cancelled = false
    let animationFrame = 0
    const smoothedPoints: Array<HandPoint | null> = []
    const indexOnlyScores: number[] = []
    const pinchScores: number[] = []
    const stableGestures: HandGesture[] = []
    let trackerVideo: HTMLVideoElement | null = null
    let handLandmarker: HandLandmarker | null = null

    async function startTracking() {
      try {
        trackerVideo = document.createElement('video')
        trackerVideo.autoplay = true
        trackerVideo.playsInline = true
        trackerVideo.muted = true
        trackerVideo.srcObject = stream

        const vision = await FilesetResolver.forVisionTasks(WASM_URL)
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.55,
        })

        await trackerVideo.play()
        if (cancelled) return
        setStatus('未检测到手')

        const detect = () => {
          if (cancelled || !trackerVideo || !handLandmarker) return

          if (trackerVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const result = handLandmarker.detectForVideo(trackerVideo, performance.now())
            const rawGestures = result.landmarks
              .map((landmarks, index) => createGesture(landmarks, index, smoothedPoints, indexOnlyScores, pinchScores))
              .sort((first, second) => first.pinchCenter.x - second.pinchCenter.x)
            const gestures = rawGestures.map((gesture, index) => {
              const previous = stableGestures[index]
              const smoothed = previous ? smoothGesture(previous, gesture) : gesture
              stableGestures[index] = smoothed
              return smoothed
            })
            stableGestures.length = gestures.length

            if (gestures.length > 0) {
              onGestureChange?.(gestures)
              setStatus(gestures.length === 2 ? '已检测到双手 · 正在连接隐藏世界' : gestures[0].isPinch ? '拇指食指并拢 · 控制隐藏窗口' : '移动手掌控制隐藏窗口')
            } else {
              stableGestures.length = 0
              onGestureChange?.([])
              setStatus('未检测到手')
            }
          }

          animationFrame = requestAnimationFrame(detect)
        }

        animationFrame = requestAnimationFrame(detect)
      } catch (error) {
        console.error('Hand tracking failed:', error)
        if (!cancelled) setStatus('手部识别加载失败，请刷新页面重试')
      }
    }

    void startTracking()

    return () => {
      cancelled = true
      cancelAnimationFrame(animationFrame)
      handLandmarker?.close()
      if (trackerVideo) {
        trackerVideo.pause()
        trackerVideo.srcObject = null
      }
    }
  }, [onGestureChange, stream])

  return <div className="hand-tracker__status">{status}</div>
}

function createGesture(
  landmarks: Array<{ x: number; y: number }>,
  handIndex: number,
  smoothedPoints: Array<HandPoint | null>,
  indexOnlyScores: number[],
  pinchScores: number[],
): HandGesture {
  const thumb = landmarks[4]
  const index = landmarks[8]
  const middle = landmarks[12]
  const wrist = landmarks[0]
  const pinchDistance = Math.hypot(thumb.x - index.x, thumb.y - index.y)
  const nextPoint = { x: 1 - index.x, y: index.y }
  const previousPoint = smoothedPoints[handIndex]
  const trackedPoint = previousPoint
    ? {
        x: previousPoint.x + (nextPoint.x - previousPoint.x) * 0.45,
        y: previousPoint.y + (nextPoint.y - previousPoint.y) * 0.45,
      }
    : nextPoint
  smoothedPoints[handIndex] = trackedPoint

  const indexExtended = isFingerExtended(landmarks[8], landmarks[6], wrist)
  const middleExtended = isFingerExtended(landmarks[12], landmarks[10], wrist)
  const ringExtended = isFingerExtended(landmarks[16], landmarks[14], wrist)
  const pinkyExtended = isFingerExtended(landmarks[20], landmarks[18], wrist)
  const thumbExtended = distance(thumb, wrist) > distance(landmarks[2], wrist) * 1.12
  const rawIndexOnly = indexExtended && !middleExtended && !ringExtended && !pinkyExtended && !thumbExtended
  const rawPinch = pinchDistance < 0.105 && !middleExtended && !ringExtended && !pinkyExtended
  indexOnlyScores[handIndex] = rawIndexOnly ? Math.min(6, (indexOnlyScores[handIndex] ?? 0) + 1) : Math.max(0, (indexOnlyScores[handIndex] ?? 0) - 1)
  pinchScores[handIndex] = rawPinch ? Math.min(6, (pinchScores[handIndex] ?? 0) + 1) : Math.max(0, (pinchScores[handIndex] ?? 0) - 1)

  const averageTipDistance =
    (distance(landmarks[8], wrist) + distance(landmarks[12], wrist) + distance(landmarks[16], wrist) + distance(landmarks[20], wrist)) / 4
  const pinchCenter = { x: 1 - (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 }

  return {
    point: trackedPoint,
    pinchDistance,
    pinchCenter,
    triangle: {
      thumb: { x: 1 - thumb.x, y: thumb.y },
      index: { x: 1 - index.x, y: index.y },
      palm: { x: 1 - landmarks[9].x, y: landmarks[9].y },
    },
    isPinch: (pinchScores[handIndex] ?? 0) >= 2,
    isFist: averageTipDistance < 0.34,
    isIndexOnly: (indexOnlyScores[handIndex] ?? 0) >= 2,
    rotation: Math.atan2(middle.y - wrist.y, middle.x - wrist.x),
  }
}

function distance(first: { x: number; y: number }, second: { x: number; y: number }) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

function isFingerExtended(
  fingertip: { x: number; y: number },
  pip: { x: number; y: number },
  wrist: { x: number; y: number },
) {
  return distance(fingertip, wrist) > distance(pip, wrist) * 1.08
}

function smoothGesture(previous: HandGesture, next: HandGesture): HandGesture {
  const mixPoint = (first: HandPoint, second: HandPoint): HandPoint => ({
    x: first.x + (second.x - first.x) * 0.3,
    y: first.y + (second.y - first.y) * 0.3,
  })
  return {
    ...next,
    point: mixPoint(previous.point, next.point),
    pinchCenter: mixPoint(previous.pinchCenter, next.pinchCenter),
    triangle: {
      thumb: mixPoint(previous.triangle.thumb, next.triangle.thumb),
      index: mixPoint(previous.triangle.index, next.triangle.index),
      palm: mixPoint(previous.triangle.palm, next.triangle.palm),
    },
    pinchDistance: previous.pinchDistance + (next.pinchDistance - previous.pinchDistance) * 0.3,
    rotation: previous.rotation + (next.rotation - previous.rotation) * 0.3,
  }
}
