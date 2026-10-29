import { useEffect, useRef } from 'react'
import './CameraLayer.css'

type CameraLayerProps = {
  stream: MediaStream | null
}

export function CameraLayer({ stream }: CameraLayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.srcObject = stream

    if (stream) {
      void video.play().catch(() => {
        // Autoplay can fail if the tab is backgrounded; the user can retry.
      })
    }

    return () => {
      video.srcObject = null
    }
  }, [stream])

  if (!stream) return null

  return (
    <video
      ref={videoRef}
      className="camera-layer"
      autoPlay
      playsInline
      muted
      disablePictureInPicture
    />
  )
}
