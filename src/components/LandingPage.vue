<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { readRedirectTarget } from '@/app/auth/redirect'
import { authReady, currentUser, isAuthenticated, loginWithZenuxsTag } from '@/app/auth/zenuxs'
import GlassIcon from '@/components/originkit/GlassIcon.vue'
import StarfieldButton from '@/components/originkit/StarfieldButton.vue'

const router = useRouter()
const route = useRoute()
const storedTheme = useStorage<'dark' | 'light'>('zenuxs-theme', 'dark')
const theme = ref<'dark' | 'light'>(storedTheme.value)
const pageRoot = ref<HTMLElement | null>(null)
const signingIn = ref(false)

// Honour the route the visitor was originally denied, e.g. /demo or /share/:id.
const postSignInRoute = computed(() => readRedirectTarget(route.query.redirect))

let revealObserver: IntersectionObserver | undefined

// SPA-navigate once auth resolves — avoids the cold-boot reload that rendered a
// broken shell the first time around.
watch(
  () => [authReady.value, isAuthenticated.value] as const,
  ([ready, authed]) => {
    if (ready && authed) router.push(postSignInRoute.value)
  },
  { immediate: true }
)

const glassBg = computed(() => (theme.value === 'dark' ? '#111315' : '#F5F5F0'))
const glassFg = computed(() => (theme.value === 'dark' ? '#F5F7FA' : '#0D0F12'))

onMounted(() => {
  document.documentElement.dataset.theme = theme.value

  revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in')
          revealObserver?.unobserve(entry.target)
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
  )
  pageRoot.value?.querySelectorAll('[data-reveal]').forEach((el) => revealObserver?.observe(el))
})

onUnmounted(() => revealObserver?.disconnect())

function setTheme(next: 'dark' | 'light') {
  theme.value = next
  document.documentElement.dataset.theme = next
  storedTheme.value = next
}

async function handleGetStarted() {
  if (signingIn.value) return
  if (isAuthenticated.value) {
    router.push(postSignInRoute.value)
    return
  }
  signingIn.value = true
  loginWithZenuxsTag(
    () => {
      signingIn.value = false
      router.push(postSignInRoute.value)
    },
    () => {
      signingIn.value = false
    }
  )
}

async function handleContinue() {
  if (signingIn.value) return
  router.push(postSignInRoute.value)
}

function handleExplore() {
  router.push(postSignInRoute.value)
}

const aiFeatures = [
  {
    title: 'Generate',
    description: 'Turn a rough idea into an editable interface.',
    details:
      'Describe what you need in plain language. ZenuxsDesign generates a full layout with real components you can tweak, rearrange and refine.'
  },
  {
    title: 'Improve',
    description: 'Select anything and ask AI to refine it.',
    details:
      'Pick a section, a card or the whole page and ask for changes — better spacing, bolder typography or a different layout direction.'
  },
  {
    title: 'Components',
    description: 'Build reusable patterns and design systems.',
    details:
      'Generate a component once, reuse it everywhere. AI understands design systems and keeps your patterns consistent.'
  },
  {
    title: 'Code',
    description: 'Move from visual design to implementation.',
    details: 'Export any design as production-ready JSX, Tailwind or HTML/CSS with a single action.'
  }
]

const featureGroups = [
  {
    title: 'Visual editor',
    description: 'Shapes, vectors, text, images and precision tools.',
    details: 'A full-featured canvas with rulers, layers, components and real-time collaboration.'
  },
  {
    title: 'Pages & layers',
    description: 'Keep complex projects structured and easy to navigate.',
    details: 'Organize work across multiple pages with a hierarchical layer tree and search.'
  },
  {
    title: 'Components',
    description: 'Create reusable building blocks without leaving the canvas.',
    details:
      'Design once, instance everywhere. Override properties per instance while staying linked.'
  },
  {
    title: 'Design systems',
    description: 'Shared tokens, styles and variables across your work.',
    details: 'Define colors, spacing, typography and effects as variables that update everywhere.'
  },
  {
    title: 'Responsive',
    description: 'Compose layouts for every viewport and breakpoint.',
    details:
      'Auto-layout, constraints and responsive breakpoints keep designs flexible at any size.'
  },
  {
    title: 'Code export',
    description: 'Take designs into JSX, Tailwind or HTML/CSS.',
    details: 'Live preview, copy-ready code and real framework output — not a static screenshot.'
  }
]

const steps = [
  {
    number: '01',
    title: 'Describe',
    copy: 'Start with the product idea, screen or interaction you have in mind.'
  },
  {
    number: '02',
    title: 'Shape',
    copy: 'Edit the generated result directly on the canvas with full control.'
  },
  { number: '03', title: 'Ship', copy: 'Polish the design and move it into production-ready code.' }
]

