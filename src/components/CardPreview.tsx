import { useEffect, useRef, useState } from 'react'
import { AppSettings, CardFace } from '../types'
import { CardRenderer } from '../gl/renderer'
import { Orbit } from '../gl/camera'
import { CardMasks, getCardMasks } from '../gl/masks'
import { CardGLCanvas } from './CardGLCanvas'

interface Props {
  card: CardFace
  settings: AppSettings
  className?: string
  interactive?: boolean
  orbit?: Orbit
  initialOrbit?: Orbit
  onOrbitChange?: (o: Orbit) => void
  /** 父组件保存 renderer 引用,用于导出截图 */
  rendererRef?: React.MutableRefObject<CardRenderer | null>
  /** 蒙版被外部修改时递增,触发纹理重传 */
  maskTick?: number
}

/** 高阶组件:把卡面数据(图片+工艺蒙版)接到 WebGL 画布上 */
export function CardPreview({
  card, settings, className, interactive, orbit, initialOrbit, onOrbitChange, rendererRef,
}: Props) {
  const [artImg, setArtImg] = useState<HTMLImageElement | null>(null)
  const [masks, setMasks] = useState<CardMasks | null>(null)
  const uploaded = useRef({ artUrl: '', maskVer: -1 })

  useEffect(() => {
    setArtImg(null)
    if (!card.artDataUrl) return
    const img = new Image()
    img.onload = () => setArtImg(img)
    img.src = card.artDataUrl
  }, [card.artDataUrl])

  useEffect(() => {
    let alive = true
    getCardMasks(card).then((m) => {
      if (alive) setMasks(m)
    })
    return () => {
      alive = false
    }
  }, [card])

  return (
    <CardGLCanvas
      className={className}
      interactive={interactive}
      orbit={orbit}
      initialOrbit={initialOrbit}
      onOrbitChange={onOrbitChange}
      renderScale={settings.renderScale}
      onFrame={(r, o) => {
        if (rendererRef) rendererRef.current = r
        if (masks && uploaded.current.maskVer !== masks.version) {
          r.setMasks(masks.maskAData, masks.maskH)
          uploaded.current.maskVer = masks.version
        }
        if (artImg && uploaded.current.artUrl !== card.artDataUrl) {
          r.setArt(artImg)
          uploaded.current.artUrl = card.artDataUrl ?? ''
        }
        r.render({
          orbit: o,
          env: settings.env,
          filmD: card.filmThickness,
          artTf: card.artTransform,
          hasArt: !!artImg,
          artAspect: artImg ? artImg.width / artImg.height : 1,
          cardW: settings.cardW,
          cardH: settings.cardH,
          thickness: settings.thickness,
          embossK: 5,
        })
      }}
    />
  )
}
