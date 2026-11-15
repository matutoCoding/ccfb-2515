// 轨道相机与矩阵工具(列主序,WebGL 约定)
export type Mat4 = Float32Array

export function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2)
  const m = new Float32Array(16)
  m[0] = f / aspect
  m[5] = f
  m[10] = (far + near) / (near - far)
  m[11] = -1
  m[14] = (2 * far * near) / (near - far)
  return m
}

export function lookAt(eye: number[], target: number[], up: number[]): Mat4 {
  const [ex, ey, ez] = eye
  let zx = ex - target[0], zy = ey - target[1], zz = ez - target[2]
  let l = Math.hypot(zx, zy, zz)
  zx /= l; zy /= l; zz /= l
  // x = up × z
  let xx = up[1] * zz - up[2] * zy
  let xy = up[2] * zx - up[0] * zz
  let xz = up[0] * zy - up[1] * zx
  l = Math.hypot(xx, xy, xz)
  xx /= l; xy /= l; xz /= l
  const yx = zy * xz - zz * xy
  const yy = zz * xx - zx * xz
  const yz = zx * xy - zy * xx
  const m = new Float32Array(16)
  m[0] = xx; m[1] = yx; m[2] = zx; m[3] = 0
  m[4] = xy; m[5] = yy; m[6] = zy; m[7] = 0
  m[8] = xz; m[9] = yz; m[10] = zz; m[11] = 0
  m[12] = -(xx * ex + xy * ey + xz * ez)
  m[13] = -(yx * ex + yy * ey + yz * ez)
  m[14] = -(zx * ex + zy * ey + zz * ez)
  m[15] = 1
  return m
}

export interface Orbit {
  yaw: number   // 弧度
  pitch: number // 弧度,限制在 ±1.45
  dist: number
}

export function orbitEye(o: Orbit): number[] {
  const cp = Math.cos(o.pitch)
  return [
    o.dist * cp * Math.sin(o.yaw),
    o.dist * Math.sin(o.pitch),
    o.dist * cp * Math.cos(o.yaw),
  ]
}
