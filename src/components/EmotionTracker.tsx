import { useEffect } from 'react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

export type Mood = 'calm' | 'open' | 'curious' | 'tense'

type EmotionTrackerProps = {
  stream: MediaStream
  onMoodChange: (mood: Mood) => void
}

const WASM_URL = '/models/wasm'
const MODEL_URL = '/models/face_landmarker.task'

export function EmotionTracker({ stream, onMoodChange }: EmotionTrackerProps) {
  useEffect(() => {
    let cancelled = false
    let animationFrame = 0
    let video: HTMLVideoElement | null = null
    let faceLandmarker: FaceLandmarker | null = null
    let previousMood: Mood | null = null

    async function start() {
      try {
        video = document.createElement('video')
        video.autoplay = true
        video.playsInline = true
        video.muted = true
        video.srcObject = stream

        const vision = await FilesetResolver.forVisionTasks(WASM_URL)
        faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          minFaceDetectionConfidence: 0.45,
          minFacePresenceConfidence: 0.45,
          minTrackingConfidence: 0.45,
        })

        await video.play()
        if (cancelled) return

        const detect = () => {
          if (cancelled || !video || !faceLandmarker) return
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const result = faceLandmarker.detectForVideo(video, performance.now())
            const categories = result.faceBlendshapes[0]?.categories ?? []
            const value = (name: string) => categories.find((category) => category.categoryName === name)?.score ?? 0
            const smile = (value('mouthSmileLeft') + value('mouthSmileRight')) / 2
            const browDown = (value('browDownLeft') + value('browDownRight')) / 2
            const eyeSquint = (value('eyeSquintLeft') + value('eyeSquintRight')) / 2
            const eyeWide = (value('eyeWideLeft') + value('eyeWideRight')) / 2
            const jawOpen = value('jawOpen')
            const mood = classifyMood({ smile, browDown, eyeSquint, eyeWide, jawOpen })
            if (mood !== previousMood) {
              previousMood = mood
              onMoodChange(mood)
            }
          }
          animationFrame = requestAnimationFrame(detect)
        }

        animationFrame = requestAnimationFrame(detect)
      } catch (error) {
        console.warn('Emotion tracking unavailable:', error)
      }
    }

    void start()
    return () => {
      cancelled = true
      cancelAnimationFrame(animationFrame)
      faceLandmarker?.close()
      if (video) {
        video.pause()
        video.srcObject = null
      }
    }
  }, [onMoodChange, stream])

  return null
}

function classifyMood(values: { smile: number; browDown: number; eyeSquint: number; eyeWide: number; jawOpen: number }): Mood {
  if (values.browDown + values.eyeSquint > 0.58) return 'tense'
  if (values.smile > 0.34) return 'open'
  if (values.eyeWide > 0.38 || values.jawOpen > 0.36) return 'curious'
  return 'calm'
}
