import { useRef, useState } from 'react'
import { useStore, useSelectedCard } from '../store'
import { ENV_INFO, EnvPreset } from '../types'
import { CardSelector } from '../components/CardSelector'
import { CardPreview } from '../components/CardPreview'
import { CardRenderer } from '../gl/renderer'
import { Orbit } from '../gl/camera'
import { peekCardMasks } from '../gl/masks'
import { downloadDataUrl, exportPrepressPdf } from '../utils/export'

const ENVS: EnvPreset[] = ['studio', 'window', 'spotlight']

/** 三维预览:轨道旋转、环境光切换、导出效果图 / 印前 PDF */
export function PreviewPage() {
  const { order, card } = useSelectedCard()
  const { settings, updateSettings } = useStore()
  const rendererRef = useRef<CardRenderer | null>(null)
  const [orbit, setOrbit] = useState<Orbit>({ yaw: 0.45, pitch: 0.3, dist: 1.6 })
  const [msg, setMsg] = useState('')

  if (!order || !card) {
    return (
      <div className="page">
        <div className="page-head"><h2>三维预览</h2><CardSelector /></div>
        <div className="empty">请先选择订单和卡面。</div>
      </div>
    )
  }

  const exportPng = () => {
    const r = rendererRef.current
    if (!r) return
    downloadDataUrl(r.snapshot(), `${order.name}_${card.name}_效果图.png`)
  }

  const exportPdf = () => {
    const r = rendererRef.current
    if (!r) return
    exportPrepressPdf(order, card, settings, r.snapshot(), peekCardMasks(card.id) ?? null)
    setMsg('PDF 已导出(含工艺版标注)')
    setTimeout(() => setMsg(''), 3000)
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>三维预览</h2>
        <CardSelector />
      </div>

      <div className="preview-grid">
        <div className="preview-main">
          <CardPreview
            card={card}
            settings={settings}
            className="main-preview"
            orbit={orbit}
            onOrbitChange={setOrbit}
            rendererRef={rendererRef}
          />
          <div className="dim" style={{ textAlign: 'center', marginTop: 6 }}>
            拖动旋转 · 滚轮缩放 · 同一角度渲染结果完全一致
          </div>
        </div>

        <div className="panel">
          <label>环境光</label>
          <div className="row wrap">
            {ENVS.map((e) => (
              <button
                key={e}
                className={settings.env === e ? 'primary' : ''}
                onClick={() => updateSettings({ env: e })}
              >
                {ENV_INFO[e]}
              </button>
            ))}
          </div>

          <label>视角</label>
          <div className="row wrap">
            <button onClick={() => setOrbit({ yaw: 0, pitch: 0.0001, dist: 1.6 })}>正面</button>
            <button onClick={() => setOrbit({ yaw: 0.9, pitch: 0.5, dist: 1.6 })}>侧光位</button>
            <button onClick={() => setOrbit({ yaw: Math.PI, pitch: 0.2, dist: 1.6 })}>背面</button>
            <button onClick={() => setOrbit({ yaw: 0.45, pitch: 0.3, dist: 1.6 })}>复位</button>
          </div>

          <label>导出</label>
          <div className="row wrap">
            <button className="primary" onClick={exportPng}>导出效果图 PNG</button>
            <button className="primary" onClick={exportPdf}>导出印前 PDF</button>
          </div>
          {msg && <div className="msg">{msg}</div>}
          <div className="dim" style={{ marginTop: 8 }}>
            PDF 含效果图、工艺清单和每个工艺图层的黑白工艺版(黑=工艺区域)。
          </div>
        </div>
      </div>
    </div>
  )
}
