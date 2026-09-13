<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { authReady, currentUser, isAuthenticated, loginWithZenuxs } from '@/app/auth/zenuxs'

const router = useRouter()
const mobileMenuOpen = ref(false)
const theme = ref<'dark' | 'light'>('dark')
const pageRoot = ref<HTMLElement | null>(null)
const signingIn = ref(false)

let revealObserver: IntersectionObserver | undefined

onMounted(() => {
  const saved = window.localStorage.getItem('zenuxs-theme')
  theme.value = saved === 'light' ? 'light' : 'dark'
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
  window.localStorage.setItem('zenuxs-theme', next)
}

async function handleGetStarted() {
  if (signingIn.value) return

  // Already authenticated — go straight to editor
  if (isAuthenticated.value) {
    router.push('/editor')
    return
  }

  // Not authenticated — trigger OAuth flow
  signingIn.value = true
  try {
    const result = await loginWithZenuxs('ui')
    if (result) {
      // Auth succeeded — navigate to editor
      router.push('/editor')
    } else {
      // Auth failed or was cancelled — stay on landing page
      signingIn.value = false
    }
  } catch {
    signingIn.value = false
  }
}

async function handleContinue() {
  if (signingIn.value) return
  // Already authenticated — go straight to editor
  router.push('/editor')
}

function handleExplore() {
  router.push('/editor')
}

const aiFeatures = [
  { icon: 'icon-lucide-wand-2', title: 'Generate', description: 'Turn a rough idea into an editable interface.' },
  { icon: 'icon-lucide-sparkles', title: 'Improve', description: 'Select anything and ask AI to refine it.' },
  { icon: 'icon-lucide-layout-grid', title: 'Components', description: 'Build reusable patterns and design systems.' },
  { icon: 'icon-lucide-code-2', title: 'Code', description: 'Move from visual design to implementation.' }
]

const featureGroups = [
  { icon: 'icon-lucide-pen-tool', title: 'Visual editor', description: 'Shapes, vectors, text, images and precision tools.' },
  { icon: 'icon-lucide-layers-3', title: 'Pages & layers', description: 'Keep complex projects structured and easy to navigate.' },
  { icon: 'icon-lucide-component', title: 'Components', description: 'Create reusable building blocks without leaving the canvas.' },
  { icon: 'icon-lucide-palette', title: 'Design systems', description: 'Shared tokens, styles and variables across your work.' },
  { icon: 'icon-lucide-smartphone', title: 'Responsive', description: 'Compose layouts for every viewport and breakpoint.' },
  { icon: 'icon-lucide-code-2', title: 'Code export', description: 'Take designs into JSX, Tailwind or HTML/CSS.' }
]

const steps = [
  { number: '01', title: 'Describe', copy: 'Start with the product idea, screen or interaction you have in mind.' },
  { number: '02', title: 'Shape', copy: 'Edit the generated result directly on the canvas with full control.' },
  { number: '03', title: 'Ship', copy: 'Polish the design and move it into production-ready code.' }
]

const marqueeWords = ['Generate', 'Improve', 'Components', 'Tokens & styles', 'Responsive', 'Code export']
</script>

<template>
  <div
    ref="pageRoot"
    class="zenuxs-page h-full overflow-y-auto bg-canvas text-surface"
    :data-theme="theme"
  >
    <!-- ============ HEADER ============ -->
    <header class="zx-header">
      <div class="mx-auto flex h-14 max-w-7xl items-center gap-6 px-5 sm:px-7">
        <button class="flex shrink-0 items-center gap-2.5" aria-label="ZenuxsDesign home" @click="router.push('/')">
          <span class="brand-mark brk">Z</span>
          <span class="wordmark">Zenuxs<span class="wordmark-dim">Design</span></span>
          <span class="beta-chip mono">Beta</span>
        </button>

        <nav class="hidden flex-1 items-center justify-center gap-7 md:flex" aria-label="Primary">
          <a href="#ai" class="nav-link mono">AI</a>
          <a href="#features" class="nav-link mono">Features</a>
          <a href="#workflow" class="nav-link mono">Workflow</a>
        </nav>

        <div class="ml-auto flex items-center gap-1.5">
          <button
            class="theme-toggle"
            :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
            @click="setTheme(theme === 'dark' ? 'light' : 'dark')"
          >
            <icon-lucide-sun v-if="theme === 'dark'" class="size-3.5" />
            <icon-lucide-moon v-else class="size-3.5" />
          </button>

          <!-- Loading state while auth initializes -->
          <template v-if="!authReady">
            <div class="h-8 w-20 animate-pulse rounded-lg bg-[var(--color-panel-secondary)]" />
          </template>

          <!-- Authenticated: show Continue as [name] -->
          <template v-else-if="isAuthenticated && currentUser">
            <button class="signin-link mono hidden sm:inline-flex" @click="handleContinue">
              Continue as {{ currentUser.name?.split(' ')[0] || currentUser.email?.split('@')[0] || 'User' }}
            </button>
            <button class="zx-cta" :disabled="signingIn" @click="handleContinue">
              <template v-if="signingIn">Signing in…</template>
              <template v-else>
                Continue
                <icon-lucide-arrow-up-right class="size-3.5" />
              </template>
            </button>
          </template>

          <!-- Not authenticated: show Sign in + Start designing -->
          <template v-else>
            <button class="signin-link mono hidden sm:inline-flex" @click="handleGetStarted">Sign in</button>
            <button class="zx-cta" :disabled="signingIn" @click="handleGetStarted">
              <template v-if="signingIn">Signing in…</template>
              <template v-else>
                Start designing
                <icon-lucide-arrow-up-right class="size-3.5" />
              </template>
            </button>
          </template>

          <button class="theme-toggle md:hidden" aria-label="Toggle navigation" @click="mobileMenuOpen = !mobileMenuOpen">
            <icon-lucide-x v-if="mobileMenuOpen" class="size-4" />
            <icon-lucide-menu v-else class="size-4" />
          </button>
        </div>
      </div>

      <div v-if="mobileMenuOpen" class="zx-mobile-panel md:hidden">
        <nav class="mx-auto flex max-w-7xl flex-col gap-1">
          <a href="#ai" class="mobile-link mono" @click="mobileMenuOpen = false">AI</a>
          <a href="#features" class="mobile-link mono" @click="mobileMenuOpen = false">Features</a>
          <a href="#workflow" class="mobile-link mono" @click="mobileMenuOpen = false">Workflow</a>
          <button class="mobile-link mono text-left" @click="mobileMenuOpen = false; isAuthenticated ? handleContinue() : handleGetStarted()">
            {{ isAuthenticated ? 'Continue to editor' : 'Sign in / start designing' }}
          </button>
        </nav>
      </div>
    </header>

    <main>
      <!-- ============ HERO ============ -->
      <section class="hero-shell">
        <div class="hero-dots" aria-hidden="true" />
        <div class="zx-orb zx-orb-a" aria-hidden="true" />
        <div class="zx-orb zx-orb-b" aria-hidden="true" />
        <span class="hero-plus mono" style="top: 18%; left: 4%" aria-hidden="true">+</span>
        <span class="hero-plus mono" style="top: 46%; right: 6%" aria-hidden="true">+</span>
        <span class="hero-plus mono" style="bottom: 12%; left: 12%" aria-hidden="true">+</span>

        <div class="mx-auto max-w-7xl px-5 py-20 sm:px-7 sm:py-24 lg:py-28">
          <div class="max-w-4xl" data-reveal>
            <div class="eyebrow mono">
              <span class="eyebrow-sq" />
              AI-native visual design
            </div>

            <h1 class="hero-title">
              Make the interface.
              <span class="hero-accent">Not the busywork.<i class="zx-caret hero-caret" aria-hidden="true" /></span>
            </h1>

            <p class="hero-sub">
              ZenuxsDesign gives you a fast visual workspace, an AI design layer and the control to turn ideas into production-ready experiences.
            </p>

            <div class="mt-9 flex flex-col gap-3 sm:flex-row">
              <button class="zx-btn" :disabled="signingIn" @click="isAuthenticated ? handleContinue() : handleGetStarted()">
                <template v-if="signingIn">Signing in…</template>
                <template v-else-if="isAuthenticated">
                  Continue to editor
                  <icon-lucide-arrow-right class="size-4" />
                </template>
                <template v-else>
                  Start designing
                  <icon-lucide-arrow-right class="size-4" />
                </template>
              </button>
              <button class="zx-btn-ghost" @click="handleExplore">
                Open editor
                <icon-lucide-command class="size-4" />
              </button>
            </div>

            <div class="trust-row mono">
              <span class="trust-item"><span class="trust-sep">+</span> No setup tour</span>
              <span class="trust-item"><span class="trust-sep">+</span> Editable from the first result</span>
              <span class="trust-item"><span class="trust-sep">+</span> Built for real projects</span>
            </div>
          </div>

          <!-- ============ EDITOR WINDOW ============ -->
          <div class="mt-16 lg:mt-20 window-wrap" data-reveal style="--rd: .12s">
            <div class="product-window">
              <div class="window-topbar">
                <div class="flex items-center gap-1.5">
                  <span class="window-dot" /><span class="window-dot" /><span class="window-dot" />
                </div>
                <div class="window-title mono"><span class="brand-mark brand-mark-sm">Z</span>ZenuxsDesign</div>
                <span class="window-kbd mono">⌘ K</span>
              </div>

              <div class="window-body">
                <aside class="window-sidebar left">
                  <div class="w-label mono">Layers</div>
                  <div class="w-line strong" />
                  <div class="tree-row active"><span class="tree-sq accent" />Website</div>
                  <div class="tree-row indent"><span class="tree-sq" />Header</div>
                  <div class="tree-row indent"><span class="tree-sq accent" />Hero</div>
                  <div class="tree-row indent-2"><span class="tree-sq" />CTA</div>
                  <div class="tree-row indent-2"><span class="tree-sq" />Stats</div>
                  <div class="tree-row"><span class="tree-sq" />Footer</div>
                  <div class="w-zoom mono">
                    <span>−</span><span>100%</span><span>+</span>
                  </div>
                </aside>

                <div class="window-canvas">
                  <div class="ruler-top mono"><span>0</span><span>240</span><span>480</span><span>720</span><span>960</span></div>
                  <div class="ruler-left mono"><span>0</span><span>120</span><span>240</span><span>360</span></div>
                  <div class="artboard">
                    <div class="ab-nav">
                      <span class="ab-logo">zenuxs</span>
                      <span class="ab-hide">Work</span><span class="ab-hide">Studio</span><span>About</span>
                      <span class="ab-cta">Start a project</span>
                    </div>
                    <div class="ab-kicker mono">A new way to build on the web</div>
                    <div class="ab-heading">Design systems<br /><span>without the drag.</span></div>
                    <div class="ab-copy">From the first frame to production, everything lives in one visual workspace.</div>
                    <div class="ab-actions">
                      <span class="ab-selwrap">
                        <span class="ab-primary">Explore</span>
                        <span class="ab-sel" aria-hidden="true"><b /><b /><b /><b /><i class="ab-seltag mono">128 × 34</i></span>
                      </span>
                      <span class="ab-link">Read the story ↗</span>
                    </div>
                    <div class="ab-stats mono"><span>01 — Visual</span><span>02 — AI</span><span>03 — Code</span></div>
                  </div>
                </div>

                <aside class="window-sidebar right">
                  <div class="w-tabs mono"><span>Design</span><span>Code</span><span class="ai-on">AI<i /></span></div>
                  <div class="w-label mono">AI design</div>
                  <div class="ai-note">Describe a change. Keep the result editable.</div>
                  <div class="ai-prompt">
                    <span class="ai-prompt-text mono">Make this hero more editorial.</span><i class="zx-caret" aria-hidden="true" />
                  </div>
                  <div class="ai-chips mono"><span>Improve</span><span>Responsive</span><span>Code</span></div>
                  <div class="ai-result">
                    <div class="rs-line long" />
                    <div class="rs-line" />
                    <div class="rs-box">
                      <span class="rs-box-brackets" aria-hidden="true" />
                      <span class="rs-apply mono">Apply ⏎</span>
                    </div>
                  </div>
                </aside>
              </div>

              <div class="cmdbar mono" aria-hidden="true">
                <span class="cmdbar-key">⌘K</span>
                <span class="cmdbar-text">Ask AI · jump to layer · run action</span>
                <icon-lucide-sparkles class="size-3 cmdbar-spark" />
              </div>
            </div>

            <div class="preview-caption mono">
              <span>THE EDITOR</span>
              <span>Visual canvas / Layers / AI / Code</span>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ MARQUEE ============ -->
      <div class="marquee" aria-hidden="true">
        <div class="marquee-track">
          <ul class="mono">
            <li v-for="word in marqueeWords" :key="word">
              <span>{{ word }}</span><span class="mq-sep">+</span>
            </li>
          </ul>
          <ul class="mono" aria-hidden="true">
            <li v-for="word in marqueeWords" :key="`dup-${word}`">
              <span>{{ word }}</span><span class="mq-sep">+</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- ============ 01 / AI ============ -->
      <section id="ai" class="zx-section">
        <div class="mx-auto max-w-7xl px-5 sm:px-7">
          <div class="section-head grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end" data-reveal>
            <div>
              <div class="section-label mono"><span class="label-sq" />01 / AI layer</div>
              <h2 class="section-title">AI that lives <em class="zx-serif">inside the canvas.</em></h2>
            </div>
            <p class="section-copy">Generate, improve and translate ideas without handing control of the design over to a black box.</p>
          </div>

          <div class="ai-grid mt-12" data-reveal style="--rd: .1s">
            <article
              v-for="(feature, index) in aiFeatures"
              :key="feature.title"
              class="ai-card"
              :class="{ featured: index === 0 }"
            >
              <div class="ai-card-top">
                <span class="ai-index mono">0{{ index + 1 }}</span>
                <span class="icoframe brk"><component :is="feature.icon" /></span>
              </div>

              <div v-if="index === 0" class="gen-visual mono" aria-hidden="true">
                <span class="gen-prompt">“a pricing page…”</span>
                <span class="gen-arrow">↓</span>
                <span class="gen-board"><b /><b /><b /><b /></span>
              </div>

              <div class="ai-card-copy">
                <h3>{{ feature.title }}</h3>
                <p>{{ feature.description }}</p>
              </div>
              <span class="ai-card-line" aria-hidden="true" />
            </article>
          </div>
        </div>
      </section>

      <!-- ============ 02 / WORKSPACE ============ -->
      <section id="features" class="zx-section pt-0">
        <div class="mx-auto max-w-7xl px-5 sm:px-7">
          <div class="section-head grid gap-6 lg:grid-cols-[1fr_0.8fr] lg:items-end" data-reveal>
            <div>
              <div class="section-label mono"><span class="label-sq" />02 / Workspace</div>
              <h2 class="section-title">A serious editor with <em class="zx-serif">less chrome.</em></h2>
            </div>
            <p class="section-copy">The product stays quiet so the work can stay loud: clear hierarchy, compact controls and surfaces that earn their space.</p>
          </div>

          <div class="feature-grid mt-12" data-reveal style="--rd: .1s">
            <article v-for="feature in featureGroups" :key="feature.title" class="feature-card">
              <div class="feature-top">
                <span class="icoframe brk"><component :is="feature.icon" /></span>
                <icon-lucide-arrow-up-right class="feature-arrow size-4" />
              </div>
              <h3>{{ feature.title }}</h3>
              <p>{{ feature.description }}</p>
            </article>
          </div>
        </div>
      </section>

      <!-- ============ 03 / WORKFLOW ============ -->
      <section id="workflow" class="zx-section workflow-shell">
        <div class="mx-auto max-w-7xl px-5 sm:px-7">
          <div class="workflow-frame" data-reveal>
            <div class="section-label mono"><span class="label-sq" />03 / Workflow</div>
            <div class="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start mt-8">
              <div>
                <h2 class="section-title">One place from blank page to <em class="zx-serif">shipped interface.</em></h2>
                <p class="section-copy mt-6 max-w-md">A deliberately short path. Start visually, use AI where it helps, and keep every decision editable.</p>
              </div>

              <div class="steps-list">
                <div v-for="step in steps" :key="step.number" class="step-row">
                  <span class="step-number mono">{{ step.number }}</span>
                  <div><h3>{{ step.title }}</h3><p>{{ step.copy }}</p></div>
                  <icon-lucide-arrow-up-right class="size-4 step-arrow" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ FINAL CTA ============ -->
      <section class="zx-section final-shell">
        <div class="mx-auto max-w-7xl px-5 sm:px-7">
          <div class="final-card" data-reveal>
            <div class="final-dots" aria-hidden="true" />
            <div class="zx-orb zx-orb-c" aria-hidden="true" />
            <div class="relative z-10 max-w-3xl">
              <div class="section-label mono"><span class="label-sq" />ZenuxsDesign / Beta</div>
              <h2 class="final-title">Build what you can <em class="zx-serif">already see</em> in your head.</h2>
              <p class="section-copy mt-6 max-w-xl">Open the editor and start with a frame, a sentence or a half-formed idea.</p>

              <button class="final-input mono" @click="isAuthenticated ? handleContinue() : handleGetStarted()">
                <span class="fi-mark">▸</span>
                <span class="fi-text">describe your interface…<i class="zx-caret" aria-hidden="true" /></span>
                <span class="fi-kbd mono">Enter</span>
              </button>

              <div class="mt-6">
                <button class="zx-btn" :disabled="signingIn" @click="isAuthenticated ? handleContinue() : handleGetStarted()">
                  <template v-if="signingIn">Signing in…</template>
                  <template v-else-if="isAuthenticated">
                    Continue to editor
                    <icon-lucide-arrow-right class="size-4" />
                  </template>
                  <template v-else>
                    Enter ZenuxsDesign
                    <icon-lucide-arrow-right class="size-4" />
                  </template>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- ============ FOOTER ============ -->
    <footer class="zx-footer">
      <div class="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div class="flex items-center gap-2.5">
          <span class="brand-mark brand-mark-xs brk">Z</span>
          <span class="mono footer-note">© 2026 ZenuxsDesign</span>
        </div>
        <div class="flex gap-5">
          <a href="#ai" class="footer-link mono">AI</a>
          <a href="#features" class="footer-link mono">Features</a>
          <a href="#workflow" class="footer-link mono">Workflow</a>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400..700;1,400..700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600&display=swap');

/* ============ TOKENS ============ */
.zenuxs-page {
  --zx: #c9f14f;
  --zx-ink: #131705;
  --zx-text: #c9f14f;
  --zx-dim: color-mix(in srgb, #c9f14f 34%, transparent);
  --zx-glow: color-mix(in srgb, #c9f14f 18%, transparent);
  --zx-tint: color-mix(in srgb, #c9f14f 7%, transparent);
  --font-sans: 'Instrument Sans', ui-sans-serif, system-ui, sans-serif;
  --font-serif: 'Instrument Serif', Georgia, serif;
  --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  font-family: var(--font-sans);
}

.zenuxs-page[data-theme='light'] {
  --zx-text: #5a7508;
  --zx-dim: color-mix(in srgb, #7a9a10 38%, transparent);
  --zx-glow: color-mix(in srgb, #9dc41e 22%, transparent);
  --zx-tint: color-mix(in srgb, #9dc41e 8%, transparent);
}

.zenuxs-page ::selection { background: var(--zx); color: var(--zx-ink); }

.mono { font-family: var(--font-mono); }
.zx-serif {
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 400;
  letter-spacing: -0.01em;
}

.zx-caret {
  display: inline-block;
  width: 5px;
  height: 0.78em;
  background: var(--zx-text);
  margin-left: 4px;
  vertical-align: -0.06em;
  animation: zx-blink 1.1s steps(1) infinite;
}
@keyframes zx-blink { 50% { opacity: 0; } }

/* corner-bracket motif (selection handles) */
.brk { position: relative; }
.brk::before, .brk::after {
  content: '';
  position: absolute;
  width: 7px;
  height: 7px;
  border: 0 solid var(--zx-text);
  transition: all 0.28s cubic-bezier(0.2, 0.7, 0.2, 1);
  pointer-events: none;
}
.brk::before { top: -1px; left: -1px; border-top-width: 1.5px; border-left-width: 1.5px; }
.brk::after { bottom: -1px; right: -1px; border-bottom-width: 1.5px; border-right-width: 1.5px; }
.brk:hover::before { top: -4px; left: -4px; }
.brk:hover::after { bottom: -4px; right: -4px; }

/* reveal on scroll */
[data-reveal] { opacity: 0; transform: translateY(22px); transition: opacity 0.7s cubic-bezier(0.2, 0.7, 0.2, 1), transform 0.7s cubic-bezier(0.2, 0.7, 0.2, 1); transition-delay: var(--rd, 0s); }
[data-reveal].is-in { opacity: 1; transform: none; }

#ai, #features, #workflow { scroll-margin-top: 84px; }

/* ============ HEADER ============ */
.zx-header {
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border, #2a2a2a) 70%, transparent);
  background: color-mix(in srgb, var(--color-canvas, #0f0f0f) 86%, transparent);
  backdrop-filter: blur(14px);
}

.brand-mark {
  display: inline-flex;
  width: 29px;
  height: 29px;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--color-surface, #f5f5f5) 22%, transparent);
  border-radius: 8px;
  color: var(--color-surface, #f5f5f5);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.06em;
  background: color-mix(in srgb, var(--color-panel-secondary, #171717) 80%, transparent);
}
.brand-mark-sm { width: 18px; height: 18px; border-radius: 5px; font-size: 8px; }
.brand-mark-xs { width: 22px; height: 22px; border-radius: 6px; font-size: 9px; }

.wordmark { font-size: 14px; font-weight: 650; letter-spacing: -0.02em; }
.wordmark-dim { color: var(--color-muted, #888); font-weight: 450; }
.beta-chip {
  border: 1px solid var(--zx-dim);
  color: var(--zx-text);
  border-radius: 999px;
  padding: 2px 7px;
  font-size: 8.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.nav-link {
  position: relative;
  font-size: 10px;
  font-weight: 550;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-muted, #888);
  transition: color 160ms ease;
}
.nav-link::after {
  content: '';
  position: absolute;
  left: 0; right: 100%; bottom: -6px;
  height: 2px;
  background: var(--zx-text);
  transition: right 0.25s cubic-bezier(0.2, 0.7, 0.2, 1);
}
.nav-link:hover { color: var(--color-surface, #f5f5f5); }
.nav-link:hover::after { right: 0; }

.theme-toggle {
  display: inline-flex;
  width: 31px; height: 31px;
  align-items: center; justify-content: center;
  border-radius: 9px;
  border: 1px solid var(--color-border, #2a2a2a);
  background: color-mix(in srgb, var(--color-panel-secondary, #171717) 88%, transparent);
  color: var(--color-muted, #888);
  transition: color 160ms ease, border-color 160ms ease;
}
.theme-toggle:hover { color: var(--color-surface, #f5f5f5); border-color: var(--zx-dim); }

.signin-link {
  font-size: 10px;
  font-weight: 550;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 8px 9px;
  color: var(--color-muted, #888);
  transition: color 160ms ease;
}
.signin-link:hover { color: var(--color-surface, #f5f5f5); }

.zx-cta {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border-radius: 10px;
  background: var(--zx);
  color: var(--zx-ink);
  font-size: 12px;
  font-weight: 650;
  padding: 8px 13px;
  transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
}
.zx-cta:hover { transform: translateY(-1px); filter: saturate(1.1); box-shadow: 0 8px 26px var(--zx-glow); }

.zx-mobile-panel { border-top: 1px solid var(--color-border, #2a2a2a); padding: 12px 20px 16px; }
.mobile-link {
  display: block;
  padding: 11px 8px;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-muted, #888);
  border-radius: 8px;
  transition: color 140ms ease, background 140ms ease;
}
.mobile-link:hover { color: var(--color-surface, #f5f5f5); background: color-mix(in srgb, var(--color-panel-secondary, #171717) 70%, transparent); }

/* ============ BUTTONS ============ */
.zx-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 12px;
  background: var(--zx);
  color: var(--zx-ink);
  font-size: 13px;
  font-weight: 650;
  min-height: 46px;
  padding: 12px 18px;
  transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
}
.zx-btn:hover { transform: translateY(-1px); filter: saturate(1.1); box-shadow: 0 14px 36px var(--zx-glow); }

.zx-btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 12px;
  border: 1px solid var(--color-border-strong, #454545);
  color: var(--color-surface, #f5f5f5);
  background: color-mix(in srgb, var(--color-panel-secondary, #171717) 55%, transparent);
  font-size: 13px;
  font-weight: 550;
  min-height: 46px;
  padding: 12px 18px;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}
.zx-btn-ghost:hover { border-color: var(--zx-dim); background: color-mix(in srgb, var(--color-panel-secondary, #171717) 90%, transparent); transform: translateY(-1px); }

/* ============ HERO ============ */
.hero-shell { position: relative; overflow: hidden; border-bottom: 1px solid var(--color-border, #2a2a2a); }

.hero-dots {
  position: absolute; inset: 0;
  background-image: radial-gradient(color-mix(in srgb, var(--color-surface, #f5f5f5) 15%, transparent) 1px, transparent 1.3px);
  background-size: 26px 26px;
  opacity: 0.55;
  mask-image: radial-gradient(ellipse 95% 75% at 50% 0%, black 30%, transparent 78%);
  pointer-events: none;
}
.zx-orb { position: absolute; border-radius: 999px; filter: blur(90px); pointer-events: none; }
.zx-orb-a { width: 380px; height: 380px; top: 60px; right: 6%; background: #c9f14f; opacity: 0.1; }
.zx-orb-b { width: 280px; height: 280px; top: 220px; left: -90px; background: #8b5cf6; opacity: 0.06; }
.zx-orb-c { width: 340px; height: 340px; right: -8%; bottom: -55%; background: #c9f14f; opacity: 0.09; }
.zenuxs-page[data-theme='light'] .zx-orb-b { opacity: 0.05; }

.hero-plus { position: absolute; color: var(--zx-dim); font-size: 13px; pointer-events: none; }

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-muted, #888);
}
.eyebrow-sq {
  width: 7px; height: 7px;
  background: var(--zx-text);
  box-shadow: 0 0 0 4px var(--zx-tint);
}

.hero-title {
  margin-top: 26px;
  font-size: clamp(3rem, 6.6vw, 6.3rem);
  font-weight: 640;
  line-height: 0.95;
  letter-spacing: -0.048em;
}
.hero-accent {
  display: block;
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 400;
  font-size: 1.03em;
  letter-spacing: -0.01em;
  color: var(--zx-text);
}
.hero-caret { height: 0.62em; width: 4px; }

.hero-sub { margin-top: 26px; max-width: 34rem; font-size: 16px; line-height: 1.7; color: var(--color-muted, #888); }
@media (min-width: 640px) { .hero-sub { font-size: 17px; } }

.trust-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 22px; margin-top: 26px; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-muted, #888); }
.trust-item { display: inline-flex; align-items: center; gap: 8px; }
.trust-sep { color: var(--zx-text); font-weight: 600; }

/* ============ EDITOR WINDOW ============ */
.window-wrap { position: relative; padding-bottom: 24px; }

.product-window {
  position: relative;
  overflow: visible;
  border: 1px solid color-mix(in srgb, var(--color-border, #2a2a2a) 90%, transparent);
  border-radius: 17px;
  background: var(--color-panel-secondary, #171717);
  box-shadow: 0 34px 80px rgb(0 0 0 / 22%);
}
.zenuxs-page[data-theme='light'] .product-window { box-shadow: 0 30px 70px rgb(20 24 12 / 14%); }

.window-topbar {
  display: flex;
  height: 42px;
  align-items: center;
  border-bottom: 1px solid var(--color-border, #2a2a2a);
  padding: 0 13px;
}
.window-dot { display: block; width: 6px; height: 6px; border-radius: 999px; background: var(--color-border-strong, #454545); }
.window-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 9.5px;
  color: var(--color-muted, #888);
}
.window-kbd {
  margin-left: auto;
  font-size: 8.5px;
  color: var(--color-muted, #888);
  border: 1px solid var(--color-border, #2a2a2a);
  border-radius: 5px;
  padding: 2px 6px;
}

.window-body { display: grid; min-height: 470px; grid-template-columns: 182px minmax(0, 1fr) 212px; }

.window-sidebar { position: relative; background: var(--color-canvas, #0f0f0f); padding: 13px; display: flex; flex-direction: column; }
.window-sidebar.left { border-right: 1px solid var(--color-border, #2a2a2a); }
.window-sidebar.right { border-left: 1px solid var(--color-border, #2a2a2a); }

.w-label { margin-bottom: 11px; font-size: 9px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-surface, #f5f5f5); }
.w-line { height: 7px; border-radius: 999px; background: var(--color-border, #2a2a2a); margin-bottom: 13px; }
.w-line.strong { background: color-mix(in srgb, var(--color-surface, #f5f5f5) 15%, transparent); }

.tree-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 25px;
  border-radius: 6px;
  padding: 0 6px;
  color: var(--color-muted, #888);
  font-size: 9px;
  transition: background 140ms ease, color 140ms ease;
}
.tree-row.active {
  color: var(--color-surface, #f5f5f5);
  background: var(--zx-tint);
  box-shadow: inset 2px 0 0 var(--zx-text);
}
.tree-row.indent { padding-left: 17px; }
.tree-row.indent-2 { padding-left: 29px; }
.tree-sq { width: 6px; height: 6px; border: 1px solid var(--color-border-strong, #454545); border-radius: 2px; }
.tree-sq.accent { border-color: var(--zx-text); background: var(--zx-dim); }

.w-zoom {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--color-border, #2a2a2a);
  padding-top: 9px;
  font-size: 8px;
  color: var(--color-muted, #888);
}

/* canvas + rulers */
.window-canvas {
  position: relative;
  overflow: hidden;
  background: color-mix(in srgb, var(--color-canvas, #0f0f0f) 88%, var(--color-surface, #f5f5f5) 12%);
}
.ruler-top, .ruler-left {
  position: absolute;
  background:
    color-mix(in srgb, var(--color-canvas, #0f0f0f) 78%, black 22%);
  color: color-mix(in srgb, var(--color-muted, #888) 75%, transparent);
  font-size: 7px;
}
.ruler-top {
  inset: 0 0 auto 0;
  z-index: 2;
  display: flex;
  justify-content: space-around;
  align-items: center;
  height: 24px;
  border-bottom: 1px solid var(--color-border, #2a2a2a);
}
.ruler-top::after {
  content: '';
  position: absolute;
  left: 24px; right: 0; bottom: 0;
  height: 5px;
  background: repeating-linear-gradient(90deg, var(--color-border-strong, #454545) 0 1px, transparent 1px 26px);
  opacity: 0.6;
}
.ruler-left {
  top: 24px; bottom: 0; left: 0;
  z-index: 2;
  display: flex;
  width: 24px;
  flex-direction: column;
  align-items: center;
  justify-content: space-around;
  border-right: 1px solid var(--color-border, #2a2a2a);
}

/* the artboard (a light "document" in both themes) */
.artboard {
  position: absolute;
  top: 58px; left: 62px; right: 38px; bottom: 28px;
  overflow: hidden;
  border: 1px solid #d9dcd2;
  border-radius: 6px;
  background: #f8f8f3;
  color: #191c14;
  padding: 26px 34px;
  box-shadow: 0 18px 40px rgb(0 0 0 / 24%);
}
.ab-nav { display: grid; grid-template-columns: 1fr auto auto auto auto; align-items: center; gap: 18px; font-size: 7px; color: #5e6357; }
.ab-logo { color: #191c14; font-size: 9px; font-weight: 750; letter-spacing: -0.02em; }
.ab-cta { padding: 5px 8px; border: 1px solid #c9cdc0; border-radius: 5px; color: #23261d; }
.ab-kicker { margin-top: 66px; color: #6d7a2e; font-size: 7px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; }
.ab-heading { margin-top: 13px; font-size: clamp(24px, 4vw, 42px); font-weight: 620; letter-spacing: -0.05em; line-height: 0.95; }
.ab-heading span { font-family: var(--font-serif); font-style: italic; font-weight: 400; color: #728c2e; }
.ab-copy { margin-top: 14px; max-width: 300px; color: #656a5c; font-size: 9px; line-height: 1.6; }
.ab-actions { display: flex; align-items: center; gap: 16px; margin-top: 20px; color: #555a4e; font-size: 8px; }
.ab-selwrap { position: relative; display: inline-flex; }
.ab-primary { display: inline-flex; padding: 7px 11px; border-radius: 6px; background: #c9f14f; color: #131705; font-weight: 650; }
.ab-link { margin-left: 2px; }
.ab-sel {
  position: absolute;
  inset: -7px -9px;
  border: 1px solid #728c2e;
  box-shadow: 0 0 0 9999px rgb(114 140 46 / 0.045);
  animation: sel-pulse 3s ease-in-out infinite;
}
.ab-sel b { position: absolute; width: 7px; height: 7px; background: #728c2e; }
.ab-sel b:nth-child(1) { top: -4px; left: -4px; }
.ab-sel b:nth-child(2) { top: -4px; right: -4px; }
.ab-sel b:nth-child(3) { bottom: -4px; left: -4px; }
.ab-sel b:nth-child(4) { bottom: -4px; right: -4px; }
.ab-seltag {
  position: absolute;
  top: -19px; left: -1px;
  font-style: normal;
  font-size: 6.5px;
  font-weight: 600;
  background: #728c2e;
  color: #f8f8f3;
  padding: 1.5px 5px;
  border-radius: 3px;
}
@keyframes sel-pulse { 50% { box-shadow: 0 0 0 9999px rgb(114 140 46 / 0.02); } }
.ab-stats { position: absolute; right: 34px; bottom: 26px; display: flex; gap: 12px; color: #7b8073; font-size: 7px; }

/* right sidebar — AI panel */
.w-tabs {
  display: flex;
  gap: 12px;
  margin-bottom: 17px;
  border-bottom: 1px solid var(--color-border, #2a2a2a);
  padding-bottom: 9px;
  font-size: 9px;
  color: var(--color-muted, #888);
}
.w-tabs .ai-on { display: inline-flex; align-items: center; gap: 5px; color: var(--zx-text); font-weight: 600; }
.w-tabs .ai-on i { width: 5px; height: 5px; border-radius: 99px; background: var(--zx-text); animation: zx-blink 1.6s steps(1) infinite; }

.ai-note { color: var(--color-muted, #888); font-size: 8px; line-height: 1.55; }
.ai-prompt {
  margin-top: 12px;
  border: 1px solid var(--zx-dim);
  border-radius: 7px;
  padding: 9px 10px;
  background: color-mix(in srgb, var(--color-panel-secondary, #171717) 70%, transparent);
  color: var(--color-surface, #f5f5f5);
  font-size: 8px;
  line-height: 1.4;
}
.ai-prompt-text {
  display: inline-block;
  overflow: hidden;
  white-space: nowrap;
  vertical-align: bottom;
  width: 0;
  animation: zx-typing 2.6s steps(30) 0.9s forwards;
}
@keyframes zx-typing { to { width: 30ch; } }
.ai-chips { display: flex; gap: 5px; margin-top: 9px; }
.ai-chips span {
  border: 1px solid var(--color-border, #2a2a2a);
  border-radius: 999px;
  padding: 3px 6px;
  color: var(--color-muted, #888);
  font-size: 7px;
  transition: border-color 140ms ease, color 140ms ease;
}
.ai-chips span:hover { border-color: var(--zx-dim); color: var(--zx-text); }

.ai-result { margin-top: 14px; border: 1px solid var(--color-border, #2a2a2a); border-radius: 7px; padding: 10px; }
.rs-line {
  height: 5px;
  border-radius: 99px;
  background: linear-gradient(90deg,
    var(--color-border, #2a2a2a) 0%,
    color-mix(in srgb, var(--color-surface, #f5f5f5) 22%, var(--color-border, #2a2a2a)) 50%,
    var(--color-border, #2a2a2a) 100%);
  background-size: 200% 100%;
  animation: zx-shimmer 1.7s linear infinite;
  width: 72%;
}
.rs-line.long { width: 92%; margin-bottom: 7px; }
@keyframes zx-shimmer { to { background-position: -200% 0; } }
.rs-box {
  position: relative;
  margin-top: 11px;
  height: 58px;
  border-radius: 5px;
  background: var(--zx-tint);
  border: 1px dashed var(--zx-dim);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 8px;
}
.rs-box-brackets::before, .rs-box-brackets::after {
  content: '';
  position: absolute;
  width: 8px; height: 8px;
  border: 0 solid var(--zx-text);
}
.rs-box-brackets::before { top: 4px; left: 4px; border-top-width: 1.5px; border-left-width: 1.5px; }
.rs-box-brackets::after { bottom: 4px; right: 4px; border-bottom-width: 1.5px; border-right-width: 1.5px; }
.rs-apply {
  font-size: 7px;
  font-weight: 600;
  background: var(--zx);
  color: var(--zx-ink);
  border-radius: 4px;
  padding: 3px 7px;
}

/* floating command bar */
.cmdbar {
  position: absolute;
  bottom: -15px;
  left: 50%;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid color-mix(in srgb, var(--color-border, #2a2a2a) 90%, transparent);
  border-radius: 10px;
  background: var(--color-panel-secondary, #171717);
  box-shadow: 0 14px 34px rgb(0 0 0 / 25%);
  padding: 7px 12px;
  font-size: 9px;
  color: var(--color-muted, #888);
  white-space: nowrap;
  animation: cmdbar-in 0.7s cubic-bezier(0.2, 0.9, 0.3, 1.15) 1.5s both;
}
@keyframes cmdbar-in { from { transform: translate(-50%, 10px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
.cmdbar { transform: translate(-50%, 0); }
.cmdbar-key { color: var(--zx-text); border: 1px solid var(--zx-dim); border-radius: 4px; padding: 1.5px 5px; font-weight: 600; }
.cmdbar-spark { color: var(--zx-text); }

.preview-caption {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-top: 14px;
  color: var(--color-muted, #888);
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

/* ============ MARQUEE ============ */
.marquee { overflow: hidden; border-bottom: 1px solid var(--color-border, #2a2a2a); }
.marquee-track { display: flex; width: max-content; animation: zx-marquee 28s linear infinite; }
.marquee:hover .marquee-track { animation-play-state: paused; }
.marquee ul {
  display: flex;
  list-style: none;
  align-items: center;
  gap: 2.4rem;
  padding: 13px 2.4rem 13px 0;
}
.marquee li { display: flex; align-items: center; gap: 2.4rem; font-size: 10px; font-weight: 550; letter-spacing: 0.22em; text-transform: uppercase; color: var(--color-muted, #888); }
.mq-sep { color: var(--zx-text); font-weight: 600; letter-spacing: 0; }
@keyframes zx-marquee { to { transform: translateX(-50%); } }

/* ============ SECTIONS ============ */
.zx-section { padding: 110px 0; }

.section-label {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-muted, #888);
}
.label-sq { width: 7px; height: 7px; background: var(--zx-text); }

.section-title {
  max-width: 46rem;
  margin-top: 15px;
  font-size: clamp(2.3rem, 4.8vw, 4.2rem);
  font-weight: 630;
  line-height: 0.98;
  letter-spacing: -0.045em;
}
.section-title .zx-serif { font-size: 1.02em; color: var(--zx-text); }
.section-copy { color: var(--color-muted, #888); font-size: 15px; line-height: 1.75; }

/* icon frames */
.icoframe {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border, #2a2a2a);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-panel-secondary, #171717) 70%, transparent);
  color: var(--zx-text);
}
.icoframe :deep(svg) { width: 16px; height: 16px; }

/* ============ AI CARDS ============ */
.ai-grid {
  display: grid;
  grid-template-columns: 1.35fr repeat(3, 1fr);
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--color-border, #2a2a2a);
  border-radius: 16px;
  background: var(--color-border, #2a2a2a);
}
.ai-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 250px;
  background: var(--color-canvas, #0f0f0f);
  padding: 23px;
  transition: background 220ms ease;
}
.ai-card:hover { background: color-mix(in srgb, var(--color-panel-secondary, #171717) 55%, var(--color-canvas, #0f0f0f)); }
.ai-card.featured {
  background: linear-gradient(150deg, var(--zx-tint), var(--color-canvas, #0f0f0f) 55%);
  border: 0;
}
.ai-card.featured::before, .ai-card.featured::after {
  content: '';
  position: absolute;
  width: 11px;
  height: 11px;
  border: 0 solid var(--zx-text);
  pointer-events: none;
}
.ai-card.featured::before { top: 9px; left: 9px; border-top-width: 1.5px; border-left-width: 1.5px; }
.ai-card.featured::after { bottom: 9px; right: 9px; border-bottom-width: 1.5px; border-right-width: 1.5px; }

.ai-card-top { display: flex; align-items: center; justify-content: space-between; }
.ai-index { color: var(--color-muted, #888); font-size: 9px; }

.gen-visual { display: flex; flex-direction: column; gap: 7px; margin: auto 0 14px; font-size: 8px; color: var(--color-muted, #888); }
.gen-prompt { font-style: italic; }
.gen-arrow { color: var(--zx-text); }
.gen-board {
  position: relative;
  width: 74px;
  height: 44px;
  border: 1px dashed var(--zx-dim);
  border-radius: 4px;
  background: var(--zx-tint);
}
.gen-board b { position: absolute; width: 6px; height: 6px; background: var(--zx-text); }
.gen-board b:nth-child(1) { top: -3px; left: -3px; }
.gen-board b:nth-child(2) { top: -3px; right: -3px; }
.gen-board b:nth-child(3) { bottom: -3px; left: -3px; }
.gen-board b:nth-child(4) { bottom: -3px; right: -3px; }

.ai-card-copy { margin-top: auto; }
.ai-card-copy h3 { font-size: 16px; font-weight: 650; letter-spacing: -0.01em; }
.ai-card-copy p { margin-top: 7px; max-width: 240px; color: var(--color-muted, #888); font-size: 12px; line-height: 1.65; }
.ai-card-line {
  display: block;
  margin-top: 16px;
  width: 26px;
  height: 2px;
  border-radius: 99px;
  background: var(--zx-text);
  opacity: 0.7;
  transition: width 0.35s cubic-bezier(0.2, 0.7, 0.2, 1);
}
.ai-card:hover .ai-card-line { width: 64px; }

/* ============ FEATURE CARDS ============ */
.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--color-border, #2a2a2a);
  border-radius: 16px;
  background: var(--color-border, #2a2a2a);
}
.feature-card {
  min-height: 148px;
  background: var(--color-canvas, #0f0f0f);
  padding: 22px;
  transition: background 220ms ease;
}
.feature-card:hover { background: color-mix(in srgb, var(--color-panel-secondary, #171717) 55%, var(--color-canvas, #0f0f0f)); }
.feature-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 14px; }
.feature-arrow { color: var(--color-muted, #888); opacity: 0; transform: translate(-4px, 4px); transition: all 0.25s ease; }
.feature-card:hover .feature-arrow { opacity: 1; transform: none; color: var(--zx-text); }
.feature-card h3 { font-size: 13px; font-weight: 650; }
.feature-card p { margin-top: 6px; color: var(--color-muted, #888); font-size: 11px; line-height: 1.6; max-width: 30ch; }

/* ============ WORKFLOW ============ */
.workflow-shell { padding-top: 30px; }
.workflow-frame { border-top: 1px solid var(--color-border, #2a2a2a); padding-top: 34px; }
.steps-list { border-top: 1px solid var(--color-border, #2a2a2a); }
.step-row {
  display: grid;
  grid-template-columns: 58px 1fr auto;
  gap: 16px;
  align-items: center;
  border-bottom: 1px solid var(--color-border, #2a2a2a);
  padding: 21px 10px;
  border-radius: 8px;
  transition: background 200ms ease;
}
.step-row:hover { background: color-mix(in srgb, var(--color-panel-secondary, #171717) 45%, transparent); }
.step-number { color: var(--zx-text); font-size: 11px; font-weight: 700; letter-spacing: 0.12em; }
.step-row h3 { font-size: 14px; font-weight: 650; }
.step-row p { margin-top: 4px; color: var(--color-muted, #888); font-size: 12px; line-height: 1.6; }
.step-arrow { color: var(--color-muted, #888); opacity: 0.55; transition: all 0.2s ease; }
.step-row:hover .step-arrow { opacity: 1; color: var(--zx-text); transform: translate(2px, -2px); }

/* ============ FINAL CTA ============ */
.final-shell { padding-top: 40px; padding-bottom: 90px; }
.final-card {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--color-border, #2a2a2a);
  border-radius: 20px;
  padding: 52px 32px;
  background: linear-gradient(140deg, color-mix(in srgb, var(--color-panel-secondary, #171717) 92%, transparent), var(--color-canvas, #0f0f0f));
}
.final-dots {
  position: absolute; inset: 0;
  background-image: radial-gradient(color-mix(in srgb, var(--color-surface, #f5f5f5) 13%, transparent) 1px, transparent 1.3px);
  background-size: 26px 26px;
  opacity: 0.5;
  mask-image: linear-gradient(to right, black, transparent 70%);
  pointer-events: none;
}
.final-title {
  margin-top: 20px;
  font-size: clamp(2.7rem, 5.8vw, 5.2rem);
  font-weight: 640;
  line-height: 0.97;
  letter-spacing: -0.05em;
}
.final-title .zx-serif { color: var(--zx-text); }

.final-input {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 34px;
  max-width: 30rem;
  width: 100%;
  border: 1px solid var(--color-border-strong, #454545);
  border-radius: 12px;
  padding: 13px 15px;
  background: color-mix(in srgb, var(--color-panel-secondary, #171717) 60%, transparent);
  font-size: 12px;
  color: var(--color-muted, #888);
  text-align: left;
  transition: border-color 180ms ease, box-shadow 180ms ease;
}
.final-input:hover { border-color: var(--zx-dim); box-shadow: 0 0 0 4px var(--zx-tint); }
.fi-mark { color: var(--zx-text); }
.fi-text { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; }
.fi-kbd {
  border: 1px solid var(--color-border, #2a2a2a);
  border-radius: 5px;
  padding: 2px 7px;
  font-size: 9px;
  color: var(--color-surface, #f5f5f5);
}

/* ============ FOOTER ============ */
.zx-footer { border-top: 1px solid var(--color-border, #2a2a2a); }
.footer-note { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-muted, #888); }
.footer-link { font-size: 10px; font-weight: 550; letter-spacing: 0.16em; text-transform: uppercase; color: var(--color-muted, #888); transition: color 160ms ease; }
.footer-link:hover { color: var(--zx-text); }

/* ============ FOCUS ============ */
.zenuxs-page :focus-visible { outline: 1.5px dashed var(--zx-text); outline-offset: 3px; border-radius: 4px; }

/* ============ RESPONSIVE ============ */
@media (max-width: 1023px) {
  .window-body { grid-template-columns: 150px minmax(0, 1fr); }
  .window-sidebar.right { display: none; }
  .ai-grid { grid-template-columns: repeat(2, 1fr); }
  .feature-grid { grid-template-columns: repeat(2, 1fr); }
  .cmdbar-text { display: none; }
}

@media (max-width: 767px) {
  .zx-section { padding: 84px 0; }
  .hero-shell .py-20 { padding-top: 68px; padding-bottom: 76px; }
  .window-wrap { padding-bottom: 18px; }
  .window-body { min-height: 360px; grid-template-columns: 1fr; }
  .window-sidebar.left { display: none; }
  .artboard { top: 46px; left: 36px; right: 16px; bottom: 16px; padding: 20px; }
  .ab-nav { grid-template-columns: 1fr auto auto; gap: 10px; }
  .ab-hide { display: none; }
  .ab-kicker { margin-top: 44px; }
  .ab-stats { display: none; }
  .preview-caption { font-size: 8px; }
  .ai-grid, .feature-grid { grid-template-columns: 1fr; }
  .ai-card { min-height: 220px; }
  .feature-card { min-height: 126px; }
  .step-row { grid-template-columns: 40px 1fr auto; padding: 18px 6px; }
  .zx-cta { padding: 8px 10px; font-size: 11px; }
  .cmdbar { padding: 6px 10px; gap: 8px; }
  .final-card { padding: 40px 22px; }
}

/* ============ MOTION ============ */
@media (prefers-reduced-motion: no-preference) {
  .zx-orb-a { animation: drift-a 9s ease-in-out infinite; }
  .zx-orb-b { animation: drift-b 11s ease-in-out infinite; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
  .ai-prompt-text { width: 30ch; }
}
@keyframes drift-a { 0%, 100% { transform: translate3d(0, 0, 0); } 50% { transform: translate3d(-12px, 14px, 0); } }
@keyframes drift-b { 0%, 100% { transform: translate3d(0, 0, 0); } 50% { transform: translate3d(16px, -8px, 0); } }
</style>