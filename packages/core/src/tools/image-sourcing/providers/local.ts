/**
 * Offline asset library.
 *
 * A small curated set of flat vector illustrations bundled with the editor, so
 * the pipeline still works without any network access. The assets are ordinary
 * candidates: they go through the same vision verification as search results.
 */

import type {
  ImageAsset,
  ImageAssetProvider,
  ImageAssetSearchOptions
} from '#core/tools/image-sourcing/types'

interface LocalAsset {
  id: string
  title: string
  description: string
  tags: string[]
  width: number
  height: number
  svg: string
}

const SKYLINE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
  <rect width="1600" height="900" fill="#1b2540"/>
  <circle cx="1180" cy="300" r="130" fill="#f6c667"/>
  <rect x="0" y="620" width="1600" height="280" fill="#0f1729"/>
  <rect x="90" y="380" width="180" height="360" fill="#31406a"/>
  <rect x="300" y="260" width="150" height="480" fill="#3d4f80"/>
  <rect x="480" y="450" width="200" height="290" fill="#27335a"/>
  <rect x="720" y="330" width="140" height="410" fill="#31406a"/>
  <rect x="900" y="200" width="170" height="540" fill="#455a92"/>
  <rect x="1110" y="420" width="190" height="320" fill="#2c3a63"/>
  <rect x="1340" y="310" width="160" height="430" fill="#3d4f80"/>
  <g fill="#f6c667">
    <rect x="120" y="420" width="30" height="22"/><rect x="180" y="420" width="30" height="22"/>
    <rect x="120" y="480" width="30" height="22"/><rect x="180" y="480" width="30" height="22"/>
    <rect x="330" y="300" width="26" height="20"/><rect x="386" y="300" width="26" height="20"/>
    <rect x="330" y="360" width="26" height="20"/><rect x="386" y="360" width="26" height="20"/>
    <rect x="512" y="490" width="26" height="20"/><rect x="568" y="490" width="26" height="20"/>
    <rect x="750" y="370" width="24" height="20"/><rect x="800" y="370" width="24" height="20"/>
    <rect x="930" y="250" width="28" height="22"/><rect x="994" y="250" width="28" height="22"/>
    <rect x="930" y="320" width="28" height="22"/><rect x="994" y="320" width="28" height="22"/>
    <rect x="1140" y="460" width="26" height="20"/><rect x="1200" y="460" width="26" height="20"/>
    <rect x="1370" y="350" width="26" height="20"/><rect x="1430" y="350" width="26" height="20"/>
  </g>
</svg>`

const COFFEE_CUP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="#f5efe6"/>
  <circle cx="512" cy="520" r="330" fill="#eadfd0"/>
  <path d="M300 400 h380 v190 a190 190 0 0 1 -190 190 h0 a190 190 0 0 1 -190 -190 z" fill="#ffffff"/>
  <path d="M300 400 h380 v70 h-380 z" fill="#6f4a2e"/>
  <path d="M680 440 a110 110 0 0 1 0 200" fill="none" stroke="#ffffff" stroke-width="34"/>
  <rect x="250" y="790" width="480" height="34" rx="17" fill="#6f4a2e"/>
  <g stroke="#c9b7a4" stroke-width="14" stroke-linecap="round" fill="none">
    <path d="M420 330 c0 -50 50 -50 50 -100"/>
    <path d="M520 330 c0 -70 60 -70 60 -130"/>
  </g>
</svg>`

const SCOOTER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 768" width="1024" height="768">
  <rect width="1024" height="768" fill="#eef4f7"/>
  <circle cx="280" cy="600" r="130" fill="none" stroke="#2b3a4a" stroke-width="26"/>
  <circle cx="760" cy="600" r="130" fill="none" stroke="#2b3a4a" stroke-width="26"/>
  <path d="M280 600 h250 l110 -250 h80" fill="none" stroke="#ff7a45" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M300 430 h190" fill="none" stroke="#2b3a4a" stroke-width="26" stroke-linecap="round"/>
  <rect x="380" y="330" width="230" height="34" rx="17" fill="#2b3a4a"/>
  <path d="M600 380 l40 -130 h90" fill="none" stroke="#2b3a4a" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="520" cy="450" r="46" fill="#ffd166" stroke="#2b3a4a" stroke-width="16"/>