const marqueeWords = [
  'Generate',
  'Improve',
  'Components',
  'Tokens & styles',
  'Responsive',
  'Code export'
]
</script>

<template>
  <div ref="pageRoot" class="lx h-full overflow-y-auto bg-canvas text-surface" :data-theme="theme">
    <!-- ===== HEADER ===== -->
    <header class="hdr">
      <div class="mx-auto flex h-16 max-w-7xl items-center gap-8 px-6 lg:px-10">
        <button class="flex shrink-0 items-center gap-2.5" @click="router.push('/')">
          <span class="logo brk">Z</span>
          <span class="wmark">Zenuxs<span class="wmark-dim">Design</span></span>
          <span class="beta mono">Beta</span>
        </button>

        <nav class="hidden flex-1 items-center justify-center gap-8 md:flex" aria-label="Primary">
          <a href="#ai" class="navl mono">AI</a>
          <a href="#features" class="navl mono">Features</a>
          <a href="#workflow" class="navl mono">Workflow</a>
        </nav>

        <div class="ml-auto flex items-center gap-2">
          <button class="thm" @click="setTheme(theme === 'dark' ? 'light' : 'dark')">
            <icon-lucide-sun v-if="theme === 'dark'" class="size-4" />
            <icon-lucide-moon v-else class="size-4" />
          </button>
          <template v-if="!authReady">
            <div class="h-9 w-20 animate-pulse rounded-lg bg-panel-secondary" />
          </template>
          <template v-else-if="isAuthenticated && currentUser">
            <button class="profile-btn" @click="handleContinue">
              <img
                v-if="currentUser.picture"
                :src="currentUser.picture"
                :alt="currentUser.name || 'Profile'"
                class="profile-avatar"
              />
              <span v-else class="profile-initial">{{ (currentUser.name || 'U')[0] }}</span>
            </button>
          </template>
          <template v-else>
            <StarfieldButton
              border-color="rgba(255,255,255,.1)"
              :border-width="1"
              face-background="transparent"
              :light-count="10"
              :light-size="40"
              light-color="rgba(59,130,246,.3)"
              padding="8px 16px"
              border-radius="8px"
              @click="handleGetStarted"
            >
              <span class="sbtn-text">Sign in</span>
            </StarfieldButton>
          </template>
        </div>
      </div>
    </header>

    <main>
      <!-- ===== HERO ===== -->
      <section class="hero">
        <div class="hero-dots" aria-hidden="true" />
        <div class="mx-auto max-w-7xl px-6 py-20 sm:px-8 sm:py-24 lg:py-28">
          <div class="hero-grid">
            <div data-reveal>
              <div class="hero-badge mono">
                <span class="badge-dot" />
                AI-native visual design
              </div>

              <h1 class="hero-h1">
                Design at the<br />
                <span class="hero-grad">speed of thought.</span>
              </h1>

              <p class="hero-sub">
                A modern AI-powered design workspace for creating beautiful interfaces, components
                and production-ready experiences.
              </p>

              <div class="hero-btns">
                <button
                  class="zx-btn"
                  :disabled="signingIn"
                  @click="isAuthenticated ? handleContinue() : handleGetStarted()"
                >
                  <template v-if="signingIn">Signing in…</template>
                  <template v-else-if="isAuthenticated">Continue to editor</template>
                  <template v-else>Start designing →</template>
                </button>
                <button class="zx-btn ghost" @click="handleExplore">Open editor ⌘</button>
              </div>

              <div class="trust-row mono">
                <span class="tri"><span class="tsep">+</span> No setup tour</span>
                <span class="tri"><span class="tsep">+</span> Editable from first result</span>
                <span class="tri"><span class="tsep">+</span> Built for real projects</span>
              </div>
            </div>

            <div class="hero-right" data-reveal>
              <div class="hero-glass" role="img" aria-label="Zenuxs design in liquid glass">
                <GlassIcon
                  shape="Torus"
                  :size="88"
                  :depth="40"
                  :speed="130"
                  :background="glassBg"
                  :backdrop="{
                    type: 'Text',
                    text: 'Zenuxs',
                    textColor: glassFg,
                    font: {
                      fontFamily: 'Inter, system-ui, sans-serif',
                      fontSize: 120,
                      fontWeight: 700
                    }
                  }"
                  :glass="{ tint: '#8AB4FF', chromatic: 30, frost: 35 }"
                  class="hero-glass-obj"
                />
              </div>
            </div>
          </div>

          <div class="mt-16 lg:mt-20" data-reveal>
            <div class="product-window">
              <div class="window-topbar">
                <div class="flex items-center gap-1.5">
                  <span class="window-dot" /><span class="window-dot" /><span class="window-dot" />
                </div>
                <div class="window-title"><span class="pwin-logo">Z</span>ZenuxsDesign</div>
                <div class="window-meta mono">AI / Canvas</div>
              </div>

              <div class="window-body">
                <aside class="window-sidebar left">
                  <div class="window-sidebar-title">Layers</div>
                  <div class="window-line strong w-16" />
                  <div class="window-tree-row active">
                    <span class="tree-square accent" />Website
                  </div>
                  <div class="window-tree-row indent"><span class="tree-square" />Header</div>
                  <div class="window-tree-row indent"><span class="tree-square accent" />Hero</div>
                  <div class="window-tree-row indent-2"><span class="tree-square" />CTA</div>
                  <div class="window-tree-row indent-2"><span class="tree-square" />Stats</div>
                  <div class="window-tree-row"><span class="tree-square" />Footer</div>
                </aside>

                <div class="window-canvas">
                  <div class="canvas-ruler-top">
                    <span>0</span><span>240</span><span>480</span><span>720</span><span>960</span>
                  </div>
                  <div class="canvas-ruler-left">
                    <span>0</span><span>120</span><span>240</span><span>360</span><span>480</span>
                  </div>
                  <div class="artboard">
                    <div class="artboard-nav">
                      <span class="artboard-logo">zenuxs</span>
                      <span>Work</span><span>Studio</span><span>About</span>
                      <span class="artboard-cta">Start a project</span>
                    </div>
                    <div class="artboard-kicker">A new way to build on the web</div>
                    <div class="artboard-heading">
                      Design systems<br /><span>without the drag.</span>
                    </div>
                    <div class="artboard-copy">
                      From the first frame to production, everything lives in one visual workspace.
                    </div>
                    <div class="artboard-actions">
                      <span class="artboard-primary">Explore</span><span>Read the story →</span>
                    </div>
                    <div class="artboard-stats">
                      <span>01 / Visual</span><span>02 / AI</span><span>03 / Code</span>
                    </div>
                  </div>
                  <div class="canvas-selection" aria-hidden="true" />
                </div>

                <aside class="window-sidebar right">
                  <div class="window-tabs">
                    <span class="selected">Design</span><span>Code</span
                    ><span class="selected-ai">AI</span>
                  </div>
                  <div class="window-sidebar-title">AI design</div>
                  <div class="ai-note">Describe a change. Keep the result editable.</div>
                  <div class="ai-prompt-mini">Make this hero more editorial.</div>
                  <div class="ai-chips">
                    <span>Improve</span><span>Responsive</span><span>Code</span>
                  </div>
                  <div class="ai-result-mini">
                    <div class="result-line long" />
                    <div class="result-line" />
                    <div class="result-box" />
                  </div>
                </aside>
              </div>
            </div>
            <div class="preview-caption mono">
              <span>The editor</span>
              <span>Visual canvas / Layers / AI / Code</span>
            </div>
          </div>
        </div>
      </section>

      <!-- ===== MARQUEE ===== -->
      <div class="mq" aria-hidden="true">
        <div class="mq-track">
          <ul class="mono">
            <li v-for="w in marqueeWords" :key="w">
              <span>{{ w }}</span
              ><span class="mq-sep">+</span>
            </li>
          </ul>
          <ul class="mono" aria-hidden="true">
            <li v-for="w in marqueeWords" :key="`d-${w}`">
              <span>{{ w }}</span
              ><span class="mq-sep">+</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- ===== 01 / AI ===== -->
      <section id="ai" class="sec">
        <div class="mx-auto max-w-6xl px-6 sm:px-8">
          <div class="sec-head" data-reveal>
            <div class="sec-label mono"><span class="lsq" />01 / AI layer</div>
            <h2 class="sec-title">AI that lives <em class="serif">inside the canvas.</em></h2>
            <p class="sec-copy max-w-xl">
              Generate, improve and translate ideas without handing control of the design over to a
              black box.
            </p>
          </div>

          <div class="ai-grid" data-reveal>
            <article
              v-for="(f, i) in aiFeatures"
              :key="f.title"
              class="aic"
              :class="{ featured: i === 0 }"
            >
              <div class="aic-icon">
                <icon-lucide-wand-2 v-if="i === 0" class="size-5" />
                <icon-lucide-sparkles v-else-if="i === 1" class="size-5" />
                <icon-lucide-layout-grid v-else-if="i === 2" class="size-5" />
                <icon-lucide-code v-else class="size-5" />
              </div>
              <div class="aic-idx mono">{{ String(i + 1).padStart(2, '0') }}</div>
              <h3>{{ f.title }}</h3>
              <p class="aic-desc">{{ f.description }}</p>
              <p class="aic-detail">{{ f.details }}</p>
            </article>
          </div>
        </div>
      </section>

      <!-- ===== 02 / FEATURES ===== -->
      <section id="features" class="sec pt-0">
        <div class="mx-auto max-w-6xl px-6 sm:px-8">
          <div class="sec-head split" data-reveal>
            <div>
              <div class="sec-label mono"><span class="lsq" />02 / Workspace</div>
              <h2 class="sec-title">A serious editor with <em class="serif">less chrome.</em></h2>
            </div>
            <p class="sec-copy max-w-sm">
              The product stays quiet so the work can stay loud: clear hierarchy, compact controls
              and surfaces that earn their space.
            </p>
          </div>

          <div class="feat-grid" data-reveal>
            <article v-for="(f, i) in featureGroups" :key="f.title" class="fc">
              <div class="fc-icon">
                <icon-lucide-pen-tool v-if="i === 0" class="size-4" />
                <icon-lucide-layers v-else-if="i === 1" class="size-4" />
                <icon-lucide-layout-grid v-else-if="i === 2" class="size-4" />
                <icon-lucide-palette v-else-if="i === 3" class="size-4" />
                <icon-lucide-smartphone v-else-if="i === 4" class="size-4" />
                <icon-lucide-code v-else class="size-4" />
              </div>
              <div class="min-w-0">
                <h3>{{ f.title }}</h3>
                <p class="fc-desc">{{ f.description }}</p>
              </div>
              <icon-lucide-arrow-up-right class="fc-arrow size-4" />
            </article>
          </div>
        </div>
      </section>

      <!-- ===== 03 / WORKFLOW ===== -->
      <section id="workflow" class="sec wf">
        <div class="mx-auto max-w-7xl px-5 sm:px-7">
          <div class="wf-frame" data-reveal>
            <div class="sec-label mono"><span class="lsq" />03 / Workflow</div>
            <div class="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start mt-8">
              <div>
                <h2 class="sec-title">
                  One place from blank page to <em class="serif">shipped interface.</em>
                </h2>
                <p class="sec-copy mt-6 max-w-md">
                  A deliberately short path. Start visually, use AI where it helps, and keep every
                  decision editable.
                </p>
              </div>
              <div class="steps-list">
                <div v-for="step in steps" :key="step.number" class="step-row">
                  <span class="step-num mono">{{ step.number }}</span>
                  <div>
                    <h3>{{ step.title }}</h3>
                    <p>{{ step.copy }}</p>
                  </div>
                  <icon-lucide-arrow-up-right class="size-4 step-arrow" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ===== FINAL CTA ===== -->
      <section class="sec final">
        <div class="mx-auto max-w-7xl px-5 sm:px-7">
          <div class="final-card" data-reveal>
            <div class="final-dots" aria-hidden="true" />
            <div class="relative z-10 max-w-3xl">
              <div class="sec-label mono"><span class="lsq" />ZenuxsDesign / Beta</div>
              <h2 class="final-h2">
                Build what you can <em class="serif">already see</em> in your head.
              </h2>
              <p class="sec-copy mt-6 max-w-xl">
                Open the editor and start with a frame, a sentence or a half-formed idea.
              </p>
              <button
                class="final-input mono"
                @click="isAuthenticated ? handleContinue() : handleGetStarted()"
              >
                <span class="fi-mark">▸</span>
                <span class="fi-text"
                  >describe your interface…<i class="caret" aria-hidden="true"
                /></span>
                <span class="fi-kbd mono">Enter</span>
              </button>
              <div class="mt-6">
                <button
                  class="zx-btn"
                  :disabled="signingIn"
                  @click="isAuthenticated ? handleContinue() : handleGetStarted()"
                >
                  <template v-if="signingIn">Signing in…</template>
                  <template v-else-if="isAuthenticated">Continue to editor →</template>
                  <template v-else>Enter ZenuxsDesign →</template>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- ===== FOOTER ===== -->
    <footer class="ft">
      <div
        class="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-10"
      >
        <div class="flex items-center gap-2.5">
          <span class="logo logo-xs brk">Z</span>
          <span class="mono ft-copy">© 2026 ZenuxsDesign</span>
        </div>
        <div class="flex gap-6">
          <a href="#ai" class="ft-link mono">AI</a>
          <a href="#features" class="ft-link mono">Features</a>
          <a href="#workflow" class="ft-link mono">Workflow</a>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* ============ TOKENS ============ */
