import type { Transition } from 'motion/react'
import type { CSSProperties } from 'react'

import type { BorderLike } from './geometry'

export type Colors = {
  fill?: string
  textColor?: string
  hoverFill?: string
  hoverTextColor?: string
}

export type IconConfig = {
  type?: 'symbol' | 'image'
  icon?: string
  symbol?: string
  image?: string | { src?: string; srcSet?: string; alt?: string }
  color?: string
  size?: number
  padding?: number
  side?: 'left' | 'right'
  rounded?: number
}

export type FontConfig = {
  variant?: string
  fontSize?: number
  textAlign?: CSSProperties['textAlign']
  fontFamily?: string
  fontWeight?: number
  lineHeight?: string
  letterSpacing?: string
}

export type GlowConfig = {
  color?: string
  size?: number
  opacity?: number
}

export type StrokeConfig = {
  count?: number
  color?: string
  size?: number
  thickness?: number
  speed?: number
  direction?: 'cw' | 'ccw'
  movement?: 'continuous' | 'step'
}

export type PixelConfig = {
  color?: string
  size?: number
  density?: number
  brightness?: number
}

export interface StarfieldButtonProps {
  colors?: Colors
  label?: string
  font?: FontConfig
  showText?: boolean
  padding?: string
  rounded?: number
  fill?: string
  textColor?: string
  addIcon?: boolean
  icon?: IconConfig
  gap?: number
  border?: BorderLike
  glow?: GlowConfig
  stroke?: StrokeConfig
  pixel?: PixelConfig
  link?: string
  transition?: Transition
  newTab?: boolean
  style?: CSSProperties
}

/** Every prop after its default is applied; consumed directly by the button. */
export interface ResolvedGlow {
  color: string
  size: number
  opacity: number
}

export function resolveGlow(glow: GlowConfig): ResolvedGlow {
  const { color = '#FC731C', size = 16, opacity = 100 } = glow
  return { color, size, opacity }
}

export interface ResolvedStroke {
  count: number
  color: string
  size: number
  thickness: number
  speed: number
  direction: 'cw' | 'ccw'
  movement: 'continuous' | 'step'
}

export function resolveStroke(stroke: StrokeConfig): ResolvedStroke {
  const {
    count = 1,
    color = '#FC731C',
    size = 96,
    thickness = 2,
    speed = 50,
    direction = 'ccw',
    movement = 'continuous'
  } = stroke
  return { count, color, size, thickness, speed, direction, movement }
}

export interface ResolvedPixel {
  color: string
  size: number
  density: number
  brightness: number
}

export function resolvePixel(pixel: PixelConfig): ResolvedPixel {
  const { color = '#FC731C', size = 4, density = 50, brightness = 100 } = pixel
  return { color, size, density, brightness }
}

export interface ResolvedConfig {
  label: string
  font: FontConfig
  showText: boolean
  padding: string
  rounded: number
  fill: string
  textColor: string
  addIcon: boolean
  gap: number
  link: string
  transition: Transition
  newTab: boolean
  style?: CSSProperties
  icon: ResolvedIcon
  border: BorderLike
  glow: ResolvedGlow
  stroke: ResolvedStroke
  pixel: ResolvedPixel
}

export interface ResolvedIcon {
  kind: 'symbol' | 'image'
  type: string
  symbol: string
  image?: string | { src?: string; srcSet?: string; alt?: string }
  color: string
  size: number
  padding: number
  side: 'left' | 'right'
  rounded: number
}

export function resolveIcon(icon: IconConfig): ResolvedIcon {
  const {
    type: kind = 'symbol',
    icon: type = 'arrow',
    symbol = '→',
    image,
    color = '#FFFFFF',
    size = 28,
    padding = 0,
    side = 'left',
    rounded = 0
  } = icon
  return { kind, type, symbol, image, color, size, padding, side, rounded }
}

export function resolveIconSrc(image: IconConfig['image']): string {
  if (typeof image === 'string') return image
  if (image && typeof image === 'object' && image.src) return image.src
  return ''
}

export function resolveIconMode(kind: 'symbol' | 'image', src: string): 'image' | 'symbol' {
  return kind === 'image' && src ? 'image' : 'symbol'
}

export interface ResolvedTag {
  Tag: 'a' | 'button'
  tagProps: {
    'aria-label': string | undefined
    href?: string
    target?: string
    rel?: string
    type?: 'button'
  }
}

/** Anchor vs button semantics live here so the render stays declarative. */
export function resolveTag(
  link: string,
  newTab: boolean,
  showText: boolean,
  label: string
): ResolvedTag {
  const ariaLabel = showText ? undefined : label || undefined
  if (link) {
    return {
      Tag: 'a',
      tagProps: {
        'aria-label': ariaLabel,
        href: link,
        target: newTab ? '_blank' : undefined,
        rel: newTab ? 'noopener noreferrer' : undefined
      }
    }
  }
  return { Tag: 'button', tagProps: { 'aria-label': ariaLabel, type: 'button' } }
}

function resolvePalette(colors: Colors | undefined, fill: string, textColor: string) {
  return {
    fill: colors?.fill ?? fill,
    textColor: colors?.textColor ?? textColor
  }
}

export function resolveConfig(props: StarfieldButtonProps): ResolvedConfig {
  const {
    label = 'STARFIELD',
    font = {
      variant: 'Regular',
      fontSize: 40,
      textAlign: 'left',
      fontFamily: 'Inter',
      fontWeight: 500,
      lineHeight: '1.5em',
      letterSpacing: '0em'
    },
    showText = true,
    padding = '40px 64px 40px 64px',
    rounded = 100,
    fill: fillProp = '#0A0A0A',
    textColor: textColorProp = '#FFFFFF',
    colors,
    addIcon = false,
    icon = {
      icon: 'arrow',
      side: 'left',
      size: 28,
      type: 'symbol',
      color: '#FFFFFF',
      image: '',
      symbol: '→',
      padding: 0,
      rounded: 0
    },
    gap = 16,
    border = {
      borderColor: 'rgba(255,255,255,0.14)',
      borderStyle: 'solid',
      borderWidth: 1
    },
    glow = { size: 16, color: '#FC731C', opacity: 100 },
    stroke = {
      size: 96,
      color: '#FC731C',
      count: 1,
      speed: 50,
      movement: 'continuous',
      direction: 'ccw',
      thickness: 2
    },
    pixel = { size: 4, color: '#FC731C', density: 50, brightness: 100 },
    link = '',
    transition = { ease: [0.44, 0, 0.56, 1], type: 'tween', delay: 0, duration: 0.6 },
    newTab = false,
    style
  } = props

  const palette = resolvePalette(colors, fillProp, textColorProp)

  return {
    label,
    font,
    showText,
    padding,
    rounded,
    fill: palette.fill,
    textColor: palette.textColor,
    addIcon,
    gap,
    link,
    transition,
    newTab,
    style,
    icon: resolveIcon(icon),
    border,
    glow: resolveGlow(glow),
    stroke: resolveStroke(stroke),
    pixel: resolvePixel(pixel)
  }
}
