import { useEffect, useRef, useState } from 'react'
import { useStore, useSelectedCard } from '../store'
import { ALL_LAYERS, LAYER_INFO, LayerType } from '../types'
import { CardSelector } from '../components/CardSelector'
import { CardPreview } from '../components/CardPreview'
import { CardMasks, getCardMasks } from '../gl/masks'
import { MASK_SIZE } from '../gl/renderer'

/** 工艺图层:在卡面上画/擦各工艺区域 */
export function LayersPage() {
  const { order, card } = useSelectedCard()
  const { settings, setLayerMask, setPage } = useStore()
  const [masks, setMasks] = useState<CardMasks | null>(null)
  const [active, setActive] = useState<LayerType>('holo')
  const [erase, setErase] = useState(false)
  const [brush, setBrush] = useState(settings.brushSize)
  const [visible, setVisible] = useState<Record<LayerType, boolean>>({
    holo: true, gold: true, silver: true, uv: true, emboss: true, deboss: true,
  })
  const [tick, setTick] = useState(0)
  const displayRef = useRef<HTMLCanvasElement>(null)
  const artImgRef = useRef<HTMLImageElement | null>(null)
  const paintingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const saveTimer = useRef(0)

  // 加载蒙版集合
  useEffect(() => {
    setMasks(null)
    if (!card) return
    let alive = true
    getCardMasks(card).then((m) => {
      if (alive) setMasks(m)
    })
    return () => {
      alive = false
    }
  }, [card])

  // 加载卡面图用于底图显示
  useEffect(() => {
    artImgRef.current = null
    if (!card?.artDataUrl) return
    const img = new Image()
    img.onload = () => {
      artImgRef.current = img
      redrawRef.current()
    }
    img.src = card.artDataUrl
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.artDataUrl])

  const tintCache = useRef(new Map<LayerType, { v: number; c: HTMLCanvasElement }>())
  // 始终指向最新 redraw,避免异步回调(img.onload / Promise)拿到旧闭包
  const redrawRef = useRef<() => void>(() => {})

  /** 重绘 2D 合成视图 */
  const redraw = () => {
    const canvas = displayRef.current
    if (!canvas || !card) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)
    // 底图(cover + transform,与着色器一致)
    ctx.fillStyle = '#f5f5f3'
    ctx.fillRect(0, 0, W, H)
    const img = artImgRef.current
    if (img) {
      const ai = img.width / img.height
      const ac = W / H
      const tf = card.artTransform
      let dw: number, dh: number
      if (ai > ac) {
        dh = H
        dw = H * ai
      } else {
        dw = W
        dh = W / ai
      }
      dw *= tf.scale
      dh *= tf.scale
      ctx.drawImage(img, (W - dw) / 2 + tf.x * W, (H - dh) / 2 - tf.y * H, dw, dh)
    }
    // 各图层着色叠加
    if (masks) {
      for (const layer of ALL_LAYERS) {
        if (!visible[layer]) continue
        const lc = masks.layerCanvases.get(layer)
        if (!lc) continue
        let t = tintCache.current.get(layer)
        if (!t || t.v !== masks.version) {
          const c = document.createElement('canvas')
          c.width = c.height = MASK_SIZE
          const cctx = c.getContext('2d')!
          cctx.drawImage(lc, 0, 0)
          cctx.globalCompositeOperation = 'source-in'
          cctx.fillStyle = LAYER_INFO[layer].color
          cctx.fillRect(0, 0, MASK_SIZE, MASK_SIZE)
          t = { v: masks.version, c }
          tintCache.current.set(layer, t)
        }
        ctx.globalAlpha = layer === active ? 0.65 : 0.3
        ctx.drawImage(t.c, 0, 0, W, H)
        ctx.globalAlpha = 1
      }
    }
    // 边框
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1)
  }
  redrawRef.current = redraw

  useEffect(() => {
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masks, visible, active, card, tick])

  if (!order || !card) {
    return (
      <div className="page">
        <div className="page-head"><h2>工艺图层</h2><CardSelector /></div>
        <div className="empty">请先选择订单和卡面。</div>
      </div>
    )
  }

  const toMaskCoords = (e: React.PointerEvent) => {
    const rect = displayRef.current!.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * MASK_SIZE,
      y: ((e.clientY - rect.top) / rect.height) * MASK_SIZE,
    }
  }

  const strokeTo = (x: number, y: number) => {
    if (!masks) return
    const lc = masks.getLayer(active)
    const ctx = lc.getContext('2d')!
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = brush
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over'
    ctx.strokeStyle = '#ffffff'
    const last = lastRef.current
    ctx.beginPath()
    if (last) ctx.moveTo(last.x, last.y)
    else ctx.moveTo(x, y)
    ctx.lineTo(x, y)
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
    lastRef.current = { x, y }
  }

  const scheduleSave = () => {
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      if (!masks) return
      for (const layer of ALL_LAYERS) {
        setLayerMask(order.id, card.id, layer, masks.layerDataUrl(layer))
      }
    }, 800)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    try {
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* 合成事件或指针已释放时忽略 */
    }
    paintingRef.current = true
    lastRef.current = null
    const p = toMaskCoords(e)
    strokeTo(p.x, p.y)
    redraw()
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!paintingRef.current) return
    const p = toMaskCoords(e)
    strokeTo(p.x, p.y)
    redraw()
  }
  const onPointerUp = () => {
    if (!paintingRef.current) return
    paintingRef.current = false
    lastRef.current = null
    masks?.rebuild()
    tintCache.current.clear()
    setTick((t) => t + 1)
    scheduleSave()
  }

  const clearActive = () => {
    if (!masks) return
    if (!confirm(`清空「${LAYER_INFO[active].name}」图层?`)) return
    masks.clearLayer(active)
    masks.rebuild()
    tintCache.current.clear()
    setTick((t) => t + 1)
    scheduleSave()
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>工艺图层</h2>
        <CardSelector />
      </div>

      <div className="layers-grid">
        <div className="panel">
          <label>工艺图层(点击切换)</label>
          {ALL_LAYERS.map((l) => (
            <div
              key={l}
              className={`layer-item ${active === l ? 'active' : ''}`}
              onClick={() => setActive(l)}
            >
              <span className="swatch" style={{ background: LAYER_INFO[l].color }} />
              <div className="layer-info">
                <b>{LAYER_INFO[l].name}</b>
                <span className="dim">{LAYER_INFO[l].desc}</span>
              </div>
              <input
                type="checkbox"
                checked={visible[l]}
                title="显示/隐藏"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setVisible({ ...visible, [l]: e.target.checked })}
              />
            </div>
          ))}

          <label style={{ marginTop: 12 }}>笔刷大小 {brush}px</label>
          <input type="range" min="4" max="160" value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
          <div className="row">
            <button className={!erase ? 'primary' : ''} onClick={() => setErase(false)}>画</button>
            <button className={erase ? 'primary' : ''} onClick={() => setErase(true)}>擦</button>
            <button className="danger" onClick={clearActive}>清空本层</button>
          </div>
          <div className="dim" style={{ marginTop: 8 }}>
            在卡面上涂抹「{LAYER_INFO[active].name}」区域,右侧实时预览效果。
          </div>
          <button className="primary" style={{ marginTop: 12 }} onClick={() => setPage('preview')}>
            下一步:三维预览 →
          </button>
        </div>

        <div className="paint-area">
          <canvas
            ref={displayRef}
            width={700}
            height={Math.round((700 * settings.cardH) / settings.cardW)}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{ touchAction: 'none', cursor: 'crosshair' }}
          />
        </div>

        <div className="preview-side">
          <label>实时效果(可拖动旋转)</label>
          <CardPreview
            card={card}
            settings={settings}
            className="side-preview"
            maskTick={tick}
            initialOrbit={{ yaw: 0.5, pitch: 0.35, dist: 1.5 }}
          />
        </div>
      </div>
    </div>
  )
}