.lx {
  --ink: #0d0f12;
  --bg: #f5f5f0;
  --surface: #0d0f12;
  --muted: #6b7280;
  --border: #d4d4d4;
  --accent: #0d0f12;
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-serif: 'DM Serif Display', Georgia, serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  font-family: var(--font-sans);
}
.lx[data-theme='dark'] {
  --ink: #f5f7fa;
  --bg: #111315;
  --surface: #f5f7fa;
  --muted: #737a85;
  --border: #292d33;
  --accent: #f5f7fa;
}
.lx ::selection {
  background: var(--surface);
  color: var(--bg);
}
.mono {
  font-family: var(--font-mono);
}
.serif {
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 400;
}

/* ============ REVEAL ANIMATION ============ */
[data-reveal] {
  opacity: 0;
  transform: translateY(32px);
  transition:
    opacity 0.7s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.7s cubic-bezier(0.4, 0, 0.2, 1);
  transition-delay: var(--rd, 0s);
}
[data-reveal].is-in {
  opacity: 1;
  transform: none;
}

/* ============ HEADER ============ */
.hdr {
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(14px);
}
.logo {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  color: var(--surface);
  font-size: 14px;
  font-weight: 700;
}
.logo-xs {
  width: 24px;
  height: 24px;
  font-size: 11px;
  border-radius: 6px;
}
.brk {
  position: relative;
}
.brk::before,
.brk::after {
  content: '';
  position: absolute;
  width: 6px;
  height: 6px;
  border: 0 solid var(--surface);
  transition: all 0.25s ease;
  pointer-events: none;
}
.brk::before {
  top: -1px;
  left: -1px;
  border-top-width: 1.5px;
  border-left-width: 1.5px;
}
.brk::after {
  bottom: -1px;
  right: -1px;
  border-bottom-width: 1.5px;
  border-right-width: 1.5px;
}
.brk:hover::before {
  top: -4px;
  left: -4px;
}
.brk:hover::after {
  bottom: -4px;
  right: -4px;
}
.wmark {
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.wmark-dim {
  color: var(--muted);
  font-weight: 450;
}
.beta {
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 999px;
  padding: 2px 7px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.navl {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  transition: color 0.2s;
}
.navl:hover {
  color: var(--surface);
}
.thm {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  transition: all 0.2s;
}
.thm:hover {
  color: var(--surface);
  border-color: var(--muted);
}
.sbtn {
  font-size: 13px;
  font-weight: 500;
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--surface);
  cursor: pointer;
  transition: all 0.2s;
}
.sbtn:hover {
  background: var(--ink);
  color: var(--bg);
}
.sbtn.primary {
  background: var(--surface);
  color: var(--bg);
  border-color: var(--surface);
}
.sbtn.primary:hover {
  opacity: 0.85;
}
.sbtn-text {
  color: var(--surface);
  font-size: 13px;
  font-weight: 500;
}
.profile-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
  background: var(--ink);
  color: var(--bg);
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
}
.profile-btn:hover {
  border-color: var(--muted);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--surface) 12%, transparent);
}
.profile-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.profile-initial {
  font-size: 14px;
  font-weight: 600;
}

