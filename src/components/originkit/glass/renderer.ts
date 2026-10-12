import {
  BEVEL,
  CAM_DIST,
  DEG,
  DRAG_GAIN,
  FOV,
  IDLE_FLOAT,
  SDF_MAX,
  SDF_PAD,
  SDF_SPREAD,
  SPIN_PITCH,
  SPIN_YAW,
  TILT_RATE,
  TILT_RANGE,
  bakeSDF,
  buildEnvCanvas,
  fallbackAlpha,
  numOf,
  parseColor,
  rotYXZ,
  srcOf,
  transpose3
} from './geometry'
import { FULLSCREEN_VS, GLASS_FS, PLATE_FS, link } from './shaders'
import type { GlassLiveState } from './types'

/**
 * Boots the SDF ray-marched glass renderer on a canvas and returns a cleanup
 * that stops the frame loop and detaches its listeners.
 */
export function startGlassRenderer(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  getLive: () => GlassLiveState
): () => void {
  let raf = 0

  const opts = { antialias: false, alpha: true, premultipliedAlpha: true }
  const ctx = (canvas.getContext('webgl2', opts) ||
    canvas.getContext('webgl', opts)) as WebGLRenderingContext | null
  if (!ctx) return () => undefined
  const gl: WebGLRenderingContext = ctx

  const plateProg = link(gl, FULLSCREEN_VS, PLATE_FS)
  const glassProg = link(gl, FULLSCREEN_VS, GLASS_FS)
  if (!plateProg || !glassProg) return () => undefined

  const uPlatePass = {
    plate: gl.getUniformLocation(plateProg, 'uPlate'),
    fit: gl.getUniformLocation(plateProg, 'uPlateFit'),
    res: gl.getUniformLocation(plateProg, 'uRes')
  }
  const u = {
    res: gl.getUniformLocation(glassProg, 'uRes'),
    aspect: gl.getUniformLocation(glassProg, 'uAspect'),
    tanHalf: gl.getUniformLocation(glassProg, 'uTanHalf'),
    plate: gl.getUniformLocation(glassProg, 'uPlate'),
    plateFit: gl.getUniformLocation(glassProg, 'uPlateFit'),
    hasPlate: gl.getUniformLocation(glassProg, 'uHasPlate'),
    env: gl.getUniformLocation(glassProg, 'uEnv'),
    sdf: gl.getUniformLocation(glassProg, 'uSDF'),
    rot: gl.getUniformLocation(glassProg, 'uRot'),
    rotT: gl.getUniformLocation(glassProg, 'uRotT'),
    center: gl.getUniformLocation(glassProg, 'uCenter'),
    scale: gl.getUniformLocation(glassProg, 'uScale'),
    boundR: gl.getUniformLocation(glassProg, 'uBoundR'),
    shape: gl.getUniformLocation(glassProg, 'uShape'),
    halfDepth: gl.getUniformLocation(glassProg, 'uHalfDepth'),
    bevel: gl.getUniformLocation(glassProg, 'uBevel'),
    torusTube: gl.getUniformLocation(glassProg, 'uTorusTube'),
    logoHalf: gl.getUniformLocation(glassProg, 'uLogoHalf'),
    sdfUnits: gl.getUniformLocation(glassProg, 'uSdfUnits'),
    disp: gl.getUniformLocation(glassProg, 'uDisp'),
    frost: gl.getUniformLocation(glassProg, 'uFrost'),
    tint: gl.getUniformLocation(glassProg, 'uTint')
  }
  const aPlatePos = gl.getAttribLocation(plateProg, 'aPos')
  const aGlassPos = gl.getAttribLocation(glassProg, 'aPos')

  const quadBuf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)

  function makeTex(wrap: number) {
    const t = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    )
    return t
  }
  const plateTex = makeTex(gl.CLAMP_TO_EDGE)
  const sdfTex = makeTex(gl.CLAMP_TO_EDGE)
  const envTex = makeTex(gl.REPEAT)

  const envCanvas = buildEnvCanvas()
  if (envCanvas) {
    gl.bindTexture(gl.TEXTURE_2D, envTex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, envCanvas)
  }

  let vw = 1
  let vh = 1
  let dprCur = 1
  let sdfH = 1
  let sdfReady = false
  let logoAspect = 1

  function uploadSDF(alpha: Uint8ClampedArray, w: number, h: number, aspect: number) {
    const bytes = bakeSDF(alpha, w, h)
    sdfH = h
    logoAspect = aspect
    gl.bindTexture(gl.TEXTURE_2D, sdfTex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
    sdfReady = true
  }

  function bakeFallback() {
    uploadSDF(fallbackAlpha(320, 320), 320, 320, 1)
  }

  let sdfToken = 0
  function bakeLogo() {
    const url = srcOf(getLive().logo)
    if (!url) {
      bakeFallback()
      return
    }
    const token = ++sdfToken
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (token !== sdfToken) return
      const scale = Math.min(
        (SDF_MAX - SDF_PAD * 2) / Math.max(img.width, 1),
        (SDF_MAX - SDF_PAD * 2) / Math.max(img.height, 1),
        1
      )
      const iw = Math.max(1, Math.round(img.width * scale))
      const ih = Math.max(1, Math.round(img.height * scale))
      const w = iw + SDF_PAD * 2
      const h = ih + SDF_PAD * 2
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const c2d = c.getContext('2d')
      if (!c2d) return
      c2d.clearRect(0, 0, w, h)
      c2d.drawImage(img, SDF_PAD, SDF_PAD, iw, ih)
      let data: ImageData
      try {
        data = c2d.getImageData(0, 0, w, h)
      } catch {
        bakeFallback()
        return
      }
      uploadSDF(data.data, w, h, w / h)
    }
    img.onerror = () => {
      if (token === sdfToken) bakeFallback()
    }
    img.src = url
  }

  let plateReady = false
  let plateAspect = 1
  let video: HTMLVideoElement | null = null
  let plateToken = 0
  let fontsWaited = false

  function clearVideo() {
    if (!video) return
    video.pause()
    video.removeAttribute('src')
    video.load()
    video = null
  }

  function bakePlateText() {
    const p = getLive()
    const w = Math.max(2, vw)
    const h = Math.max(2, vh)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx2d = c.getContext('2d')
    if (!ctx2d) return
    const f = p.bd.font
    const fontPx = numOf(f.fontSize, 96) * dprCur
    const weight = f.fontWeight ?? 700
    const family = f.fontFamily || 'Inter, system-ui, sans-serif'
    const fstyle = f.fontStyle || 'normal'
    const lineH = numOf(f.lineHeight, 1.1) * fontPx
    const tracking = numOf(f.letterSpacing, 0) * dprCur
    ctx2d.clearRect(0, 0, w, h)
    ctx2d.fillStyle = p.background
    ctx2d.fillRect(0, 0, w, h)
    ctx2d.font = `${fstyle} ${weight} ${fontPx}px ${family}`
    ctx2d.textAlign = 'center'
    ctx2d.textBaseline = 'middle'
    ctx2d.fillStyle = p.bd.textColor || '#FFFFFF'
    const anyCtx = ctx2d as CanvasRenderingContext2D & { letterSpacing?: string }
    if ('letterSpacing' in anyCtx) anyCtx.letterSpacing = `${tracking}px`
    const lines = String(p.bd.text).split('\n')
    const top = h / 2 - ((lines.length - 1) * lineH) / 2
    for (let i = 0; i < lines.length; i++) {
      ctx2d.fillText(lines[i], w / 2, top + i * lineH)
    }
    plateAspect = w / h
    gl.bindTexture(gl.TEXTURE_2D, plateTex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c)
    plateReady = true
    if (!fontsWaited && typeof document !== 'undefined') {
      fontsWaited = true
      void document.fonts.ready
        .then(() => {
          if (getLive().bd.type === 'Text') bakePlateText()
          return undefined
        })
        .catch((error) => {
          console.debug('[GlassIcon] fonts ready listener failed:', error)
        })
    }
  }

  function loadPlate() {
    const p = getLive()
    clearVideo()
    plateReady = false
    const token = ++plateToken
    if (p.bd.type === 'Text') {
      bakePlateText()
      return
    }
    if (p.bd.type === 'Image') {
      const url = srcOf(p.bd.image)
      if (!url) return
      const img = new window.Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (token !== plateToken) return
        plateAspect = img.width / Math.max(img.height, 1)
        gl.bindTexture(gl.TEXTURE_2D, plateTex)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
        plateReady = true
      }
      img.src = url
      return
    }
    if (p.bd.type === 'Video') {
      const url = srcOf(p.bd.video)
      if (!url) return
      const v = document.createElement('video')
      v.crossOrigin = 'anonymous'
      v.playsInline = true
      v.loop = true
      v.muted = true
      v.src = url
      void v.play().catch(() => undefined)
      video = v
    }
  }

  function pumpVideo() {
    if (!video || video.readyState < 2 || !video.videoWidth) return
    plateAspect = video.videoWidth / Math.max(video.videoHeight, 1)
    gl.bindTexture(gl.TEXTURE_2D, plateTex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
    plateReady = true
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    dprCur = dpr
    const cw = canvas.clientWidth || host.clientWidth || 1
    const ch = canvas.clientHeight || host.clientHeight || 1
    const w = Math.max(1, Math.round(cw * dpr))
    const h = Math.max(1, Math.round(ch * dpr))
    if (w === vw && h === vh) return
    vw = w
    vh = h
    canvas.width = w
    canvas.height = h
    if (getLive().bd.type === 'Text') bakePlateText()
  }

  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  resize()

  let baseYaw = 0
  let basePitch = 0
  let tiltX = 0
  let tiltY = 0
  let tiltTargetX = 0
  let tiltTargetY = 0
  let dragging = false
  let lastX = 0
  let lastY = 0

  function onPointerMove(e: PointerEvent) {
    if (dragging) {
      baseYaw += (e.clientX - lastX) * DRAG_GAIN
      basePitch += (e.clientY - lastY) * DRAG_GAIN
      basePitch = Math.max(-1.4, Math.min(1.4, basePitch))
      lastX = e.clientX
      lastY = e.clientY
      return
    }
    const r = canvas.getBoundingClientRect()
    tiltTargetX = (((e.clientX - r.left) / Math.max(r.width, 1)) * 2 - 1) * TILT_RANGE
    tiltTargetY = (-((e.clientY - r.top) / Math.max(r.height, 1)) * 2 + 1) * TILT_RANGE
  }
  function onPointerDown(e: PointerEvent) {
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
  }
  function onPointerUp() {
    dragging = false
  }
  function onLeave() {
    if (!dragging) {
      tiltTargetX = 0
      tiltTargetY = 0
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerleave', onLeave)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)

  gl.disable(gl.DEPTH_TEST)
  gl.enable(gl.BLEND)
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  gl.clearColor(0, 0, 0, 0)

  let prev = performance.now()
  let elapsed = 0
  let rebuildSDF = true
  let rebuildPlateLocal = true

  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    const dt = Math.min((now - prev) / 1000, 0.05)
    prev = now
    elapsed += dt
    const p = getLive()

    if (rebuildSDF) {
      rebuildSDF = false
      bakeLogo()
    }
    if (rebuildPlateLocal) {
      rebuildPlateLocal = false
      loadPlate()
    }
    if (video) pumpVideo()

    const isLogo = p.shape === 'Logo'
    if (isLogo && !sdfReady) return

    const k = 1 - Math.exp(-TILT_RATE * dt)
    tiltX += (tiltTargetX - tiltX) * k
    tiltY += (tiltTargetY - tiltY) * k

    const spin = (p.speed / 50) * (p.direction === 'Counterclockwise' ? -1 : 1)
    baseYaw += spin * SPIN_YAW * dt
    basePitch += spin * SPIN_PITCH * dt

    const o = p.or
    const yaw = baseYaw + tiltX + o.angleY * DEG
    const pitch = Math.max(-1.45, Math.min(1.45, basePitch - tiltY)) + o.angleX * DEG
    const rot = rotYXZ(yaw, pitch, o.angleZ * DEG)
    const rotT = transpose3(rot)

    const camDist = CAM_DIST
    const halfFrame = camDist * Math.tan(FOV / 2)
    const targetHalf = Math.max(0.02, p.size / 100) * halfFrame

    const nativeDepth = Math.max(0, p.depth / 100)
    const torusTube = Math.max(0.02, nativeDepth * 0.5)
    let refHalf: number
    let boundR: number
    let shapeId: number
    let halfDepth = nativeDepth * 0.5
    let bevel = BEVEL
    let logoHalfX = 1
    let logoHalfY = 1

    if (p.shape === 'X') {
      shapeId = 0
      refHalf = 1.3
      boundR = Math.hypot(1.3, 0.35) + halfDepth + bevel
    } else if (p.shape === 'Torus') {
      shapeId = 1
      refHalf = 0.8 + torusTube
      boundR = 0.8 + torusTube
    } else if (p.shape === 'Sphere') {
      shapeId = 2
      refHalf = 1.2
      boundR = 1.2
    } else {
      shapeId = 3
      logoHalfY = 1
      logoHalfX = logoAspect
      refHalf = 1
      halfDepth *= refHalf / 1.3
      bevel *= refHalf / 1.3
      boundR = Math.hypot(logoHalfX, logoHalfY, halfDepth) + bevel
    }

    const scale = targetHalf / refHalf
    const floatY = Math.sin(elapsed * 2) * IDLE_FLOAT

    const screenAspect = vw / vh
    const fitX = screenAspect > plateAspect ? 1 : screenAspect / plateAspect
    const fitY = screenAspect > plateAspect ? plateAspect / screenAspect : 1
    const hasPlate = plateReady && p.bd.type !== 'None' ? 1 : 0

    gl.viewport(0, 0, vw, vh)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf)

    if (hasPlate) {
      gl.useProgram(plateProg)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, plateTex)
      gl.uniform1i(uPlatePass.plate, 0)
      gl.uniform2f(uPlatePass.fit, fitX, fitY)
      gl.uniform2f(uPlatePass.res, vw, vh)
      gl.enableVertexAttribArray(aPlatePos)
      gl.vertexAttribPointer(aPlatePos, 2, gl.FLOAT, false, 0, 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    gl.useProgram(glassProg)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, plateTex)
    gl.uniform1i(u.plate, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, envTex)
    gl.uniform1i(u.env, 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, sdfTex)
    gl.uniform1i(u.sdf, 2)

    gl.uniform2f(u.res, vw, vh)
    gl.uniform1f(u.aspect, screenAspect)
    gl.uniform1f(u.tanHalf, Math.tan(FOV / 2))
    gl.uniform2f(u.plateFit, fitX, fitY)
    gl.uniform1f(u.hasPlate, hasPlate)

    gl.uniformMatrix3fv(u.rot, false, rot)
    gl.uniformMatrix3fv(u.rotT, false, rotT)

    gl.uniform3f(
      u.center,
      (o.offsetX / 100) * halfFrame * screenAspect,
      floatY + (o.offsetY / 100) * halfFrame,
      -camDist
    )
    gl.uniform1f(u.scale, scale)
    gl.uniform1f(u.boundR, boundR)

    gl.uniform1f(u.shape, shapeId)
    gl.uniform1f(u.halfDepth, halfDepth)
    gl.uniform1f(u.bevel, bevel)
    gl.uniform1f(u.torusTube, torusTube)
    gl.uniform2f(u.logoHalf, logoHalfX, logoHalfY)

    gl.uniform1f(u.sdfUnits, (SDF_SPREAD * (2 * logoHalfY)) / Math.max(sdfH, 1))

    const g = p.gl3
    gl.uniform1f(u.disp, g.chromatic / 1000)
    gl.uniform1f(u.frost, g.frost / 100)
    const tint = parseColor(g.tint, [1, 1, 1])
    gl.uniform3f(u.tint, tint[0], tint[1], tint[2])

    gl.enableVertexAttribArray(aGlassPos)
    gl.vertexAttribPointer(aGlassPos, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  raf = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(raf)
    sdfToken++
    plateToken++
    clearVideo()
    ro.disconnect()
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointerleave', onLeave)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
  }
}
