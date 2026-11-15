import { useRef, useState } from 'react'
import { useStore } from '../store'
import { ALL_LAYERS, LAYER_INFO } from '../types'
import { downloadText } from '../utils/export'
import { clearMaskCache } from '../gl/masks'

export function OrdersPage() {
  const { orders, addOrder, updateOrder, deleteOrder, addCard, deleteCard, select, setPage, exportAll, importAll } =
    useStore()
  const [newName, setNewName] = useState('')
  const [newCustomer, setNewCustomer] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const onImport = async (f: File) => {
    const text = await f.text()
    const r = importAll(text)
    if (r.ok) {
      clearMaskCache()
      setMsg('导入成功')
    } else {
      setMsg('导入失败:' + r.error)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>订单列表</h2>
        <div className="row">
          <button onClick={() => downloadText(exportAll(), `卡牌工艺订单_${new Date().toISOString().slice(0, 10)}.json`)}>
            导出全部数据
          </button>
          <button onClick={() => fileRef.current?.click()}>导入数据</button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onImport(f)
              e.target.value = ''
            }}
          />
        </div>
      </div>
      {msg && <div className="msg">{msg}</div>}

      <div className="card-box">
        <div className="row">
          <input placeholder="订单名称,如:某游戏 SSR 卡第一批" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input placeholder="客户名称" value={newCustomer} onChange={(e) => setNewCustomer(e.target.value)} />
          <button
            className="primary"
            disabled={!newName.trim()}
            onClick={() => {
              addOrder(newName.trim(), newCustomer.trim())
              setNewName('')
              setNewCustomer('')
            }}
          >
            + 新建订单
          </button>
        </div>
      </div>

      {orders.length === 0 && <div className="empty">还没有订单,先建一个吧。</div>}

      {orders.map((o) => (
        <div key={o.id} className="card-box">
          <div className="row space-between">
            <div className="row" style={{ flex: 1, minWidth: 0 }}>
              <input
                className="title-input"
                value={o.name}
                onChange={(e) => updateOrder(o.id, { name: e.target.value })}
              />
              <input
                className="sub-input"
                value={o.customer}
                placeholder="客户"
                onChange={(e) => updateOrder(o.id, { customer: e.target.value })}
              />
              <span className="dim">{o.cards.length} 张卡面</span>
            </div>
            <div className="row">
              <button onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
                {expanded === o.id ? '收起' : '展开卡面'}
              </button>
              <button
                className="danger"
                onClick={() => {
                  if (confirm(`删除订单「${o.name}」及其全部卡面?`)) deleteOrder(o.id)
                }}
              >
                删除
              </button>
            </div>
          </div>

          {expanded === o.id && (
            <div className="card-list">
              <div className="row">
                <button className="primary" onClick={() => addCard(o.id)}>
                  + 添加卡面
                </button>
              </div>
              {o.cards.map((c) => (
                <div key={c.id} className="card-item">
                  {c.artDataUrl ? (
                    <img src={c.artDataUrl} alt="" className="thumb" />
                  ) : (
                    <div className="thumb placeholder">未导入</div>
                  )}
                  <div className="card-item-info">
                    <b>{c.name}</b>
                    <span className="dim">
                      {ALL_LAYERS.filter((l) => c.layers[l])
                        .map((l) => LAYER_INFO[l].name)
                        .join(' · ') || '未标注工艺'}
                    </span>
                  </div>
                  <div className="row">
                    <button onClick={() => { select(o.id, c.id); setPage('edit') }}>卡面编辑</button>
                    <button onClick={() => { select(o.id, c.id); setPage('layers') }}>工艺图层</button>
                    <button className="primary" onClick={() => { select(o.id, c.id); setPage('preview') }}>
                      三维预览
                    </button>
                    <button
                      className="danger"
                      onClick={() => {
                        if (confirm(`删除卡面「${c.name}」?`)) deleteCard(o.id, c.id)
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
              {o.cards.length === 0 && <div className="dim">这个订单还没有卡面。</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
