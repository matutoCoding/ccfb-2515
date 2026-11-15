// WebGL2 着色器:所有效果都是视角/uv 的确定性函数,不引入任何时间或随机量,
// 保证"同一角度两次渲染颜色完全一致"。

export const VERT_SRC = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUv;
layout(location=3) in vec3 aTangent;
layout(location=4) in float aFace;

uniform mat4 uProj;
uniform mat4 uView;

out vec3 vPos;
out vec3 vNormal;
out vec2 vUv;
out vec3 vTangent;
out float vFace;

void main() {
  vPos = aPos;
  vNormal = aNormal;
  vUv = aUv;
  vTangent = aTangent;
  vFace = aFace;
  gl_Position = uProj * uView * vec4(aPos, 1.0);
}
`

export const FRAG_SRC = `#version 300 es
precision highp float;

uniform sampler2D uArt;    // 卡面图
uniform sampler2D uMaskA;  // R=镭射 G=烫金 B=烫银 A=局部UV
uniform sampler2D uMaskH;  // R=击凸 G=压凹 (已模糊)
uniform int uHasArt;
uniform float uArtAspect;  // 图片宽/高
uniform float uCardAspect; // 卡面宽/高
uniform vec3 uArtTf;       // x=scale, y=ox, z=oy
uniform vec2 uTexel;       // 蒙版纹理 texel 尺寸
uniform vec3 uCamPos;
uniform int uEnv;          // 0=摄影棚 1=窗边 2=射灯
uniform float uFilmD;      // 镭射膜厚 nm
uniform float uEmbossK;    // 击凸强度
uniform vec2 uCardHalf;    // 卡面半宽半高(世界单位)
uniform float uCornerR;    // 圆角半径

in vec3 vPos;
in vec3 vNormal;
in vec2 vUv;
in vec3 vTangent;
in float vFace;
out vec4 frag;

const float PI = 3.14159265359;

// ---------- 确定性噪声(只依赖 uv,跨帧恒定) ----------
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// 拉丝纹理:沿 y 方向高度拉伸的条带噪声
float brushed(vec2 uv) {
  float n = vnoise(vec2(uv.x * 8.0, uv.y * 300.0));
  n += 0.5 * vnoise(vec2(uv.x * 17.0, uv.y * 640.0));
  return n / 1.5;
}

// ---------- 光谱 → 颜色(CIE1931 多峰高斯拟合, Wyman et al.) ----------
float gfit(float w, float m, float s1, float s2) {
  float s = w < m ? s1 : s2;
  float t = (w - m) / s;
  return exp(-0.5 * t * t);
}
vec3 waveXYZ(float w) {
  float x = 1.056 * gfit(w, 599.8, 37.9, 31.0)
          + 0.362 * gfit(w, 442.0, 16.0, 26.7)
          - 0.065 * gfit(w, 501.1, 20.4, 26.2);
  float y = 0.821 * gfit(w, 568.8, 46.9, 40.5)
          + 0.286 * gfit(w, 530.9, 16.3, 31.1);
  float z = 1.217 * gfit(w, 437.0, 11.8, 36.0)
          + 0.681 * gfit(w, 459.0, 26.0, 13.8);
  return vec3(x, y, z);
}
vec3 xyzToRgb(vec3 xyz) {
  // sRGB D65,列主序构造
  mat3 M = mat3(
     3.2406, -0.9689,  0.0557,
    -1.5372,  1.8758, -0.2040,
    -0.4986,  0.0415,  1.0570);
  return M * xyz;
}

// ---------- 薄膜干涉:反射光程差 2·n·d·cosθt,一个界面有半波损失 ----------
vec3 thinFilm(float cosI, float dNm) {
  const float n2 = 1.45;           // 镭射膜(PET/镀层)等效折射率
  float sin2t = (1.0 - cosI * cosI) / (n2 * n2);
  float cosT = sqrt(clamp(1.0 - sin2t, 0.0, 1.0));
  float opd = 2.0 * n2 * dNm * cosT;
  vec3 xyz = vec3(0.0);
  const int N = 24;                // 380~700nm 等距采样,连续且确定
  for (int i = 0; i < N; i++) {
    float w = 380.0 + 320.0 * (float(i) + 0.5) / float(N);
    float phase = 2.0 * PI * opd / w + PI;   // +π 半波损失
    float amp = 0.5 + 0.5 * cos(phase);
    xyz += amp * waveXYZ(w);
  }
  xyz /= float(N);
  vec3 rgb = xyzToRgb(xyz);
  return clamp(rgb * 2.4, 0.0, 1.0);
}