/* ============ HERO ============ */
.hero {
  position: relative;
  overflow: hidden;
}
.hero-dots {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(var(--border) 1px, transparent 1.5px);
  background-size: 24px 24px;
  opacity: 0.3;
  mask-image: radial-gradient(ellipse 80% 70% at 50% 0%, black 20%, transparent 70%);
  pointer-events: none;
}
.hero-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 60px;
  align-items: center;
}
.hero-right {
  display: flex;
  justify-content: center;
}
.hero-glass {
  position: relative;
  width: 100%;
  max-width: 520px;
  aspect-ratio: 1;
  border-radius: 24px;
  overflow: hidden;
  background: transparent;
}
.hero-glass-obj {
  width: 100%;
  height: 100%;
}
.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.05em;
  color: var(--muted);
  margin-bottom: 24px;
}
.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--surface);
  animation: pulse 2s ease infinite;
}
.hero-h1 {
  font-size: clamp(42px, 5.5vw, 68px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.05;
}
.hero-grad {
  background: linear-gradient(135deg, var(--surface) 40%, var(--muted));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.hero-sub {
  font-size: 17px;
  color: var(--muted);
  line-height: 1.7;
  margin-top: 20px;
  max-width: 480px;
}
.hero-btns {
  display: flex;
  gap: 12px;
  margin-top: 32px;
  flex-wrap: wrap;
}
.trust-row {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-top: 28px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.tri {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.tsep {
  font-weight: 700;
}

/* ===== ZenuxsDesign product preview ===== */
.product-window {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 17px;
  background: color-mix(in srgb, var(--bg) 92%, var(--surface));
  box-shadow: 0 30px 70px rgba(0, 0, 0, 0.18);
}
.window-topbar {
  position: relative;
  display: flex;
  height: 42px;
  align-items: center;
  border-bottom: 1px solid var(--border);
  padding: 0 13px;
}
.window-dot {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--border);
}
.window-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--muted);
}
.pwin-logo {
  display: inline-flex;
  width: 15px;
  height: 15px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--surface);
  font-size: 8px;
  font-weight: 700;
}
.window-meta {
  margin-left: auto;
  font-size: 9px;
  color: var(--muted);
}
.window-body {
  display: grid;
  min-height: 470px;
  grid-template-columns: 182px minmax(0, 1fr) 210px;
}
.window-sidebar {
  background: color-mix(in srgb, var(--bg) 60%, var(--surface));
  padding: 13px;
}
.window-sidebar.left {
  border-right: 1px solid var(--border);
}
.window-sidebar.right {
  border-left: 1px solid var(--border);
}
.window-sidebar-title {
  margin-bottom: 11px;
  font-size: 9px;
  font-weight: 650;
  color: var(--surface);
}
.window-line {
  height: 7px;
  border-radius: 999px;
  background: var(--border);
  margin-bottom: 13px;
}
.window-line.strong {
  background: color-mix(in srgb, var(--surface) 15%, transparent);
}
.window-tree-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 25px;
  border-radius: 6px;
  padding: 0 6px;
  color: var(--muted);
  font-size: 9px;
}
.window-tree-row.active {
  color: var(--surface);
  background: color-mix(in srgb, var(--surface) 9%, transparent);
}
.window-tree-row.indent {
  padding-left: 17px;
}
.window-tree-row.indent-2 {
  padding-left: 29px;
}
.tree-square {
  width: 6px;
  height: 6px;
  border: 1px solid var(--border);
  border-radius: 2px;
}
.tree-square.accent {
  border-color: var(--surface);
  background: color-mix(in srgb, var(--surface) 28%, transparent);
}
.window-canvas {
  position: relative;
  overflow: hidden;
  background: #101214;
}
.canvas-ruler-top {
  position: absolute;
  inset: 0 0 auto 0;
  display: flex;
  justify-content: space-around;
  height: 24px;
  align-items: center;
  border-bottom: 1px solid var(--border);
  background: #0c0e10;
  color: #626b74;
  font-size: 7px;
}
.canvas-ruler-left {
  position: absolute;
  top: 24px;
  bottom: 0;
  left: 0;
  display: flex;
  width: 24px;
  flex-direction: column;
  align-items: center;
  justify-content: space-around;
  border-right: 1px solid var(--border);
  background: #0c0e10;
  color: #626b74;
  font-size: 7px;
}
.artboard {
  position: absolute;
  top: 58px;
  left: 62px;
  right: 38px;
  bottom: 28px;
  overflow: hidden;
  border: 1px solid #dde0e4;
  border-radius: 5px;
  background: #f8f9f7;
  color: #17191b;
  padding: 26px 34px;
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.24);
}
.artboard-nav {
  display: grid;
  grid-template-columns: 1fr auto auto auto auto;
  align-items: center;
  gap: 18px;
  font-size: 7px;
  color: #5e636a;
}
.artboard-logo {
  color: #17191b;
  font-size: 9px;
  font-weight: 750;
}
.artboard-cta {
  padding: 5px 8px;
  border: 1px solid #cfd4d9;
  border-radius: 5px;
  color: #23272a;
}
.artboard-kicker {
  margin-top: 70px;
  color: #5f7082;
  font-size: 7px;
  font-weight: 650;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.artboard-heading {
  margin-top: 13px;
  font-size: clamp(24px, 4vw, 43px);
  font-weight: 600;
  letter-spacing: -0.06em;
  line-height: 0.93;
}
.artboard-heading span {
  color: #6f7780;
}
.artboard-copy {
  margin-top: 14px;
  max-width: 300px;
  color: #656c73;
  font-size: 9px;
  line-height: 1.6;
}
.artboard-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 19px;
  color: #555c63;
  font-size: 8px;
}
.artboard-primary {
  display: inline-flex;
  padding: 7px 11px;
  border-radius: 6px;
  background: #15191d;
  color: #fff;
}
.artboard-stats {
  position: absolute;
  right: 34px;
  bottom: 26px;
  display: flex;
  gap: 12px;
  color: #7b838b;
  font-size: 7px;
}
.canvas-selection {
  position: absolute;
  top: 116px;
  right: 24%;
  width: 94px;
  height: 46px;
  border: 1px solid #3b82f6;
  border-radius: 3px;
  box-shadow: 0 0 0 9999px rgba(59, 130, 246, 0.035);
}
.window-tabs {
  display: flex;
  gap: 12px;
  margin-bottom: 17px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 9px;
  font-size: 9px;
  color: var(--muted);
}
.window-tabs .selected {
  color: var(--surface);
}
.window-tabs .selected-ai {
  color: #3b82f6;
}
.ai-note {
  color: var(--muted);
  font-size: 8px;
  line-height: 1.55;
}
.ai-prompt-mini {
  margin-top: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 9px;
  background: color-mix(in srgb, var(--bg) 60%, var(--surface));
  color: var(--surface);
  font-size: 8px;
  line-height: 1.4;
}
.ai-chips {
  display: flex;
  gap: 5px;
  overflow: hidden;
  margin-top: 8px;
}
.ai-chips span {
  flex: 0 0 auto;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px 5px;
  color: var(--muted);
  font-size: 7px;
}
.ai-result-mini {
  margin-top: 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 9px;
}
.result-line {
  width: 72%;
  height: 5px;
  border-radius: 99px;
  background: var(--border);
}
.result-line.long {
  width: 92%;
  margin-bottom: 6px;
}
.result-box {
  width: 100%;
  height: 56px;
  margin-top: 10px;
  border-radius: 5px;
  background: color-mix(in srgb, #3b82f6 8%, var(--border));
}
.preview-caption {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-top: 10px;
  color: var(--muted);
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* ============ BUTTONS ============ */
.zx-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 10px;
  background: var(--surface);
  color: var(--bg);
  font-size: 14px;
  font-weight: 600;
  min-height: 44px;
  padding: 12px 20px;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}
.zx-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
.zx-btn.ghost {
  background: transparent;
  border: 1.5px solid var(--border);
  color: var(--surface);
}
.zx-btn.ghost:hover {
  border-color: var(--muted);
  box-shadow: none;
  transform: none;
}

/* ============ MARQUEE ============ */
.mq {
  overflow: hidden;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.mq-track {
  display: flex;
  width: max-content;
  animation: marquee 30s linear infinite;
}
.mq:hover .mq-track {
  animation-play-state: paused;
}
.mq ul {
  display: flex;
  list-style: none;
  align-items: center;
  gap: 2.5rem;
  padding: 14px 2.5rem 14px 0;
}
.mq li {
  display: flex;
  align-items: center;
  gap: 2.5rem;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--muted);
}
.mq-sep {
  color: var(--surface);
  font-weight: 700;
}
@keyframes marquee {
  to {
    transform: translateX(-50%);
  }
}

/* ============ SECTIONS ============ */
.sec {
  padding: 100px 0;
}
.sec-head {
  margin-bottom: 56px;
}
.sec-head.split {
  display: grid;
  gap: 24px;
  grid-template-columns: 1fr auto;
  align-items: end;
}
.sec-head.split .sec-copy {
  margin-top: 0;
}
.sec-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 14px;
}
.lsq {
  width: 6px;
  height: 6px;
  background: var(--surface);
}
.sec-title {
  font-size: clamp(30px, 4.5vw, 44px);
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.15;
}
.sec-copy {
  font-size: 16px;
  color: var(--muted);
  line-height: 1.7;
  margin-top: 14px;
}

