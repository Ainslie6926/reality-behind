import { useEffect, useRef } from 'react'
import type { HandGesture } from './HandTracker'
import './RiftLayer.css'

type Point = { x: number; y: number }
type Rift = {
  points: Point[]
  world: string
  color: string
  label: string
  image: HTMLImageElement
  width: number
  rotation: number
  closingAt?: number
}
type RiftLayerProps = { point: Point | null; gesture: HandGesture | null }

const worlds = [
  { world: 'deepSea', color: '#39d9ff', label: '深海', images: ['/worlds/deep-sea-a.jpeg', '/worlds/deep-sea-b.png', '/worlds/deep-sea-c.jpeg'] },
  { world: 'forest', color: '#91ff9b', label: '神秘森林', images: ['/worlds/forest-a.jpeg', '/worlds/forest-b.jpeg', '/worlds/forest-c.jpeg'] },
  { world: 'nebula', color: '#d09bff', label: '宇宙星云', images: ['/worlds/cosmic-a.jpeg', '/worlds/cosmic-b.jpeg', '/worlds/cosmic-c.jpeg'] },
  { world: 'glitchCity', color: '#ff68cf', label: '故障城市', images: ['/worlds/glitch-city-a.jpeg', '/worlds/glitch-city-b.jpeg', '/worlds/glitch-city-c.jpeg'] },
  { world: 'memory', color: '#ffd28a', label: '模糊记忆', images: ['/worlds/blurred-memory-a.jpeg', '/worlds/blurred-memory-b.jpeg', '/worlds/blurred-memory-c.jpeg'] },
]

export function RiftLayer({ point, gesture }: RiftLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const riftsRef = useRef<Rift[]>([])
  const drawingRiftRef = useRef<Rift | null>(null)
  const selectedRiftRef = useRef<Rift | null>(null)
  const pinchRiftRef = useRef<Rift | null>(null)
  const pinchStartDistanceRef = useRef(0)
  const pinchStartCenterRef = useRef<Point | null>(null)
  const wasDrawingRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(window.innerWidth * ratio)
      canvas.height = Math.floor(window.innerHeight * ratio)
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    if (!point) {
      wasDrawingRef.current = false
      drawingRiftRef.current = null
      pinchRiftRef.current = null
      pinchStartCenterRef.current = null
      return
    }

    const current = { x: point.x * window.innerWidth, y: point.y * window.innerHeight }
    let drawingRift = drawingRiftRef.current
    if (gesture?.isIndexOnly) {
      if (!wasDrawingRef.current || !drawingRift) {
        const world = worlds[Math.floor(Math.random() * worlds.length)]
        const image = new Image()
        image.src = world.images[Math.floor(Math.random() * world.images.length)]
        drawingRift = { points: [], world: world.world, color: world.color, label: world.label, image, width: 24, rotation: 0 }
        riftsRef.current = [...riftsRef.current.slice(-5), drawingRift]
        drawingRiftRef.current = drawingRift
        selectedRiftRef.current = drawingRift
      }

      const previous = drawingRift.points.at(-1)
      if (!previous || Math.hypot(current.x - previous.x, current.y - previous.y) > 3.5) {
        drawingRift.points = [...drawingRift.points.slice(-160), current]
      }
      wasDrawingRef.current = true
    } else {
      wasDrawingRef.current = false
      drawingRiftRef.current = null
    }

    if (gesture?.isPinch) {
      if (!pinchRiftRef.current) {
        pinchRiftRef.current = findNearestRift(riftsRef.current, gesture.pinchCenter)
        pinchStartDistanceRef.current = gesture.pinchDistance
        pinchStartCenterRef.current = gesture.pinchCenter
      }
      const selected = pinchRiftRef.current
      if (selected) {
        selectedRiftRef.current = selected
        selected.rotation = gesture.rotation
      }
    } else if (gesture && pinchRiftRef.current && !gesture.isFist && !gesture.isIndexOnly) {
      const selected = pinchRiftRef.current
      const gap = Math.max(0, gesture.pinchDistance)
      const dragDistance = pinchStartCenterRef.current
        ? Math.hypot(gesture!.pinchCenter.x - pinchStartCenterRef.current.x, gesture!.pinchCenter.y - pinchStartCenterRef.current.y)
        : 0
      const gapProgress = Math.max(0, gap - pinchStartDistanceRef.current)
      const spread = Math.min(1, gapProgress * 8 + dragDistance * 1.1)
      selected.width = Math.max(selected.width, Math.min(230, 24 + spread * 206))
      selected.rotation = gesture.rotation
    } else if (gesture?.isFist) {
      const selected = pinchRiftRef.current ?? selectedRiftRef.current ?? findNearestRift(riftsRef.current, current)
      if (selected && selected.points.length > 2 && !selected.closingAt) {
        selected.closingAt = performance.now()
      }
      pinchRiftRef.current = null
      pinchStartCenterRef.current = null
    } else if (!gesture?.isIndexOnly) {
      selectedRiftRef.current = null
    } else {
      selectedRiftRef.current = drawingRiftRef.current
    }
  }, [gesture, point])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const scratch = document.createElement('canvas')
    const scratchContext = scratch.getContext('2d')
    if (!scratchContext) return

    let frame = 0
    const draw = (time: number) => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      if (scratch.width !== Math.floor(window.innerWidth * ratio) || scratch.height !== Math.floor(window.innerHeight * ratio)) {
        scratch.width = Math.floor(window.innerWidth * ratio)
        scratch.height = Math.floor(window.innerHeight * ratio)
        scratchContext.setTransform(ratio, 0, 0, ratio, 0, 0)
      }

      context.clearRect(0, 0, window.innerWidth, window.innerHeight)
      context.lineCap = 'round'
      context.lineJoin = 'round'
      riftsRef.current = riftsRef.current.filter((rift) => !rift.closingAt || time - rift.closingAt < 700)

      riftsRef.current.forEach((rift, riftIndex) => {
        const path = rift.points
        if (path.length < 2) return
        const closingProgress = rift.closingAt ? Math.min(1, (time - rift.closingAt) / 700) : 0
        const currentWidth = rift.width * (1 - closingProgress)
        context.save()
        context.globalAlpha = 1 - closingProgress

        if (rift.image.complete && rift.image.naturalWidth > 0 && currentWidth > 0) {
          scratchContext.clearRect(0, 0, window.innerWidth, window.innerHeight)
          scratchContext.globalCompositeOperation = 'source-over'
          drawCover(scratchContext, rift.image, window.innerWidth, window.innerHeight)
          scratchContext.globalCompositeOperation = 'destination-in'
          scratchContext.lineCap = 'round'
          scratchContext.lineJoin = 'round'
          scratchContext.lineWidth = currentWidth
          drawPath(scratchContext, path)
          scratchContext.stroke()
          scratchContext.globalCompositeOperation = 'source-over'
          context.drawImage(scratch, 0, 0, window.innerWidth, window.innerHeight)
        }

        context.shadowColor = rift.color
        context.shadowBlur = 28
        context.strokeStyle = `${rift.color}88`
        context.lineWidth = Math.max(4, currentWidth)
        drawPath(context, path)
        context.stroke()
        context.shadowBlur = 15
        context.strokeStyle = rift.color
        context.lineWidth = Math.max(0.8, currentWidth * 0.14)
        drawPath(context, path)
        context.stroke()
        context.shadowBlur = 0
        context.strokeStyle = 'rgba(255, 255, 255, 0.9)'
        context.lineWidth = 0.8
        drawPath(context, path)
        context.stroke()
        drawWorldParticles(context, rift, time, riftIndex)
        context.restore()
      })

      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [])

  return <canvas ref={canvasRef} className="rift-layer" aria-hidden="true" />
}

