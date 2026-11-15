import { useEffect, useRef, useState } from 'react'
import { useStore, useSelectedCard } from '../store'
import { CardSelector } from '../components/CardSelector'

/** 卡面编辑:导入卡面图、调整位置缩放、设置镭射膜厚 */
export function EditorPage() {
  const { order, card } = useSelectedCard()
  const { settings, setCardArt, updateCard, setPage } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const [imgAspect, setImgAspect] = useState(1)

  const artUrl = card?.artDataUrl ?? null
  useEffect(() => {
    if (!artUrl) return
    const img = new Image()
    img.onload = () => setImgAspect(img.width / img.height)
    img.src = artUrl
  }, [artUrl])

  if (!order || !card) {
    return (
      <div className="page">
        <div className="page-head"><h2>卡面编辑</h2><CardSelector /></div>
        <div className="empty">请先选择订单和卡面(或到「订单列表」新建)。</div>
      </div>
    )
  }

  const tf = card.artTransform
  const cardAspect = settings.cardW / settings.cardH

  const onFile = (f: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setCardArt(order.id, card.id, String(reader.result))
      updateCard(order.id, card.id, { artTransform: { scale: 1, x: 0, y: 0 } })
    }
    reader.readAsDataURL(f)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    try {
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* 忽略 */
    }
    dragRef.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    const el = previewRef.current
    if (!d || !el) return
    const rect = el.getBoundingClientRect()
    const dx = (e.clientX - d.x) / rect.width
    const dy = (e.clientY - d.y) / rect.height
    dragRef.current = { x: e.clientX, y: e.clientY }
    updateCard(order.id, card.id, {
      artTransform: {
        ...tf,
        x: Math.max(-1, Math.min(1, tf.x + dx)),
        y: Math.max(-1, Math.min(1, tf.y - dy)),
      },
    })
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>卡面编辑</h2>
        <CardSelector />
      </div>

      <div className="editor-grid">
        <div>
          <div
            ref={previewRef}
            className="art-preview"
            style={{ aspectRatio: `${settings.cardW} / ${settings.cardH}` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (dragRef.current = null)}
            onPointerCancel={() => (dragRef.current = null)}
          >
            {card.artDataUrl ? (
              <img
                src={card.artDataUrl}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  // cover 布局,与着色器采样一致
                  ...(imgAspect > cardAspect
                    ? { height: '100%', width: 'auto' }
                    : { width: '100%', height: 'auto' }),
                  left: `calc(50% + ${tf.x * 100}%)`,
                  top: `calc(50% - ${tf.y * 100}%)`,
                  transform: `translate(-50%, -50%) scale(${tf.scale})`,
                  transformOrigin: 'center',
                }}
              />
            ) : (
              <span className="dim">点击右侧「导入卡面图」</span>
            )}
          </div>
          <div className="dim" style={{ marginTop: 8, textAlign: 'center' }}>
            拖动图片调整位置 · 实际效果以三维预览为准
          </div>
        </div>

        <div className="panel">
          <label>卡面名称</label>
          <input value={card.name} onChange={(e) => updateCard(order.id, card.id, { name: e.target.value })} />

          <label>卡面图</label>
          <div className="row">
            <button className="primary" onClick={() => fileRef.current?.click()}>导入卡面图</button>
            {card.artDataUrl && (
              <button onClick={() => setCardArt(order.id, card.id, null)}>移除</button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFile(f)
              e.target.value = ''
            }}
          />

          <label>缩放 {tf.scale.toFixed(2)}×</label>
          <input
            type="range" min="1" max="3" step="0.01" value={tf.scale}
            onChange={(e) =>
              updateCard(order.id, card.id, { artTransform: { ...tf, scale: Number(e.target.value) } })
            }
          />
          <button onClick={() => updateCard(order.id, card.id, { artTransform: { scale: 1, x: 0, y: 0 } })}>
            重置位置
          </button>

          <label>镭射膜厚 {card.filmThickness} nm(影响彩虹颜色)</label>
          <input
            type="range" min="300" max="700" step="5" value={card.filmThickness}
            onChange={(e) => updateCard(order.id, card.id, { filmThickness: Number(e.target.value) })}
          />

          <div className="dim" style={{ marginTop: 12 }}>
            卡面尺寸 {settings.cardW}×{settings.cardH} mm(在「设置」中修改)
          </div>
          <button className="primary" style={{ marginTop: 12 }} onClick={() => setPage('layers')}>
            下一步:标注工艺图层 →
          </button>
        </div>
      </div>
    </div>
  )
}