/* ============ AI CARDS ============ */
.ai-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-top: 52px;
}
.aic {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 260px;
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 24px;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  background: var(--bg);
}
.aic:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.08);
  border-color: var(--muted);
}
.aic.featured {
  border-color: var(--surface);
}
.aic-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--ink);
  color: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}
.aic-idx {
  font-size: 10px;
  font-weight: 600;
  color: var(--muted);
  letter-spacing: 0.08em;
  margin-bottom: 6px;
}
.aic h3 {
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.01em;
}
.aic-desc {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.55;
  margin-top: 6px;
  font-weight: 500;
}
.aic-detail {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.6;
  margin-top: 8px;
  opacity: 0.65;
  flex: 1;
}

/* ============ FEATURE GRID (hairline rows) ============ */
.feat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--border);
  margin-top: 52px;
}
.fc {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 13px;
  align-items: start;
  min-height: 142px;
  background: var(--bg);
  padding: 22px;
  transition: background 0.25s ease;
}
.fc:hover {
  background: color-mix(in srgb, var(--ink) 4%, var(--bg));
}
.fc-icon {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--ink);
  color: var(--bg);
}
.fc h3 {
  font-size: 13px;
  font-weight: 650;
  letter-spacing: -0.01em;
}
.fc-desc {
  margin-top: 5px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
  font-weight: 500;
}
.fc-arrow {
  color: var(--muted);
  opacity: 0.6;
  transition:
    opacity 0.2s,
    color 0.2s,
    transform 0.2s;
}
.fc:hover .fc-arrow {
  opacity: 1;
  color: var(--surface);
  transform: translate(1px, -1px);
}

