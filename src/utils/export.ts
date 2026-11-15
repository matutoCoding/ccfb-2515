import { jsPDF } from 'jspdf'
import { ALL_LAYERS, AppSettings, CardFace, LAYER_INFO, Order } from '../types'
import { CardMasks } from '../gl/masks'

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

export function downloadText(text: string, filename: string, mime = 'application/json') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** 蒙版 → 白底黑稿(印前工艺版) */
function maskPlateDataUrl(maskCanvas: HTMLCanvasElement): string {
  const c = document.createElement('canvas')
  c.width = maskCanvas.width
  c.height = maskCanvas.height
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  // 白色笔刷蒙版 → 黑色:先画蒙版,再用 source-in 填黑
  const tmp = document.createElement('canvas')
  tmp.width = c.width
  tmp.height = c.height
  const tctx = tmp.getContext('2d')!
  tctx.drawImage(maskCanvas, 0, 0)
  tctx.globalCompositeOperation = 'source-in'
  tctx.fillStyle = '#000000'
  tctx.fillRect(0, 0, tmp.width, tmp.height)
  ctx.drawImage(tmp, 0, 0)
  return c.toDataURL('image/png')
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_')

/**
 * 导出印前 PDF:
 *  第 1 页:效果图 + 订单/工艺标注
 *  后续页:每个非空工艺图层一张黑白工艺版
 */
export function exportPrepressPdf(
  order: Order | null,
  card: CardFace,
  settings: AppSettings,
  previewPng: string,
  masks: CardMasks | null,
) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = 210
  const margin = 15
  let y = margin

  // jsPDF 默认字体不支持中文,标注用拼音/英文 + 图形,避免乱码
  pdf.setFontSize(16)
  pdf.text('Card Finish Spec Sheet', margin, y)
  y += 9
  pdf.setFontSize(10)
  const lines = [
    `Order: ${order?.name ?? '-'}    Customer: ${order?.customer ?? '-'}`,
    `Card: ${card.name}    Size: ${settings.cardW} x ${settings.cardH} mm`,
    `Holographic film thickness: ${card.filmThickness} nm`,
    `Finishes: ${ALL_LAYERS.filter((l) => card.layers[l]).map((l) => LAYER_INFO[l].name).join(' / ') || '(none)'}`,
    `Exported: ${new Date().toLocaleString()}`,
  ]
  for (const ln of lines) {
    pdf.text(ln, margin, y)
    y += 5.5
  }
  y += 2

  // 效果图(保持卡面比例)
  const imgW = pageW - margin * 2
  const imgH = (imgW * settings.cardH) / settings.cardW
  const drawH = Math.min(imgH, 280 - y)
  const drawW = (drawH * settings.cardW) / settings.cardH
  pdf.addImage(previewPng, 'PNG', (pageW - drawW) / 2, y, drawW, drawH)

  // 工艺版页面
  if (masks) {
    for (const layer of ALL_LAYERS) {
      const lc = masks.layerCanvases.get(layer)
      if (!lc || masks.layerEmpty(layer)) continue
      pdf.addPage()
      pdf.setFontSize(14)
      pdf.text(`Plate: ${LAYER_INFO[layer].name} (${layer})`, margin, margin)
      pdf.setFontSize(10)
      pdf.text(`Card: ${card.name}    black = finish area`, margin, margin + 6)
      const plate = maskPlateDataUrl(lc)
      const pw = pageW - margin * 2
      const ph = pw // 蒙版是正方形
      pdf.addImage(plate, 'PNG', margin, margin + 12, pw, ph)
      // 卡面轮廓参考框
      const cw = pw * (settings.cardW / Math.max(settings.cardW, settings.cardH))
      const ch = pw * (settings.cardH / Math.max(settings.cardW, settings.cardH))
      pdf.setDrawColor(255, 0, 0)
      pdf.rect(margin + (pw - cw) / 2, margin + 12 + (ph - ch) / 2, cw, ch)
    }
  }

  pdf.save(`${safe(order?.name ?? 'order')}_${safe(card.name)}_spec.pdf`)
}
