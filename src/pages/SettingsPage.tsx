import { useRef, useState } from 'react'
import { useStore } from '../store'
import { CARD_SIZES, ENV_INFO, EnvPreset } from '../types'
import { downloadText } from '../utils/export'
import { clearMaskCache } from '../gl/masks'

export function SettingsPage() {
  const { settings, updateSettings, exportAll, importAll, clearAll } = useStore()
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const sizeMatch = CARD_SIZES.find((s) => s.w === settings.cardW && s.h === settings.cardH)

  const flash = (t: string) => {
    setMsg(t)
    setTimeout(() => setMsg(''), 3000)
  }

  return (
    <div className="page">
      <div className="page-head"><h2>设置</h2></div>
      {msg && <div className="msg">{msg}</div>}

      <div className="settings-grid">
        <div className="panel">
          <h3>卡面规格</h3>
          <label>常用尺寸</label>
          <div className="row wrap">
            {CARD_SIZES.map((s) => (
              <button
                key={s.name}
                className={sizeMatch === s ? 'primary' : ''}
                onClick={() => updateSettings({ cardW: s.w, cardH: s.h })}
              >
                {s.name}
              </button>
            ))}
          </div>
          <label>宽 {settings.cardW} mm</label>
          <input type="range" min="40" max="150" value={settings.cardW}
            onChange={(e) => updateSettings({ cardW: Number(e.target.value) })} />
          <label>高 {settings.cardH} mm</label>
          <input type="range" min="40" max="150" value={settings.cardH}
            onChange={(e) => updateSettings({ cardH: Number(e.target.value) })} />
          <label>卡纸厚度 {settings.thickness.toFixed(1)} mm</label>
          <input type="range" min="0.2" max="2" step="0.1" value={settings.thickness}
            onChange={(e) => updateSettings({ thickness: Number(e.target.value) })} />
        </div>

        <div className="panel">
          <h3>渲染</h3>
          <label>默认环境光</label>
          <div className="row wrap">
            {(Object.keys(ENV_INFO) as EnvPreset[]).map((e) => (
              <button key={e} className={settings.env === e ? 'primary' : ''}
                onClick={() => updateSettings({ env: e })}>
                {ENV_INFO[e]}
              </button>
            ))}
          </div>
          <label>默认镭射膜厚 {settings.filmThickness} nm(新建卡面时生效)</label>
          <input type="range" min="300" max="700" step="5" value={settings.filmThickness}
            onChange={(e) => updateSettings({ filmThickness: Number(e.target.value) })} />
          <label>渲染精度 {settings.renderScale.toFixed(1)}×(高了更细腻,低了更流畅)</label>
          <input type="range" min="1" max="3" step="0.5" value={settings.renderScale}
            onChange={(e) => updateSettings({ renderScale: Number(e.target.value) })} />
          <label>默认笔刷 {settings.brushSize}px</label>
          <input type="range" min="4" max="160" value={settings.brushSize}
            onChange={(e) => updateSettings({ brushSize: Number(e.target.value) })} />
        </div>

        <div className="panel">
          <h3>数据</h3>
          <div className="dim">所有订单和卡面都保存在本浏览器(localStorage),可导出备份。</div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button onClick={() => downloadText(exportAll(), `卡牌工艺订单_${new Date().toISOString().slice(0, 10)}.json`)}>
              导出全部数据
            </button>
            <button onClick={() => fileRef.current?.click()}>导入数据</button>
            <button
              className="danger"
              onClick={() => {
                if (confirm('清空全部订单和设置?此操作不可恢复!')) {
                  clearAll()
                  clearMaskCache()
                  flash('已清空')
                }
              }}
            >
              清空全部数据
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              const r = importAll(await f.text())
              if (r.ok) {
                clearMaskCache()
                flash('导入成功')
              } else {
                flash('导入失败:' + r.error)
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}