// ---------- 程序化环境光(确定性,无需贴图) ----------
vec3 envStudio(vec3 d) {
  float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(vec3(0.085, 0.09, 0.105), vec3(0.42, 0.43, 0.46), up);
  float soft = pow(clamp(dot(d, normalize(vec3(0.25, 1.0, 0.3))), 0.0, 1.0), 28.0);
  col += vec3(1.25, 1.22, 1.15) * soft * 2.2;                 // 顶部柔光箱
  float fill = pow(clamp(dot(d, normalize(vec3(-0.85, 0.15, 0.45))), 0.0, 1.0), 6.0);
  col += vec3(0.30, 0.33, 0.40) * fill;                       // 冷色补光
  return col;
}
vec3 envWindow(vec3 d) {
  float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(vec3(0.16, 0.14, 0.12), vec3(0.55, 0.62, 0.72), up);
  float sun = pow(clamp(dot(d, normalize(vec3(-0.65, 0.45, 0.55))), 0.0, 1.0), 90.0);
  col += vec3(1.5, 1.15, 0.75) * sun * 3.0;                   // 窗外暖阳
  float sky = pow(clamp(dot(d, normalize(vec3(-0.4, 0.7, -0.3))), 0.0, 1.0), 3.0);
  col += vec3(0.25, 0.35, 0.5) * sky * 0.6;
  return col;
}
vec3 envSpot(vec3 d) {
  vec3 col = vec3(0.045, 0.045, 0.055);
  col += vec3(1.30, 1.15, 0.90) * pow(clamp(dot(d, normalize(vec3( 0.4, 0.9, 0.35))), 0.0, 1.0), 120.0) * 3.0;
  col += vec3(0.55, 0.65, 0.95) * pow(clamp(dot(d, normalize(vec3(-0.7, 0.6, -0.2))), 0.0, 1.0), 100.0) * 1.6;
  col += vec3(0.90, 0.55, 0.40) * pow(clamp(dot(d, normalize(vec3( 0.1, 0.4, -0.9))), 0.0, 1.0),  90.0) * 1.2;
  return col;
}
vec3 envColor(vec3 d) {
  if (uEnv == 1) return envWindow(d);
  if (uEnv == 2) return envSpot(d);
  return envStudio(d);
}
vec3 keyDir() {
  if (uEnv == 1) return normalize(vec3(-0.55, 0.5, 0.62));
  if (uEnv == 2) return normalize(vec3(0.38, 0.85, 0.4));
  return normalize(vec3(0.45, 0.75, 0.55));
}
vec3 keyColor() {
  if (uEnv == 1) return vec3(1.15, 0.98, 0.82);
  if (uEnv == 2) return vec3(1.15, 1.05, 0.9);
  return vec3(1.05, 1.03, 1.0);
}

// ---------- 击凸/压凹高度 → 法线 ----------
float heightAt(vec2 uv) {
  vec2 m = texture(uMaskH, uv).rg;
  return m.r - m.g;
}

