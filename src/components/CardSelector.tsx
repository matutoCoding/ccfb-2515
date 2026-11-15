import { useStore } from '../store'

/** 订单/卡面选择器,编辑、图层、预览页共用 */
export function CardSelector() {
  const { orders, selectedOrderId, selectedCardId, select } = useStore()
  const order = orders.find((o) => o.id === selectedOrderId)
  return (
    <div className="row">
      <select
        value={selectedOrderId ?? ''}
        onChange={(e) => select(e.target.value || null, null)}
      >
        <option value="">选择订单…</option>
        {orders.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
      <select
        value={selectedCardId ?? ''}
        disabled={!order}
        onChange={(e) => select(selectedOrderId, e.target.value || null)}
      >
        <option value="">选择卡面…</option>
        {order?.cards.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  )
}