</svg>`

const PERSON_LAPTOP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" width="1200" height="900">
  <rect width="1200" height="900" fill="#f2f6fb"/>
  <rect x="120" y="600" width="960" height="26" rx="13" fill="#c9d6e6"/>
  <circle cx="470" cy="300" r="90" fill="#f6c667"/>
  <path d="M330 720 c0 -150 60 -230 140 -230 s140 80 140 230 z" fill="#3f6fd8"/>
  <path d="M600 620 h280 l-60 120 h-280 z" fill="#2b3a4a"/>
  <rect x="620" y="520" width="300" height="110" rx="14" fill="#3b4a63"/>
  <rect x="640" y="545" width="260" height="60" rx="8" fill="#9fd0ff"/>
  <path d="M700 620 l-40 90" fill="none" stroke="#2b3a4a" stroke-width="18" stroke-linecap="round"/>
</svg>`

const MOUNTAIN_LANDSCAPE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
  <rect width="1600" height="900" fill="#ffeede"/>
  <circle cx="1250" cy="240" r="110" fill="#ffb347"/>
  <path d="M0 900 L420 330 L760 900 z" fill="#5a7fb5"/>
  <path d="M420 330 L560 540 L480 560 L420 500 L340 570 L260 540 z" fill="#ffffff"/>
  <path d="M560 900 L980 420 L1400 900 z" fill="#3f5f96"/>
  <path d="M980 420 L1120 620 L1020 640 L980 580 L900 640 L840 600 z" fill="#ffffff"/>
  <rect x="0" y="760" width="1600" height="140" fill="#2f4a72"/>
  <path d="M120 800 q120 -60 240 0 t240 0 t240 0 t240 0 t240 0 t240 0" fill="none" stroke="#6f9ad1" stroke-width="14"/>
</svg>`

const ABSTRACT_GRADIENT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800">
  <defs>
    <radialGradient id="g1" cx="30%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#7c5cff"/><stop offset="100%" stop-color="#2b1d6b"/>
    </radialGradient>
    <radialGradient id="g2" cx="75%" cy="70%" r="60%">
      <stop offset="0%" stop-color="#31d0d6"/><stop offset="100%" stop-color="#0b6b74"/>
    </radialGradient>
    <radialGradient id="g3" cx="55%" cy="20%" r="45%">
      <stop offset="0%" stop-color="#ff7ab8"/><stop offset="100%" stop-color="#7c2b6b" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="800" fill="#140f2b"/>
  <rect width="1200" height="800" fill="url(#g1)"/>
  <rect width="1200" height="800" fill="url(#g2)" opacity="0.85"/>
  <rect width="1200" height="800" fill="url(#g3)" opacity="0.7"/>
</svg>`

const EMPTY_STATE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <rect width="800" height="600" fill="#ffffff"/>
  <rect x="150" y="120" width="500" height="330" rx="28" fill="#eef2f9"/>
  <rect x="200" y="180" width="200" height="22" rx="11" fill="#c2cde0"/>
  <rect x="200" y="230" width="380" height="18" rx="9" fill="#d7dfec"/>
  <rect x="200" y="266" width="320" height="18" rx="9" fill="#d7dfec"/>
  <circle cx="580" cy="150" r="56" fill="#ffd166"/>
  <path d="M556 150 l16 18 l32 -36" fill="none" stroke="#2b3a4a" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M330 470 q70 -50 140 0" fill="none" stroke="#c2cde0" stroke-width="16" stroke-linecap="round"/>
</svg>`

const GRAIN_TEXTURE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3"/></filter>
  </defs>
  <rect width="800" height="800" fill="#e8e4dc"/>
  <rect width="800" height="800" filter="url(#noise)" opacity="0.35"/>
</svg>`

