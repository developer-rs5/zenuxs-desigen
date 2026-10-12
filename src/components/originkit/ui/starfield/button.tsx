'use client'

import { useAnimate, useReducedMotion, type AnimationPlaybackControls } from 'motion/react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'

import { IS_BROWSER } from '@open-pencil/core/constants'

import {
  resolveConfig,
  resolveIconMode,
  resolveIconSrc,
  resolveTag,
  type StarfieldButtonProps
} from './config'
import {
  BAND_MASK,
  MAX_BAND_WIDTH,
  SECONDS_AT_SPEED_1,
  bandWidthsOf,
  borderColorOf,
  type Cell,
  parseColor,
  pointOnRoundRect,
  pointOnRoundRectAngular,
  radiusFromPercent,
  rgba,
  rnd
} from './geometry'
import { Glyph } from './icon'

const useIsoLayoutEffect = IS_BROWSER ? useLayoutEffect : useEffect

export default function StarfieldButton(props: StarfieldButtonProps) {
  const c = resolveConfig(props)
  const {
    label,
    font,
    showText,
    padding,
    rounded,
    fill,
    textColor,
    addIcon,
    gap,
    link,
    transition,
    newTab,
    style,
    border,
    glow,
    stroke,
    pixel,
    icon
  } = c

  const speed = 2 * (Math.max(0, Math.min(100, Math.round(stroke.speed))) / 50)

  const iconSrc = resolveIconSrc(icon.image)
  const iconMode = resolveIconMode(icon.kind, iconSrc)
  const iconPx = Math.max(1, Math.round(icon.size))
  const iconPadPx = Math.max(0, Math.round(icon.padding))
  const hasIcon = addIcon
  const { Tag, tagProps } = resolveTag(link, newTab, showText, label)

  const [scope, animate] = useAnimate()
  const buttonRef = useRef<HTMLElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const bandRef = useRef<HTMLDivElement>(null)
  const faceRef = useRef<HTMLSpanElement>(null)
  const innerGlowRef = useRef<HTMLSpanElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lightsRef = useRef<Array<HTMLDivElement | null>>([])

  const band = bandWidthsOf(border)
  const bandPadding = `${band.top}px ${band.right}px ${band.bottom}px ${band.left}px`
  const bandMax = Math.max(band.top, band.right, band.bottom, band.left)

  const glowAlpha = Math.max(0, Math.min(100, glow.opacity)) / 100

  const glowAlphaRef = useRef(glowAlpha)
  glowAlphaRef.current = glowAlpha

  const lightCount = Math.max(1, Math.min(12, Math.round(stroke.count)))

  const lightPx = Math.max(4, Math.round(stroke.size))

  const lightThick = Math.max(1, Math.min(MAX_BAND_WIDTH, Math.round(stroke.thickness)))

  const ringInset = bandMax / 2 - lightThick / 2

  const glowPx = Math.max(1, Math.round(glow.size))
  const glowRimPx = Math.max(1, Math.round(glowPx * 0.18))
  const glowBlurPx = Math.max(1, Math.round(glowPx * 0.5))

  const geom = useRef({ w: 0, h: 0, radius: 0 })
  useIsoLayoutEffect(() => {
    const el = buttonRef.current
    if (!el) return undefined
    const applyRadius = () => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (!w || !h) return
      const radius = radiusFromPercent(w, h, rounded)
      geom.current = { w, h, radius }
      el.style.borderRadius = `${radius}px`
      if (trackRef.current) trackRef.current.style.borderRadius = `${radius}px`
      if (bandRef.current)
        bandRef.current.style.borderRadius = `${Math.max(0, radius - ringInset)}px`
      if (faceRef.current) {
        const inset = (v: number) => Math.max(0, radius - v)
        const x = [inset(band.left), inset(band.right), inset(band.right), inset(band.left)]
        const y = [inset(band.top), inset(band.top), inset(band.bottom), inset(band.bottom)]
        const innerRadius = `${x
          .map((v) => `${v}px`)
          .join(' ')} / ${y.map((v) => `${v}px`).join(' ')}`
        faceRef.current.style.borderRadius = innerRadius

        if (innerGlowRef.current) innerGlowRef.current.style.borderRadius = innerRadius
      }
    }
    applyRadius()
    const ro = new ResizeObserver(applyRadius)
    ro.observe(el)
    return () => ro.disconnect()
  }, [rounded, ringInset, band.top, band.right, band.bottom, band.left])

  const reveal = useRef(0)
  const revealCtrl = useRef<AnimationPlaybackControls | null>(null)
  const tickCtrl = useRef<AnimationPlaybackControls | null>(null)
  const reducedMotion = useReducedMotion()

  const cfg = {
    pixelColor: pixel.color,
    pixelSize: pixel.size,
    pixelDensity: pixel.density,
    pixelBrightness: pixel.brightness,
    lightCount,
    bandMax,
    ringInset,
    movement: stroke.movement,
    direction: stroke.direction,

    turnsPerSec: Math.max(0, speed) / SECONDS_AT_SPEED_1
  }
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const size = useRef({ w: 1, h: 1, dpr: 1 })
  const city = useRef<{
    cols: number
    rows: number
    dens: number
    cells: Cell[]
  }>({
    cols: 0,
    rows: 0,
    dens: -1,
    cells: []
  })

  const buildCity = (w: number, h: number, cell: number) => {
    const c = Math.max(4, Math.round(cell))
    const cols = Math.max(1, Math.floor(w / c))
    const rows = Math.max(1, Math.floor(h / c))

    const dens = Math.max(0, Math.min(1, cfgRef.current.pixelDensity / 100))
    if (
      cols === city.current.cols &&
      rows === city.current.rows &&
      dens === city.current.dens &&
      city.current.cells.length
    )
      return
    const offX = (w - cols * c) / 2
    const offY = (h - rows * c) / 2
    const cells: Cell[] = []
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const i = r * cols + col
        const lit = rnd(i, 1) < dens
        cells.push({
          cx: offX + col * c + c / 2,
          cy: offY + r * c + c / 2,
          base: lit ? 0.5 + rnd(i, 2) * 0.5 : 0.05 + rnd(i, 3) * 0.18,
          speed: 0.6 + rnd(i, 4) * 2.4,
          phase: rnd(i, 5) * Math.PI * 2
        })
      }
    }
    city.current = { cols, rows, dens, cells }
  }

  const draw = (ctx: CanvasRenderingContext2D) => {
    const { w, h, dpr } = size.current
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const rv = reveal.current
    if (rv < 0.001) return

    const { pixelSize: cell, pixelColor: col } = cfgRef.current
    const lightMul = Math.max(0, cfgRef.current.pixelBrightness) / 100
    buildCity(w, h, cell)
    const { cells } = city.current
    const c = Math.max(4, Math.round(cell))
    const dot = Math.max(1, Math.round(c * 0.62))
    const off = dot / 2
    const t = performance.now() / 1000

    const cx = w / 2
    const cy = h / 2
    const maxD = Math.hypot(cx, cy) || 1

    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = col
    for (const p of cells) {
      const tw = 0.55 + 0.45 * Math.sin(t * p.speed + p.phase)
      const d = Math.hypot(p.cx - cx, p.cy - cy) / maxD
      const centerBias = 0.55 + 0.45 * (1 - d)
      let a = p.base * tw * centerBias * rv * lightMul
      if (a <= 0.002) continue
      if (a > 1) a = 1
      ctx.globalAlpha = a
      ctx.fillRect(p.cx - off, p.cy - off, dot, dot)
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  const placeLights = (elapsedSec: number) => {
    const { w, h, radius } = geom.current
    if (!w || !h) return
    const c = cfgRef.current
    const half = c.bandMax / 2

    const pw = Math.max(0, w - c.bandMax)
    const ph = Math.max(0, h - c.bandMax)
    const pr = Math.max(0, radius - half)
    const dir = c.direction === 'cw' ? 1 : -1
    const base = elapsedSec * c.turnsPerSec * dir

    for (let i = 0; i < c.lightCount; i++) {
      const el = lightsRef.current[i]
      if (!el) continue
      let t = base + i / c.lightCount
      t = ((t % 1) + 1) % 1

      const p =
        c.movement === 'step'
          ? pointOnRoundRectAngular(t, pw, ph, pr)
          : pointOnRoundRect(t, pw, ph, pr)

      el.style.transform = `translate3d(${p.x + half - c.ringInset}px, ${p.y + half - c.ringInset}px, 0)`
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const face = faceRef.current
    if (!canvas || !face) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    const applySize = (w: number, h: number) => {
      if (w <= 0 || h <= 0) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      size.current = { w, h, dpr }
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
    }

    const ro = new ResizeObserver(() => {
      applySize(face.clientWidth, face.clientHeight)
      placeLights(performance.now() / 1000)
    })
    ro.observe(face)
    applySize(face.clientWidth, face.clientHeight)
    placeLights(performance.now() / 1000)

    if (reducedMotion) {
      reveal.current = 0
      draw(ctx)
    } else {
      tickCtrl.current = animate(0, 1, {
        duration: 1,
        ease: 'linear',
        repeat: Infinity,
        onUpdate: () => {
          draw(ctx)
          placeLights(performance.now() / 1000)
        }
      })
    }

    return () => {
      ro.disconnect()
      tickCtrl.current?.stop()
      tickCtrl.current = null
    }
  }, [reducedMotion])

  useIsoLayoutEffect(() => {
    if (innerGlowRef.current)
      innerGlowRef.current.style.opacity = String(reveal.current * glowAlpha)
  }, [glowAlpha])

  useIsoLayoutEffect(() => {
    placeLights(performance.now() / 1000)
  }, [lightCount, lightPx, lightThick, stroke.movement, stroke.direction, rounded, bandMax])

  useEffect(() => () => revealCtrl.current?.stop(), [])

  const revealOpts = () => (reducedMotion ? ({ duration: 0 } as const) : transition)

  const animateReveal = (to: number) => {
    revealCtrl.current?.stop()
    revealCtrl.current = animate(reveal.current, to, {
      ...revealOpts(),
      onUpdate: (v: number) => {
        reveal.current = v

        if (innerGlowRef.current)
          innerGlowRef.current.style.opacity = String(v * glowAlphaRef.current)
      }
    })
  }

  const scaleTo = (s: number) => {
    if (buttonRef.current) animate(buttonRef.current, { scale: s }, revealOpts())
  }

  const onEnter = () => {
    animateReveal(1)
  }

  const onLeave = () => {
    animateReveal(0)
    scaleTo(1)
  }

  const faceBackground = fill

  const lightRGB = parseColor(stroke.color)

  const glyph = (
    <Glyph
      mode={iconMode}
      src={iconSrc}
      px={iconPx}
      padPx={iconPadPx}
      rounded={icon.rounded}
      color={icon.color}
      symbol={icon.symbol}
      iconType={icon.type}
    />
  )

  return (
    <div
      ref={scope}
      style={{
        minWidth: 80,
        minHeight: 40,
        position: 'relative',
        display: 'inline-grid',
        placeItems: 'stretch',

        overflow: 'visible',
        ...style
      }}
    >
      <Tag
        {...tagProps}
        ref={(el: HTMLElement | null) => {
          buttonRef.current = el
        }}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        onPointerDown={() => scaleTo(0.97)}
        onPointerUp={() => scaleTo(1)}
        style={{
          boxSizing: 'border-box',
          position: 'relative',

          padding: bandPadding,
          border: 'none',

          background: 'transparent',

          cursor: 'pointer',
          userSelect: 'none',
          textDecoration: 'none',
          overflow: 'visible'
        }}
      >
        {}
        <div
          ref={trackRef}
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            boxSizing: 'border-box',
            padding: bandPadding,
            background: borderColorOf(border),
            zIndex: 0,
            pointerEvents: 'none',
            ...BAND_MASK
          }}
        />

        {}
        <div
          ref={bandRef}
          aria-hidden
          style={{
            position: 'absolute',
            top: ringInset,
            right: ringInset,
            bottom: ringInset,
            left: ringInset,
            boxSizing: 'border-box',
            padding: lightThick,
            zIndex: 0,
            pointerEvents: 'none',
            ...BAND_MASK
          }}
        >
          {Array.from({ length: lightCount }, (_, i) => (
            <div
              key={i}
              ref={(el) => {
                lightsRef.current[i] = el
              }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: lightPx,
                height: lightPx,
                marginTop: -lightPx / 2,
                marginLeft: -lightPx / 2,
                pointerEvents: 'none',

                background: `radial-gradient(circle, ${stroke.color} 0%, ${stroke.color} 30%, ${rgba(lightRGB, 0)} 72%)`
              }}
            />
          ))}
        </div>

        {}
        <span
          ref={faceRef}
          style={{
            position: 'relative',
            zIndex: 1,

            boxSizing: 'border-box',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',

            gap: hasIcon && showText ? gap : 0,

            flexDirection: icon.side === 'right' ? 'row-reverse' : 'row',
            padding,
            whiteSpace: 'nowrap',
            background: faceBackground,

            overflow: 'hidden'
          }}
        >
          <canvas
            ref={canvasRef}
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none'
            }}
          />
          {}
          <span
            ref={innerGlowRef}
            aria-hidden
            style={
              {
                position: 'absolute',
                inset: 0,
                zIndex: 1,

                border: `${glowRimPx}px solid ${glow.color}`,
                filter: `blur(${glowBlurPx}px)`,
                opacity: 0,
                pointerEvents: 'none',
                maskImage: 'linear-gradient(#000 0 0)',
                maskClip: 'border-box',
                WebkitMaskImage: 'linear-gradient(#000 0 0)',
                WebkitMaskClip: 'border-box'
              } as CSSProperties
            }
          />
          {hasIcon && <span style={{ position: 'relative', zIndex: 2 }}>{glyph}</span>}
          {showText && (
            <span
              style={{
                position: 'relative',
                zIndex: 2,
                color: textColor,
                ...font
              }}
            >
              {label}
            </span>
          )}
        </span>
      </Tag>
    </div>
  )
}