function findNearestRift(rifts: Rift[], point: Point) {
  let nearest: Rift | null = null
  let nearestDistance = 180
  rifts.forEach((rift) => {
    if (rift.closingAt || rift.points.length === 0) return
    const distance = rift.points.reduce((minimum, item) => Math.min(minimum, Math.hypot(item.x - point.x, item.y - point.y)), Infinity)
    if (distance < nearestDistance) {
      nearest = rift
      nearestDistance = distance
    }
  })
  return nearest
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
}

function drawPath(context: CanvasRenderingContext2D, path: Point[]) {
  context.beginPath()
  context.moveTo(path[0].x, path[0].y)
  if (path.length === 2) {
    context.lineTo(path[1].x, path[1].y)
    return
  }
  for (let index = 1; index < path.length - 1; index += 1) {
    const current = path[index]
    const next = path[index + 1]
    context.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2)
  }
  const last = path[path.length - 1]
  context.lineTo(last.x, last.y)
}

function drawWorldParticles(context: CanvasRenderingContext2D, rift: Rift, time: number, riftIndex: number) {
  const count = Math.min(24, Math.floor(rift.points.length / 8))
  for (let index = 0; index < count; index += 1) {
    const source = rift.points[(index * 7 + Math.floor(time / 80) + riftIndex * 11) % rift.points.length]
    const phase = time / 500 + index + rift.rotation
    const distance = 12 + ((index * 17) % 30) + Math.sin(phase) * 6
    let x = source.x + Math.cos(phase) * distance
    let y = source.y + Math.sin(phase) * distance
    if (rift.world === 'deepSea') y += Math.sin(phase * 0.7) * 10
    if (rift.world === 'forest') x += Math.sin(phase * 1.8) * 8
    if (rift.world === 'nebula') { x += Math.cos(phase * 1.5) * 16; y += Math.sin(phase * 1.5) * 16 }
    if (rift.world === 'glitchCity') { x = Math.round(x / 5) * 5; y = Math.round(y / 5) * 5 }
    if (rift.world === 'memory') { x += Math.sin(phase * 0.4) * 18; y += Math.cos(phase * 0.4) * 8 }
    context.fillStyle = `${rift.color}${rift.world === 'memory' ? '99' : 'cc'}`
    context.fillRect(x, y, rift.world === 'glitchCity' ? 4 : 3, rift.world === 'glitchCity' ? 4 : 3)
  }
}
