import { radiusFromPercent } from './geometry'

function renderIconPath(iconType: string | undefined, strokeWidth: number) {
  const str = typeof iconType === 'string' ? iconType.toLowerCase() : 'arrow'
  switch (str) {
    case 'chevron':
      return (
        <path
          d="M9 18L15 12L9 6"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'plus':
      return (
        <path
          d="M12 5V19M5 12H19"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'star':
      return (
        <path
          d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'arrowdiagonal':
    case 'arrow-diagonal':
      return (
        <path
          d="M7 17L17 7M17 7H7M17 7V17"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'check':
      return (
        <path
          d="M20 6L9 17L4 12"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    default:
      return (
        <path
          d="M5 12H19M19 12L13 6M19 12L13 18"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
  }
}

export interface GlyphProps {
  mode: 'image' | 'symbol' | 'svg'
  src: string
  px: number
  padPx: number
  rounded: number
  color: string
  symbol: string
  iconType?: string
}

/** Icon rendered inside the starfield face: raster, text glyph, or stroked SVG. */
export function Glyph(props: GlyphProps) {
  const { mode, src, px, padPx, rounded, color, symbol, iconType } = props

  if (mode === 'image') {
    return (
      <img
        src={src}
        alt=""
        aria-hidden
        draggable={false}
        style={{
          width: px,
          height: px,
          margin: padPx,
          objectFit: rounded > 0 ? 'cover' : 'contain',
          borderRadius: radiusFromPercent(px, px, rounded),
          display: 'block',
          flex: 'none',
          pointerEvents: 'none'
        }}
      />
    )
  }

  if (mode === 'symbol') {
    return (
      <span
        aria-hidden
        style={{
          fontSize: px,
          margin: padPx,
          lineHeight: 1,
          color,
          flex: 'none',
          pointerEvents: 'none'
        }}
      >
        {symbol}
      </span>
    )
  }

  return (
    <svg
      aria-hidden
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ color, flex: 'none', display: 'block' }}
    >
      {renderIconPath(iconType, 2)}
    </svg>
  )
}
