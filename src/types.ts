// 工艺图层类型
export type LayerType = 'holo' | 'gold' | 'silver' | 'uv' | 'emboss' | 'deboss'

export const LAYER_INFO: Record<LayerType, { name: string; color: string; desc: string }> = {
  holo:   { name: '镭射膜',   color: '#c26bff', desc: '薄膜干涉彩虹效果,随视角变色' },
  gold:   { name: '烫金',     color: '#d4a017', desc: '金属反光,带细微拉丝纹理' },
  silver: { name: '烫银',     color: '#b8c0c8', desc: '银色金属反光,带细微拉丝纹理' },
  uv:     { name: '局部UV',   color: '#3fa9f5', desc: '高亮光油,与哑膜区域形成对比' },
  emboss: { name: '击凸',     color: '#e0635a', desc: '向上凸起,侧光下有立体阴影' },
  deboss: { name: '压凹',     color: '#5a9de0', desc: '向下凹陷,侧光下有立体阴影' },
}

export const ALL_LAYERS: LayerType[] = ['holo', 'gold', 'silver', 'uv', 'emboss', 'deboss']

// 卡面图片的摆放变换
export interface ArtTransform {
  scale: number   // 1 = 铺满
  x: number       // -1..1 归一化偏移
  y: number
}

export interface CardFace {
  id: string
  name: string
  artDataUrl: string | null                 // 卡面图
  artTransform: ArtTransform
  layers: Record<LayerType, string | null>  // 各工艺蒙版 dataURL
  filmThickness: number                     // 镭射膜厚 nm
}

export interface Order {
  id: string
  name: string
  customer: string
  note: string
  createdAt: number
  cards: CardFace[]
}

export type EnvPreset = 'studio' | 'window' | 'spotlight'

export const ENV_INFO: Record<EnvPreset, string> = {
  studio: '摄影棚柔光',
  window: '窗边自然光',
  spotlight: '展会射灯',
}

export interface CardSize {
  name: string
  w: number // mm
  h: number // mm
}

export const CARD_SIZES: CardSize[] = [
  { name: '扑克牌 63×88', w: 63, h: 88 },
  { name: '塔罗牌 70×120', w: 70, h: 120 },
  { name: '游戏王 59×86', w: 59, h: 86 },
  { name: '方形 88×88', w: 88, h: 88 },
]

export interface AppSettings {
  cardW: number          // mm
  cardH: number          // mm
  thickness: number      // mm 卡纸厚度
  env: EnvPreset
  filmThickness: number  // 默认镭射膜厚 nm
  brushSize: number      // px (蒙版画布坐标)
  renderScale: number    // 渲染分辨率倍数
}

export const DEFAULT_SETTINGS: AppSettings = {
  cardW: 63,
  cardH: 88,
  thickness: 0.8,
  env: 'studio',
  filmThickness: 480,
  brushSize: 40,
  renderScale: 2,
}

export function newCard(name: string, filmThickness: number): CardFace {
  return {
    id: crypto.randomUUID(),
    name,
    artDataUrl: null,
    artTransform: { scale: 1, x: 0, y: 0 },
    layers: { holo: null, gold: null, silver: null, uv: null, emboss: null, deboss: null },
    filmThickness,
  }
}

export function newOrder(name: string, customer: string): Order {
  return {
    id: crypto.randomUUID(),
    name,
    customer,
    note: '',
    createdAt: Date.now(),
    cards: [],
  }
}
