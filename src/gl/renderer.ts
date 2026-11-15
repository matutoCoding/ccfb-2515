import { FRAG_SRC, VERT_SRC } from './shaders'
import { lookAt, orbitEye, Orbit, perspective } from './camera'
import { ArtTransform, EnvPreset } from '../types'

export const MASK_SIZE = 1024 // 蒙版分辨率

export interface RenderParams {
  orbit: Orbit
  env: EnvPreset
  filmD: number
  artTf: ArtTransform
  hasArt: boolean
  artAspect: number
  cardW: number // mm
  cardH: number // mm
  thickness: number // mm
  embossK: number
}

const ENV_INDEX: Record<EnvPreset, number> = { studio: 0, window: 1, spotlight: 2 }

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('着色器编译失败: ' + gl.getShaderInfoLog(s))
  }
  return s
}

// 圆角卡片盒体:前面/背面/四条边,共 6 面
function buildBox(w: number, h: number, t: number) {
  const hw = w / 2, hh = h / 2, ht = t / 2
  const pos: number[] = []
  const nrm: number[] = []
  const uv: number[] = []
  const tan: number[] = []
  const face: number[] = []
  const idx: number[] = []

  function quad(
    corners: number[][], normal: number[], uvs: number[][], tangent: number[], f: number,
  ) {
    const base = pos.length / 3
    for (let i = 0; i < 4; i++) {
      pos.push(...corners[i])
      nrm.push(...normal)
      uv.push(...uvs[i])
      tan.push(...tangent)
      face.push(f)
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  // 前面 (+z),uv(0,0) 在左下
  quad(
    [[-hw, -hh, ht], [hw, -hh, ht], [hw, hh, ht], [-hw, hh, ht]],
    [0, 0, 1],
    [[0, 0], [1, 0], [1, 1], [0, 1]],
    [1, 0, 0],
    0,
  )
  // 背面 (-z)
  quad(
    [[hw, -hh, -ht], [-hw, -hh, -ht], [-hw, hh, -ht], [hw, hh, -ht]],
    [0, 0, -1],
    [[0, 0], [1, 0], [1, 1], [0, 1]],
    [-1, 0, 0],
    1,
  )
  // 四条边
  quad([[-hw, -hh, -ht], [-hw, -hh, ht], [-hw, hh, ht], [-hw, hh, -ht]], [-1, 0, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, 1], 2)
  quad([[hw, -hh, ht], [hw, -hh, -ht], [hw, hh, -ht], [hw, hh, ht]], [1, 0, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, -1], 2)
  quad([[-hw, -hh, -ht], [hw, -hh, -ht], [hw, -hh, ht], [-hw, -hh, ht]], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [1, 0, 0], 2)
  quad([[-hw, hh, ht], [hw, hh, ht], [hw, hh, -ht], [-hw, hh, -ht]], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [1, 0, 0], 2)

  return {
    pos: new Float32Array(pos),
    nrm: new Float32Array(nrm),
    uv: new Float32Array(uv),
    tan: new Float32Array(tan),
    face: new Float32Array(face),
    idx: new Uint16Array(idx),
  }
}

export class CardRenderer {
  private gl: WebGL2RenderingContext
  private prog: WebGLProgram
  private vao: WebGLVertexArrayObject | null = null
  private indexCount = 0
  private texArt: WebGLTexture
  private texMaskA: WebGLTexture
  private texMaskH: WebGLTexture
  private u: Record<string, WebGLUniformLocation | null> = {}
  private boxKey = ''
  readonly canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', {
      // 不开 MSAA:部分软光栅/ tiled GPU 的多重采样边缘覆盖存在帧间不确定性,
      // 改用 renderScale 超采样保证"同角度两次渲染逐像素一致"
      antialias: false,
      preserveDrawingBuffer: true, // 便于导出截图
      alpha: false,
    })
    if (!gl) throw new Error('当前浏览器不支持 WebGL2')
    this.gl = gl

    this.prog = gl.createProgram()!
    gl.attachShader(this.prog, compile(gl, gl.VERTEX_SHADER, VERT_SRC))
    gl.attachShader(this.prog, compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC))
    gl.linkProgram(this.prog)
    if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) {
      throw new Error('着色器链接失败: ' + gl.getProgramInfoLog(this.prog))
    }
    for (const name of [
      'uProj', 'uView', 'uArt', 'uMaskA', 'uMaskH', 'uHasArt', 'uArtAspect', 'uCardAspect',
      'uArtTf', 'uTexel', 'uCamPos', 'uEnv', 'uFilmD', 'uEmbossK', 'uCardHalf', 'uCornerR',
    ]) {
      this.u[name] = gl.getUniformLocation(this.prog, name)
    }

    this.texArt = this.makeTexture()
    this.texMaskA = this.makeTexture()
    this.texMaskH = this.makeTexture()

    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.CULL_FACE)
  }

  private makeTexture(): WebGLTexture {
    const gl = this.gl
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255]))
    // 不用 mipmap:mip 级别选择依赖 quad 导数,软光栅下存在帧间不确定性;
    // 用 LINEAR + renderScale 超采样兼顾确定性与画质
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }

  setArt(img: HTMLImageElement | HTMLCanvasElement) {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.texArt)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  }

  setMasks(maskAData: Uint8Array, maskH: HTMLCanvasElement) {
    const gl = this.gl
    // maskA 用原始像素上传,避免 canvas 预乘 alpha 破坏通道数据
    gl.bindTexture(gl.TEXTURE_2D, this.texMaskA)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, MASK_SIZE, MASK_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, maskAData)
    gl.bindTexture(gl.TEXTURE_2D, this.texMaskH)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskH)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  }

  private ensureBox(w: number, h: number, t: number) {
    const key = `${w}|${h}|${t}`
    if (key === this.boxKey && this.vao) return
    this.boxKey = key
    const gl = this.gl
    if (this.vao) gl.deleteVertexArray(this.vao)
    const g = buildBox(w, h, t)
    this.indexCount = g.idx.length
    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)
    const attrs: [number, Float32Array, number][] = [
      [0, g.pos, 3], [1, g.nrm, 3], [2, g.uv, 2], [3, g.tan, 3], [4, g.face, 1],
    ]
    for (const [loc, data, size] of attrs) {
      const buf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0)
    }
    const ib = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.idx, gl.STATIC_DRAW)
    gl.bindVertexArray(null)
    this.vao = vao
  }

  resize(scale: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * scale
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
  }

  render(p: RenderParams) {
    const gl = this.gl
    const S = 100 // mm → 世界单位
    const w = p.cardW / S, h = p.cardH / S, t = Math.max(p.thickness, 0.2) / S
    this.ensureBox(w, h, t)

    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0.13, 0.14, 0.16, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.useProgram(this.prog)
    gl.bindVertexArray(this.vao)

    const aspect = this.canvas.width / this.canvas.height
    gl.uniformMatrix4fv(this.u.uProj, false, perspective(0.7, aspect, 0.01, 50))
    const eye = orbitEye(p.orbit)
    gl.uniformMatrix4fv(this.u.uView, false, lookAt(eye, [0, 0, 0], [0, 1, 0]))
    gl.uniform3fv(this.u.uCamPos, eye)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texArt)
    gl.uniform1i(this.u.uArt, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.texMaskA)
    gl.uniform1i(this.u.uMaskA, 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.texMaskH)
    gl.uniform1i(this.u.uMaskH, 2)

    gl.uniform1i(this.u.uHasArt, p.hasArt ? 1 : 0)
    gl.uniform1f(this.u.uArtAspect, p.artAspect)
    gl.uniform1f(this.u.uCardAspect, p.cardW / p.cardH)
    gl.uniform3f(this.u.uArtTf, p.artTf.scale, p.artTf.x, p.artTf.y)
    gl.uniform2f(this.u.uTexel, 1 / MASK_SIZE, 1 / MASK_SIZE)
    gl.uniform1i(this.u.uEnv, ENV_INDEX[p.env])
    gl.uniform1f(this.u.uFilmD, p.filmD)
    gl.uniform1f(this.u.uEmbossK, p.embossK)
    gl.uniform2f(this.u.uCardHalf, w / 2, h / 2)
    gl.uniform1f(this.u.uCornerR, Math.min(3, Math.min(p.cardW, p.cardH) * 0.06) / S)

    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0)
    gl.bindVertexArray(null)
  }

  /** 当前画面导出为 PNG dataURL(preserveDrawingBuffer 已开启) */
  snapshot(): string {
    return this.canvas.toDataURL('image/png')
  }
}