/* ============ WORKFLOW ============ */
.wf {
  padding-top: 40px;
}
.wf-frame {
  border-top: 1px solid var(--border);
  padding-top: 40px;
}
.steps-list {
  border-top: 1px solid var(--border);
}
.step-row {
  display: grid;
  grid-template-columns: 52px 1fr auto;
  gap: 16px;
  align-items: center;
  border-bottom: 1px solid var(--border);
  padding: 22px 12px;
  border-radius: 8px;
  transition: background 0.2s;
}
.step-row:hover {
  background: color-mix(in srgb, var(--border) 30%, transparent);
}
.step-num {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
}
.step-row h3 {
  font-size: 15px;
  font-weight: 650;
}
.step-row p {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.55;
  margin-top: 4px;
}
.step-arrow {
  color: var(--muted);
  opacity: 0.5;
  transition: all 0.25s;
}
.step-row:hover .step-arrow {
  opacity: 1;
  color: var(--surface);
  transform: translateX(3px);
}

/* ============ FINAL CTA ============ */
.final {
  padding-top: 60px;
  padding-bottom: 100px;
}
.final-card {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 60px 40px;
  background: color-mix(in srgb, var(--bg) 92%, var(--surface));
}
.final-dots {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(var(--border) 1px, transparent 1.5px);
  background-size: 24px 24px;
  opacity: 0.35;
  mask-image: linear-gradient(to right, black, transparent 60%);
  pointer-events: none;
}
.final-h2 {
  font-size: clamp(34px, 5.5vw, 52px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.05;
  margin-top: 20px;
}
.final-input {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 32px;
  max-width: 32rem;
  width: 100%;
  border: 1.5px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  background: transparent;
  font-size: 14px;
  color: var(--muted);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.final-input:hover {
  border-color: var(--muted);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--border) 20%, transparent);
}
.fi-mark {
  color: var(--surface);
}
.fi-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}
.fi-kbd {
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--surface);
}
.caret {
  display: inline-block;
  width: 2px;
  height: 0.85em;
  background: var(--surface);
  margin-left: 3px;
  vertical-align: -0.06em;
  animation: blink 1.1s steps(1) infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}