const LOCAL_ASSETS: LocalAsset[] = [
  {
    id: 'city-skyline',
    title: 'Flat city skyline at dusk',
    description: 'Flat 2D vector illustration of a city skyline with lit windows at dusk',
    tags: ['city', 'skyline', 'urban', 'building', 'cityscape', 'dusk', 'night', 'skyline'],
    width: 1600,
    height: 900,
    svg: SKYLINE
  },
  {
    id: 'coffee-cup',
    title: 'Flat coffee cup',
    description: 'Flat 2D vector illustration of a cup of coffee on a table',
    tags: ['coffee', 'cup', 'espresso', 'latte', 'drink', 'cafe', 'breakfast'],
    width: 1024,
    height: 1024,
    svg: COFFEE_CUP
  },
  {
    id: 'scooter',
    title: 'Flat scooter',
    description: 'Flat 2D vector illustration of a kick scooter',
    tags: ['scooter', 'kick scooter', 'moped', 'vehicle', 'transport', 'micromobility'],
    width: 1024,
    height: 768,
    svg: SCOOTER
  },
  {
    id: 'person-laptop',
    title: 'Flat person working on a laptop',
    description: 'Flat 2D vector illustration of a person working at a laptop',
    tags: [
      'person',
      'laptop',
      'worker',
      'remote work',
      'office',
      'desk',
      'freelancer',
      'developer'
    ],
    width: 1200,
    height: 900,
    svg: PERSON_LAPTOP
  },
  {
    id: 'mountain-landscape',
    title: 'Flat mountain landscape',
    description: 'Flat 2D vector illustration of snow capped mountains with a rising sun',
    tags: ['mountain', 'landscape', 'nature', 'sunset', 'sunrise', 'outdoors', 'hiking', 'valley'],
    width: 1600,
    height: 900,
    svg: MOUNTAIN_LANDSCAPE
  },
  {
    id: 'abstract-gradient',
    title: 'Abstract gradient mesh',
    description: 'Abstract violet and cyan gradient mesh background',
    tags: ['abstract', 'gradient', 'background', 'mesh', 'blur', 'texture', 'hero'],
    width: 1200,
    height: 800,
    svg: ABSTRACT_GRADIENT
  },
  {
    id: 'empty-state',
    title: 'Empty state illustration',
    description: 'Flat 2D vector illustration of an empty state panel with a checkmark badge',
    tags: ['empty state', 'illustration', 'placeholder', 'no data', 'dashboard', 'card'],
    width: 800,
    height: 600,
    svg: EMPTY_STATE
  },
  {
    id: 'grain-texture',
    title: 'Subtle grain texture',
    description: 'Neutral paper grain texture for backgrounds',
    tags: ['texture', 'grain', 'paper', 'noise', 'subtle', 'background'],
    width: 800,
    height: 800,
    svg: GRAIN_TEXTURE
  }
]

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2)
}

function scoreAsset(asset: LocalAsset, tokens: string[]): number {
  if (tokens.length === 0) return 0
  const haystack = `${asset.title} ${asset.description} ${asset.tags.join(' ')}`.toLowerCase()
  let score = 0
  for (const token of tokens) {
    if (asset.tags.some((tag) => tag.includes(token))) score += 3
    else if (haystack.includes(token)) score += 1
  }
  return score
}

/** Creates the offline asset provider. */
export function createLocalAssetProvider(): ImageAssetProvider {
  return {
    name: 'local',
    isConfigured: () => true,
    async search(query, options: ImageAssetSearchOptions) {
      const tokens = tokenize(query)
      const ranked = LOCAL_ASSETS.map((asset) => ({ asset, score: scoreAsset(asset, tokens) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, options.limit)
      return ranked.map(({ asset }) => toAsset(asset))
    }
  }
}

function toAsset(asset: LocalAsset): ImageAsset {
  return {
    id: asset.id,
    provider: 'local',
    url: `open-pencil://local/${asset.id}.svg`,
    inlineSource: asset.svg,
    title: asset.title,
    description: asset.description,
    mimeType: 'image/svg+xml',
    width: asset.width,
    height: asset.height,
    license: 'Bundled with OpenPencil',
    attribution: 'OpenPencil bundled illustration',
    usageRestrictions: 'Free to use inside OpenPencil documents',
    commercialUse: true,
    modificationAllowed: true,
    requiresAttribution: false,
    kind: 'svg'
  }
}

/** The SVG source of a bundled asset, used for import and rasterization. */
export function getLocalAssetSVG(id: string): string | null {
  return LOCAL_ASSETS.find((asset) => asset.id === id)?.svg ?? null
}

/** Every bundled asset, used by the offline fallback path. */
export function listLocalAssets(): LocalAsset[] {
  return LOCAL_ASSETS
}
