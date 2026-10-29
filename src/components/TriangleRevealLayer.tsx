import { useEffect, useRef, useState } from 'react'
import type { HandGesture, HandPoint } from './HandTracker'
import type { Mood } from './EmotionTracker'
import './TriangleRevealLayer.css'

type Point = { x: number; y: number }
type TriangleRevealLayerProps = { gestures: HandGesture[]; mood: Mood }

const worlds = [
  { id: 'deepSea', color: '#39d9ff', images: ['/worlds/deep-sea-a.jpeg', '/worlds/deep-sea-b.png', '/worlds/deep-sea-c.jpeg'] },
  { id: 'forest', color: '#91ff9b', images: ['/worlds/forest-a.jpeg', '/worlds/forest-b.jpeg', '/worlds/forest-c.jpeg'] },
  { id: 'nebula', color: '#d09bff', images: ['/worlds/cosmic-a.jpeg', '/worlds/cosmic-b.jpeg', '/worlds/cosmic-c.jpeg'] },
  { id: 'glitchCity', color: '#ff68cf', images: ['/worlds/glitch-city-a.jpeg', '/worlds/glitch-city-b.jpeg', '/worlds/glitch-city-c.jpeg'] },
  { id: 'memory', color: '#ffd28a', images: ['/worlds/blurred-memory-a.jpeg', '/worlds/blurred-memory-b.jpeg', '/worlds/blurred-memory-c.jpeg'] },
]

const moodWorlds: Record<Mood, string[]> = {
  calm: ['deepSea', 'forest', 'memory'],
  open: ['forest', 'nebula', 'deepSea'],
  curious: ['nebula', 'deepSea', 'glitchCity'],
  tense: ['glitchCity', 'nebula', 'memory'],
}

