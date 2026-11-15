import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  AppSettings, CardFace, DEFAULT_SETTINGS, LayerType, Order,
  newCard, newOrder,
} from './types'

export type PageId = 'orders' | 'edit' | 'layers' | 'preview' | 'settings'

interface AppState {
  orders: Order[]
  settings: AppSettings
  page: PageId
  selectedOrderId: string | null
  selectedCardId: string | null

  setPage: (p: PageId) => void
  select: (orderId: string | null, cardId?: string | null) => void
  updateSettings: (s: Partial<AppSettings>) => void

  addOrder: (name: string, customer: string) => void
  updateOrder: (id: string, patch: Partial<Pick<Order, 'name' | 'customer' | 'note'>>) => void
  deleteOrder: (id: string) => void

  addCard: (orderId: string, name?: string) => void
  updateCard: (orderId: string, cardId: string, patch: Partial<CardFace>) => void
  deleteCard: (orderId: string, cardId: string) => void
  setCardArt: (orderId: string, cardId: string, dataUrl: string | null) => void
  setLayerMask: (orderId: string, cardId: string, layer: LayerType, dataUrl: string | null) => void

  exportAll: () => string
  importAll: (json: string) => { ok: boolean; error?: string }
  clearAll: () => void
}

function mapOrder(orders: Order[], id: string, fn: (o: Order) => Order): Order[] {
  return orders.map((o) => (o.id === id ? fn(o) : o))
}
function mapCard(orders: Order[], oid: string, cid: string, fn: (c: CardFace) => CardFace): Order[] {
  return mapOrder(orders, oid, (o) => ({
    ...o,
    cards: o.cards.map((c) => (c.id === cid ? fn(c) : c)),
  }))
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      orders: [],
      settings: { ...DEFAULT_SETTINGS },
      page: 'orders',
      selectedOrderId: null,
      selectedCardId: null,

      setPage: (page) => set({ page }),
      select: (orderId, cardId = null) =>
        set({ selectedOrderId: orderId, selectedCardId: cardId }),
      updateSettings: (s) => set((st) => ({ settings: { ...st.settings, ...s } })),

      addOrder: (name, customer) => {
        const o = newOrder(name, customer)
        set((st) => ({ orders: [...st.orders, o], selectedOrderId: o.id }))
      },
      updateOrder: (id, patch) =>
        set((st) => ({ orders: mapOrder(st.orders, id, (o) => ({ ...o, ...patch })) })),
      deleteOrder: (id) =>
        set((st) => ({
          orders: st.orders.filter((o) => o.id !== id),
          selectedOrderId: st.selectedOrderId === id ? null : st.selectedOrderId,
          selectedCardId: st.selectedOrderId === id ? null : st.selectedCardId,
        })),

      addCard: (orderId, name) => {
        const st = get()
        const order = st.orders.find((o) => o.id === orderId)
        if (!order) return
        const card = newCard(name ?? `卡面 ${order.cards.length + 1}`, st.settings.filmThickness)
        set((s) => ({
          orders: mapOrder(s.orders, orderId, (o) => ({ ...o, cards: [...o.cards, card] })),
          selectedCardId: card.id,
        }))
      },
      updateCard: (orderId, cardId, patch) =>
        set((st) => ({ orders: mapCard(st.orders, orderId, cardId, (c) => ({ ...c, ...patch })) })),
      deleteCard: (orderId, cardId) =>
        set((st) => ({
          orders: mapOrder(st.orders, orderId, (o) => ({
            ...o,
            cards: o.cards.filter((c) => c.id !== cardId),
          })),
          selectedCardId: st.selectedCardId === cardId ? null : st.selectedCardId,
        })),
      setCardArt: (orderId, cardId, dataUrl) =>
        set((st) => ({
          orders: mapCard(st.orders, orderId, cardId, (c) => ({ ...c, artDataUrl: dataUrl })),
        })),
      setLayerMask: (orderId, cardId, layer, dataUrl) =>
        set((st) => ({
          orders: mapCard(st.orders, orderId, cardId, (c) => ({
            ...c,
            layers: { ...c.layers, [layer]: dataUrl },
          })),
        })),

      exportAll: () => {
        const { orders, settings } = get()
        return JSON.stringify({ version: 1, exportedAt: Date.now(), settings, orders }, null, 2)
      },
      importAll: (json) => {
        try {
          const data = JSON.parse(json)
          if (!data || !Array.isArray(data.orders)) return { ok: false, error: '文件格式不正确:缺少 orders 数组' }
          for (const o of data.orders) {
            if (!o.id || !Array.isArray(o.cards)) return { ok: false, error: '订单数据不完整' }
          }
          set({
            orders: data.orders,
            settings: data.settings ? { ...DEFAULT_SETTINGS, ...data.settings } : get().settings,
            selectedOrderId: null,
            selectedCardId: null,
          })
          return { ok: true }
        } catch (e) {
          return { ok: false, error: 'JSON 解析失败:' + String(e) }
        }
      },
      clearAll: () =>
        set({ orders: [], selectedOrderId: null, selectedCardId: null, settings: { ...DEFAULT_SETTINGS } }),
    }),
    {
      name: 'card-finish-preview-v1',
      partialize: (s) => ({
        orders: s.orders,
        settings: s.settings,
        selectedOrderId: s.selectedOrderId,
        selectedCardId: s.selectedCardId,
      }),
    },
  ),
)

// 便捷选择器
export function useSelectedCard(): { order: Order | null; card: CardFace | null } {
  const { orders, selectedOrderId, selectedCardId } = useStore()
  const order = orders.find((o) => o.id === selectedOrderId) ?? null
  const card = order?.cards.find((c) => c.id === selectedCardId) ?? null
  return { order, card }
}