/* ============ FOOTER ============ */
.ft {
  border-top: 1px solid var(--border);
}
.ft-copy {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.ft-link {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  transition: color 0.2s;
}
.ft-link:hover {
  color: var(--surface);
}

/* ============ ANIMATIONS ============ */
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

/* ============ RESPONSIVE ============ */
@media (max-width: 1024px) {
  .ai-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .feat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .hero-grid {
    grid-template-columns: 1fr;
    gap: 40px;
  }
  .hero-right {
    order: -1;
  }
  .window-body {
    grid-template-columns: 150px minmax(0, 1fr);
  }
  .window-sidebar.right {
    display: none;
  }
}
@media (max-width: 640px) {
  .ai-grid {
    grid-template-columns: 1fr;
  }
  .feat-grid {
    grid-template-columns: 1fr;
  }
  .sec-head.split {
    grid-template-columns: 1fr;
    align-items: start;
  }
  .hero-btns {
    flex-direction: column;
  }
  .window-body {
    min-height: 360px;
    grid-template-columns: 1fr;
  }
  .window-sidebar.left {
    display: none;
  }
  .window-canvas {
    min-height: 360px;
  }
  .artboard {
    top: 48px;
    left: 38px;
    right: 18px;
    bottom: 18px;
    padding: 20px;
  }
  .artboard-nav {
    grid-template-columns: 1fr auto auto;
    gap: 10px;
  }
  .artboard-nav span:nth-child(3),
  .artboard-nav span:nth-child(4) {
    display: none;
  }
  .artboard-kicker {
    margin-top: 48px;
  }
  .step-row {
    grid-template-columns: 40px 1fr auto;
  }
  .final-card {
    padding: 40px 24px;
  }
  .ft {
    flex-direction: column;
    gap: 16px;
    text-align: center;
  }
}
</style>