export function TriangleRevealLayer({ gestures, mood }: TriangleRevealLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gesturesRef = useRef<HandGesture[]>(gestures)
  const activeRef = useRef(false)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const colorRef = useRef('#d09bff')
  const opacityRef = useRef(0)
  const usedCaptionsRef = useRef(new Set<string>())
  const captionTimerRef = useRef<number | null>(null)
  const [caption, setCaption] = useState('')

  gesturesRef.current = gestures

  useEffect(() => {
    if (gestures.some((gesture) => gesture.isPinch) && !activeRef.current) {
      const allowed = moodWorlds[mood]
      const candidates = worlds.filter((world) => allowed.includes(world.id))
      const world = candidates[Math.floor(Math.random() * candidates.length)]
      const image = new Image()
      image.src = world.images[Math.floor(Math.random() * world.images.length)]
      imageRef.current = image
      colorRef.current = world.color
      activeRef.current = true
      const nextCaption = createUniqueCaption(mood, world.id, usedCaptionsRef.current)
      setCaption(nextCaption)
      if (captionTimerRef.current) window.clearTimeout(captionTimerRef.current)
      captionTimerRef.current = window.setTimeout(() => setCaption(''), 4200)
    }
    if (gestures.length === 0) activeRef.current = false
  }, [gestures, mood])

  useEffect(() => () => {
    if (captionTimerRef.current) window.clearTimeout(captionTimerRef.current)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const scratch = document.createElement('canvas')
    const scratchContext = scratch.getContext('2d')
    if (!scratchContext) return

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(window.innerWidth * ratio)
      canvas.height = Math.floor(window.innerHeight * ratio)
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      scratch.width = Math.floor(window.innerWidth * ratio)
      scratch.height = Math.floor(window.innerHeight * ratio)
      scratchContext.setTransform(ratio, 0, 0, ratio, 0, 0)
    }

    resize()
    window.addEventListener('resize', resize)
    let frame = 0
    const draw = (time: number) => {
      const currentGestures = gesturesRef.current
      opacityRef.current += ((activeRef.current ? 1 : 0) - opacityRef.current) * 0.14
      context.clearRect(0, 0, window.innerWidth, window.innerHeight)

      if (currentGestures.length > 0 && opacityRef.current > 0.01 && imageRef.current?.complete && imageRef.current.naturalWidth > 0) {
        const path = currentGestures.length >= 2
          ? createDoubleHandPolygon(currentGestures[0], currentGestures[1], time)
          : createIrregularTriangle(currentGestures[0].triangle, time)

        scratchContext.clearRect(0, 0, window.innerWidth, window.innerHeight)
        scratchContext.globalCompositeOperation = 'source-over'
        drawCover(scratchContext, imageRef.current, window.innerWidth, window.innerHeight)
        scratchContext.globalCompositeOperation = 'destination-in'
        scratchContext.fillStyle = '#fff'
        drawPath(scratchContext, path)
        scratchContext.fill()
        scratchContext.globalCompositeOperation = 'source-over'

        context.save()
        context.globalAlpha = opacityRef.current
        context.drawImage(scratch, 0, 0, window.innerWidth, window.innerHeight)
        context.shadowColor = colorRef.current
        context.shadowBlur = currentGestures.length >= 2 ? 34 : 26
        context.strokeStyle = `${colorRef.current}cc`
        context.lineWidth = currentGestures.length >= 2 ? 3.5 : 2.5
        drawPath(context, path)
        context.stroke()
        context.shadowBlur = 0
        context.strokeStyle = 'rgba(255, 255, 255, 0.7)'
        context.lineWidth = 0.7
        drawPath(context, path)
        context.stroke()
        context.restore()
      }

      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <>
      <canvas ref={canvasRef} className="triangle-reveal-layer" aria-hidden="true" />
      {caption && <div className="triangle-reveal-layer__caption">{caption}</div>}
    </>
  )
}

function createDoubleHandPolygon(first: HandGesture, second: HandGesture, time: number) {
  const firstThumb = toScreenPoint(first.triangle.thumb)
  const firstIndex = toScreenPoint(first.triangle.index)
  const secondThumb = toScreenPoint(second.triangle.thumb)
  const secondIndex = toScreenPoint(second.triangle.index)
  const firstOuter = firstThumb.x < firstIndex.x ? firstThumb : firstIndex
  const firstInner = firstThumb.x < firstIndex.x ? firstIndex : firstThumb
  const secondInner = secondThumb.x < secondIndex.x ? secondThumb : secondIndex
  const secondOuter = secondThumb.x < secondIndex.x ? secondIndex : secondThumb
  return createIrregularPolygon([firstOuter, firstInner, secondInner, secondOuter], time)
}

function createIrregularTriangle(triangle: HandGesture['triangle'], time: number) {
  return createIrregularPolygon([toScreenPoint(triangle.thumb), toScreenPoint(triangle.index), toScreenPoint(triangle.palm)], time)
}

function createIrregularPolygon(points: Point[], time: number) {
  const result: Point[] = []
  points.forEach((from, index) => {
    const to = points[(index + 1) % points.length]
    result.push(from)
    const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
    const dx = to.x - from.x
    const dy = to.y - from.y
    const length = Math.max(1, Math.hypot(dx, dy))
    const wobble = Math.sin(time / 420 + index * 2.1) * Math.min(16, length * 0.08)
    result.push({ x: midpoint.x - (dy / length) * wobble, y: midpoint.y + (dx / length) * wobble })
  })
  return result
}

function toScreenPoint(point: HandPoint): Point {
  return { x: point.x * window.innerWidth, y: point.y * window.innerHeight }
}

function drawPath(context: CanvasRenderingContext2D, points: Point[]) {
  context.beginPath()
  context.moveTo(points[0].x, points[0].y)
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y))
  context.closePath()
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
}

function createUniqueCaption(mood: Mood, world: string, used: Set<string>) {
  const subjects: Record<Mood, string[]> = {
    calm: ['你打开的', '这一刻显露的', '被安静保存的', '从现实背后浮出的'],
    open: ['正在向你展开的', '被你的双手唤醒的', '回应着你的', '终于找到入口的'],
    curious: ['等待你发现的', '藏在下一层的', '刚刚开始靠近的', '尚未说完的'],
    tense: ['正在偏移的', '被你触碰后失衡的', '藏在噪声里的', '无法继续伪装的'],
  }
  const worldsById: Record<string, string[]> = {
    deepSea: ['深海', '潮汐', '沉默的水域'],
    forest: ['森林', '生长的阴影', '未命名的植物'],
    nebula: ['星云', '远处的宇宙', '没有边界的夜空'],
    glitchCity: ['故障城市', '闪烁的街道', '失去同步的城市'],
    memory: ['旧日记忆', '模糊的房间', '没有被说出的过去'],
  }
  const endings = ['正在看着你。', '只为这一次出现。', '比你想象的更接近。', '还没有准备好消失。', '在等待你再次打开。']

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const subject = pick(subjects[mood])
    const worldName = pick(worldsById[world] ?? ['另一个世界'])
    const ending = pick(endings)
    const result = `${subject}${worldName}${ending}`
    if (!used.has(result)) {
      used.add(result)
      return result
    }
  }

  const fallback = `${pick(subjects[mood])}${pick(worldsById[world] ?? ['另一个世界'])}在此刻短暂显现。`
  used.add(fallback)
  return fallback
}

function pick<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)]
}
