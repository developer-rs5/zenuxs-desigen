/** Layer and paint blend modes (the list Figma's blend menu shows).
 * (Converted 1:1 from FigCraft `crates/color/src/blend.rs`.) */

export type BlendMode =
  | 'passThrough'
  | 'normal'
  | 'darken'
  | 'multiply'
  | 'plusDarker'
  | 'colorBurn'
  | 'lighten'
  | 'screen'
  | 'plusLighter'
  | 'colorDodge'
  | 'overlay'
  | 'softLight'
  | 'hardLight'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

export const BlendMode = {
  /** Every mode in menu order, with separators implied between groups. */
  ALL: [
    'passThrough',
    'normal',
    'darken',
    'multiply',
    'plusDarker',
    'colorBurn',
    'lighten',
    'screen',
    'plusLighter',
    'colorDodge',
    'overlay',
    'softLight',
    'hardLight',
    'difference',
    'exclusion',
    'hue',
    'saturation',
    'color',
    'luminosity'
  ] as const,

  label(m: BlendMode): string {
    switch (m) {
      case 'passThrough':
        return 'Pass through'
      case 'normal':
        return 'Normal'
      case 'darken':
        return 'Darken'
      case 'multiply':
        return 'Multiply'
      case 'plusDarker':
        return 'Plus darker'
      case 'colorBurn':
        return 'Color burn'
      case 'lighten':
        return 'Lighten'
      case 'screen':
        return 'Screen'
      case 'plusLighter':
        return 'Plus lighter'
      case 'colorDodge':
        return 'Color dodge'
      case 'overlay':
        return 'Overlay'
      case 'softLight':
        return 'Soft light'
      case 'hardLight':
        return 'Hard light'
      case 'difference':
        return 'Difference'
      case 'exclusion':
        return 'Exclusion'
      case 'hue':
        return 'Hue'
      case 'saturation':
        return 'Saturation'
      case 'color':
        return 'Color'
      case 'luminosity':
        return 'Luminosity'
    }
  },

  /** The CSS `mix-blend-mode` keyword (for SVG/CSS export). */
  css(m: BlendMode): string {
    switch (m) {
      case 'passThrough':
      case 'normal':
        return 'normal'
      case 'darken':
        return 'darken'
      case 'multiply':
        return 'multiply'
      case 'plusDarker':
        return 'plus-darker'
      case 'colorBurn':
        return 'color-burn'
      case 'lighten':
        return 'lighten'
      case 'screen':
        return 'screen'
      case 'plusLighter':
        return 'plus-lighter'
      case 'colorDodge':
        return 'color-dodge'
      case 'overlay':
        return 'overlay'
      case 'softLight':
        return 'soft-light'
      case 'hardLight':
        return 'hard-light'
      case 'difference':
        return 'difference'
      case 'exclusion':
        return 'exclusion'
      case 'hue':
        return 'hue'
      case 'saturation':
        return 'saturation'
      case 'color':
        return 'color'
      case 'luminosity':
        return 'luminosity'
    }
  },

  /**
   * The mode named by its label or CSS keyword, ignoring case, spaces and
   * dashes. Labels come first: "normal" is Normal, not pass-through (whose CSS
   * keyword is also `normal`).
   */
  fromName(s: string): BlendMode | null {
    const key = s
      .split('')
      .filter((c) => /[a-z0-9]/i.test(c))
      .join('')
      .toLowerCase()
    const byLabel = BlendMode.ALL.find(
      (m) => BlendMode.label(m).replace(/ /g, '').toLowerCase() === key
    )
    if (byLabel) return byLabel
    return BlendMode.ALL.find((m) => BlendMode.css(m).replace(/-/g, '') === key) ?? null
  },

  default(): BlendMode {
    return 'normal'
  }
}
