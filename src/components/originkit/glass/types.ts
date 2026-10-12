import type { CSSProperties } from 'vue'

export interface FontValue {
  fontFamily?: string
  fontSize?: string | number
  fontWeight?: string | number
  fontStyle?: string
  letterSpacing?: string | number
  lineHeight?: string | number
}

export interface BackdropGroup {
  type?: 'None' | 'Image' | 'Video' | 'Text'
  image?: string
  video?: string
  text?: string
  font?: FontValue
  textColor?: string
}

export interface GlassGroup {
  tint?: string
  chromatic?: number
  frost?: number
}

export interface OrientGroup {
  angleX?: number
  angleY?: number
  angleZ?: number
  offsetX?: number
  offsetY?: number
}

export interface GlassIconProps {
  className?: string
  style?: CSSProperties
  background?: string
  shape?: 'X' | 'Torus' | 'Sphere' | 'Logo'
  logo?: string
  depth?: number
  size?: number
  speed?: number
  direction?: 'Clockwise' | 'Counterclockwise'
  backdrop?: BackdropGroup
  glass?: GlassGroup
  orient?: OrientGroup
}

/** Snapshot of the prop state the WebGL renderer reads each frame. */
export interface GlassLiveState {
  background: string
  shape: NonNullable<GlassIconProps['shape']>
  logo: string
  depth: number
  size: number
  speed: number
  direction: NonNullable<GlassIconProps['direction']>
  bd: Required<BackdropGroup>
  gl3: Required<GlassGroup>
  or: Required<OrientGroup>
}