void main() {
  // 圆角矩形裁切(对卡面平面坐标,所有面统一)
  vec2 q = abs(vPos.xy) - (uCardHalf - uCornerR);
  if (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) > uCornerR) discard;

  vec3 V = normalize(uCamPos - vPos);
  vec3 N = normalize(vNormal);
  if (dot(N, V) < 0.0) N = -N;

  // 背面和侧边:简单卡纸材质
  if (vFace > 0.5) {
    vec3 base = vFace > 1.5 ? vec3(0.92) : vec3(0.90, 0.88, 0.85);
    base *= 0.96 + 0.04 * vnoise(vPos.xy * 40.0 + vPos.z * 40.0);
    vec3 Lb = keyDir();
    vec3 col = base * (envColor(N) * 0.45 + keyColor() * max(dot(N, Lb), 0.0) * 0.8);
    frag = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
    return;
  }

  vec2 uv = vUv;
  vec3 T = normalize(vTangent);
  vec3 B = normalize(cross(N, T));

  // 击凸/压凹扰动法线(中心差分)
  float hx = heightAt(uv + vec2(uTexel.x, 0.0)) - heightAt(uv - vec2(uTexel.x, 0.0));
  float hy = heightAt(uv + vec2(0.0, uTexel.y)) - heightAt(uv - vec2(0.0, uTexel.y));
  vec3 nT = normalize(vec3(-hx * uEmbossK, -hy * uEmbossK, 1.0));
  N = normalize(T * nT.x + B * nT.y + N * nT.z);

  vec4 masks = texture(uMaskA, uv);
  float holoM = masks.r, goldM = masks.g, silverM = masks.b, uvM = masks.a;

  // ---- 卡面底色(印刷 + 哑膜) ----
  vec3 art = vec3(0.965);
  if (uHasArt == 1) {
    vec2 aUv = (uv - 0.5) / uArtTf.x + 0.5 - uArtTf.yz;
    // 保持图片纵横比:cover 裁剪
    if (uArtAspect > uCardAspect) aUv.x = 0.5 + (aUv.x - 0.5) * (uCardAspect / uArtAspect);
    else                          aUv.y = 0.5 + (aUv.y - 0.5) * (uArtAspect / uCardAspect);
    if (aUv.x >= 0.0 && aUv.x <= 1.0 && aUv.y >= 0.0 && aUv.y <= 1.0)
      art = texture(uArt, aUv).rgb;
  }
  art = pow(art, vec3(2.2));

  vec3 L = keyDir();
  vec3 Lc = keyColor();
  float ndl = max(dot(N, L), 0.0);
  vec3 amb = envColor(N) * 0.55 + vec3(0.10, 0.105, 0.115);
  vec3 col = art * (amb + Lc * ndl * 0.9);

  vec3 R = reflect(-V, N);
  float cosI = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.06 + 0.94 * pow(1.0 - cosI, 3.0);

  // ---- 烫金 / 烫银:金属环境反射 + 拉丝扰动 ----
  float br = brushed(uv);
  vec3 Nb = normalize(N + (br - 0.5) * 0.10 * B + (br - 0.5) * 0.03 * T);
  vec3 Rb = reflect(-V, Nb);
  float mfres = 0.35 + 0.65 * pow(1.0 - cosI, 2.0);
  vec3 goldCol = vec3(1.00, 0.72, 0.30) * (envColor(Rb) * 1.1 + vec3(0.30, 0.22, 0.10)) * (0.6 + 0.7 * mfres)
               + vec3(1.0, 0.88, 0.6) * pow(max(dot(Rb, L), 0.0), 48.0) * 1.4;
  vec3 silverCol = vec3(0.92, 0.94, 0.97) * (envColor(Rb) * 1.1 + vec3(0.24, 0.25, 0.27)) * (0.6 + 0.7 * mfres)
               + vec3(1.0) * pow(max(dot(Rb, L), 0.0), 64.0) * 1.4;
  col = mix(col, goldCol, goldM);
  col = mix(col, silverCol, silverM);

  // ---- 镭射膜:薄膜干涉彩虹,膜厚带轻微确定性的空间起伏 ----
  float dEff = uFilmD * (1.0 + 0.05 * (vnoise(uv * 5.0) - 0.5));
  vec3 tf = thinFilm(cosI, dEff);
  vec3 holoCol = col * 0.15 + tf * (0.75 + 0.55 * pow(1.0 - cosI, 1.5));
  col = mix(col, holoCol, holoM);

  // ---- 局部UV:高亮光油 vs 哑膜 ----
  // 注:高光指数不宜过大,否则在掠射角处对法线插值的亚像素误差极度敏感
  float gloss = mix(0.05, 1.0, uvM);
  float specKey = pow(max(dot(R, L), 0.0), mix(12.0, 90.0, gloss));
  col += Lc * specKey * mix(0.05, 0.85, gloss);
  col += envColor(R) * mix(0.035, 0.38, gloss) * (0.35 + 0.65 * fres);

  col = clamp(col, 0.0, 1.0);
  frag = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}
`
