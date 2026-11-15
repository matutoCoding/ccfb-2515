import { ALL_LAYERS, CardFace, LayerType } from '../types'
import { MASK_SIZE } from './renderer'

/**
 * 每张卡的工艺蒙版集合:
 *  - 每个图层一张 1024² 画布(白色笔刷,alpha 即蒙版值)
 *  - maskA: R=镭射 G=烫金 B=烫银 A=局部UV
 *  - maskH: R=击凸 G=压凹,经高斯模糊供法线计算
 */
export class CardMasks {
  layerCanvases = new Map<LayerType, HTMLCanvasElement>()
  /** R=镭射 G=烫金 B=烫银 A=局部UV,原始像素(行 0 = 纹理 v=0 = 画布底部) */
  maskAData: Uint8Array = new Uint8Array(MASK_SIZE * MASK_SIZE * 4)
  maskH: HTMLCanvasElement
  /** 每次 rebuild 递增,供 React 触发纹理更新 */
  version = 0

  constructor() {
    this.maskH = document.createElement('canvas')
    this.maskH.width = this.maskH.height = MASK_SIZE
  }

  static async load(card: CardFace): Promise<CardMasks> {
    const m = new CardMasks()
    await Promise.all(
      ALL_LAYERS.map(async (layer) => {
        const url = card.layers[layer]
        if (!url) return
        const img = await loadImage(url)
        const c = document.createElement('canvas')
        c.width = c.height = MASK_SIZE
        c.getContext('2d')!.drawImage(img, 0, 0, MASK_SIZE, MASK_SIZE)
        m.layerCanvases.set(layer, c)
      }),
    )
    m.rebuild()
    return m
  }

  getLayer(layer: LayerType): HTMLCanvasElement {
    let c = this.layerCanvases.get(layer)
    if (!c) {
      c = document.createElement('canvas')
      c.width = c.height = MASK_SIZE
      this.layerCanvases.set(layer, c)
    }
    return c
  }

  clearLayer(layer: LayerType) {
    const c = this.getLayer(layer)
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
  }

  layerEmpty(layer: LayerType): boolean {
    const c = this.layerCanvases.get(layer)
    if (!c) return true
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    for (let i = 3; i < d.length; i += 16 * 4) if (d[i] > 0) return false
    return true
  }

  /** 重新打包 maskA / maskH */
  rebuild() {
    const S = MASK_SIZE
    // maskA:逐像素合通道,直接写原始数组(绕开 canvas 预乘 alpha 会清零 RGB 的坑)
    const channels: [LayerType, number][] = [['holo', 0], ['gold', 1], ['silver', 2], ['uv', 3]]
    const srcs = channels.map(([layer]) => {
      const c = this.layerCanvases.get(layer)
      return c ? c.getContext('2d')!.getImageData(0, 0, S, S).data : null
    })
    const px = this.maskAData
    for (let r = 0; r < S; r++) {
      const dstRow = (S - 1 - r) * S // 翻转到纹理坐标,v=0 在底部
      const srcRow = r * S
      for (let c = 0; c < S; c++) {
        const si = (srcRow + c) * 4
        const di = (dstRow + c) * 4
        for (let ch = 0; ch < 4; ch++) {
          const s = srcs[ch]
          px[di + ch] = s ? s[si + 3] : 0 // 取 alpha
        }
      }
    }

    // maskH:R=击凸 G=压凹
    const outH = new ImageData(S, S)
    const emb = this.layerCanvases.get('emboss')
    const deb = this.layerCanvases.get('deboss')
    const eD = emb ? emb.getContext('2d')!.getImageData(0, 0, S, S).data : null
    const dD = deb ? deb.getContext('2d')!.getImageData(0, 0, S, S).data : null
    const hp = outH.data
    for (let i = 0, n = S * S; i < n; i++) {
      hp[i * 4] = eD ? eD[i * 4 + 3] : 0
      hp[i * 4 + 1] = dD ? dD[i * 4 + 3] : 0
      hp[i * 4 + 3] = 255
    }
    const hctx = this.maskH.getContext('2d')!
    hctx.putImageData(outH, 0, 0)
    // 模糊让法线过渡平滑(支持 filter 的浏览器;不支持则保持硬边)
    try {
      const tmp = document.createElement('canvas')
      tmp.width = tmp.height = S
      const tctx = tmp.getContext('2d')!
      tctx.filter = 'blur(2px)'
      tctx.drawImage(this.maskH, 0, 0)
      hctx.clearRect(0, 0, S, S)
      hctx.drawImage(tmp, 0, 0)
    } catch {
      /* 忽略,使用未模糊版本 */
    }
    this.version++
  }

  /** 导出某图层的 dataURL(空图层返回 null) */
  layerDataUrl(layer: LayerType): string | null {
    if (this.layerEmpty(layer)) return null
    return this.getLayer(layer).toDataURL('image/png')
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = url
  })
}

// ---- 全局缓存:cardId → CardMasks ----
const cache = new Map<string, CardMasks>()
const loading = new Map<string, Promise<CardMasks>>()

export async function getCardMasks(card: CardFace): Promise<CardMasks> {
  const hit = cache.get(card.id)
  if (hit) return hit
  const inflight = loading.get(card.id)
  if (inflight) return inflight
  const p = CardMasks.load(card).then((m) => {
    cache.set(card.id, m)
    loading.delete(card.id)
    return m
  })
  loading.set(card.id, p)
  return p
}

export function peekCardMasks(cardId: string): CardMasks | undefined {
  return cache.get(cardId)
}

export function invalidateCardMasks(cardId: string) {
  cache.delete(cardId)
}

export function clearMaskCache() {
  cache.clear()
}
