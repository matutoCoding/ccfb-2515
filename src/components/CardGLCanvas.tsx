import { useEffect, useRef, useState } from 'react'
import { CardRenderer, RenderParams } from '../gl/renderer'
import { Orbit } from '../gl/camera'

export interface CardGLHandle {
  renderer: CardRenderer
  render: (p: RenderParams) => void
}

interface Props {
  className?: string
  interactive?: boolean
  initialOrbit?: Orbit
  /** 参数变化时由父组件触发渲染;组件内部拖动也会调用 */
  onFrame: (renderer: CardRenderer, orbit: Orbit) => void
  onOrbitChange?: (orbit: Orbit) => void
  orbit?: Orbit // 受控模式
  renderScale?: number
}

/**
 * WebGL2 卡片画布:负责渲染循环(按需渲染,拖动时逐帧)和轨道交互。
 * 渲染内容完全由 onFrame 回调里的参数决定,保证确定性。
 */
export function CardGLCanvas({
  className, interactive = true, initialOrbit, onFrame, onOrbitChange, orbit, renderScale = 2,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<CardRenderer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const orbitRef = useRef<Orbit>(initialOrbit ?? { yaw: 0.45, pitch: 0.3, dist: 1.6 })
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef(0)

  const currentOrbit = () => orbit ?? orbitRef.current

  const schedule = () => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const r = rendererRef.current
      if (!r) return
      r.resize(renderScale)
      onFrame(r, currentOrbit())
    })
  }
  const scheduleRef = useRef(schedule)
  scheduleRef.current = schedule

  useEffect(() => {
    try {
      rendererRef.current = new CardRenderer(canvasRef.current!)
      scheduleRef.current()
    } catch (e) {
      setError(String(e))
    }
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 父组件参数变化 → 重渲染
  useEffect(() => {
    schedule()
  })

  useEffect(() => {
    const onResize = () => scheduleRef.current()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const setOrbit = (o: Orbit) => {
    if (!orbit) orbitRef.current = o
    onOrbitChange?.(o)
    schedule()
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive) return
    try {
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* 忽略 */
    }
    dragRef.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || !interactive) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    dragRef.current = { x: e.clientX, y: e.clientY }
    const o = currentOrbit()
    setOrbit({
      ...o,
      yaw: o.yaw + dx * 0.008,
      pitch: Math.max(-1.45, Math.min(1.45, o.pitch + dy * 0.008)),
    })
  }
  const onPointerUp = () => {
    dragRef.current = null
  }
  const onWheel = (e: React.WheelEvent) => {
    if (!interactive) return
    const o = currentOrbit()
    setOrbit({ ...o, dist: Math.max(0.6, Math.min(4, o.dist * (1 + e.deltaY * 0.001))) })
  }

  if (error) {
    return <div className={`gl-error ${className ?? ''}`}>{error}</div>
  }
  return (
    <canvas
      ref={canvasRef}
      className={`gl-canvas ${className ?? ''}`}
      style={{ touchAction: 'none', cursor: interactive ? 'grab' : 'default' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    />
  )
}
