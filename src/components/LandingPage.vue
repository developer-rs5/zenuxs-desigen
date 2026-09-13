<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { isAuthenticated, loginWithZenuxs } from '@/app/auth/zenuxs'

const router = useRouter()
const mobileMenuOpen = ref(false)
const theme = ref<'dark' | 'light'>('dark')

onMounted(() => {
  const saved = window.localStorage.getItem('zenuxs-theme')
  theme.value = saved === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = theme.value
})

function setTheme(next: 'dark' | 'light') {
  theme.value = next
  document.documentElement.dataset.theme = next
  window.localStorage.setItem('zenuxs-theme', next)
}

async function handleGetStarted() {
  if (isAuthenticated.value) {
    router.push('/editor')
    return
  }

  try {
    await loginWithZenuxs('ui')
  } catch {
    // Preserve the existing integration behavior.
  }

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
</script>

<template>
  <div class="zenuxs-page h-full overflow-y-auto bg-canvas text-surface">
    <header class="sticky top-0 z-50 border-b border-border/60 bg-canvas/88 backdrop-blur-xl">
      <div class="mx-auto flex h-14 max-w-7xl items-center gap-6 px-5 sm:px-7">
        <button class="flex shrink-0 items-center gap-2.5" aria-label="ZenuxsDesign home" @click="router.push('/')">
          <span class="brand-mark">Z</span>
          <span class="text-[14px] font-semibold tracking-[-0.02em]">ZenuxsDesign</span>
          <span class="hidden rounded-full border border-border bg-panel-secondary px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-muted sm:inline-flex">Beta</span>
        </button>

        <nav class="hidden flex-1 items-center justify-center gap-7 md:flex">
          <a href="#ai" class="nav-link">AI</a>
          <a href="#features" class="nav-link">Features</a>
          <a href="#workflow" class="nav-link">Workflow</a>
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
          <button class="header-signin hidden sm:inline-flex" @click="handleGetStarted">Sign in</button>
          <button class="header-cta" @click="handleGetStarted">
            Start designing
            <icon-lucide-arrow-up-right class="size-3.5" />
          </button>
          <button class="theme-toggle md:hidden" aria-label="Toggle navigation" @click="mobileMenuOpen = !mobileMenuOpen">
            <icon-lucide-x v-if="mobileMenuOpen" class="size-4" />
            <icon-lucide-menu v-else class="size-4" />
          </button>
        </div>
      </div>

      <div v-if="mobileMenuOpen" class="border-t border-border/60 px-5 py-3 md:hidden">
        <nav class="mx-auto flex max-w-7xl flex-col gap-1">
          <a href="#ai" class="mobile-link" @click="mobileMenuOpen = false">AI</a>
          <a href="#features" class="mobile-link" @click="mobileMenuOpen = false">Features</a>
          <a href="#workflow" class="mobile-link" @click="mobileMenuOpen = false">Workflow</a>
          <button class="mobile-link text-left" @click="mobileMenuOpen = false; handleGetStarted()">Sign in / start designing</button>
        </nav>
      </div>
    </header>

    <main>
      <section class="hero-shell">
        <div class="hero-grid" aria-hidden="true" />
        <div class="hero-orb hero-orb-a" aria-hidden="true" />
        <div class="hero-orb hero-orb-b" aria-hidden="true" />

        <div class="mx-auto max-w-7xl px-5 py-20 sm:px-7 sm:py-24 lg:py-28">
          <div class="max-w-4xl">
            <div class="eyebrow mb-6">
              <span class="eyebrow-dot" />
              AI-native visual design
            </div>

            <h1 class="max-w-4xl text-[clamp(3.1rem,7vw,6.8rem)] font-semibold leading-[0.93] tracking-[-0.055em]">
              Make the interface.
              <span class="hero-accent">Not the busywork.</span>
            </h1>

            <p class="mt-7 max-w-2xl text-[16px] leading-7 text-muted sm:text-[18px] sm:leading-8">
              ZenuxsDesign gives you a fast visual workspace, an AI design layer and the control to turn ideas into production-ready experiences.
            </p>

            <div class="mt-9 flex flex-col gap-3 sm:flex-row">
              <button class="primary-btn" @click="handleGetStarted">
                Start designing
                <icon-lucide-arrow-right class="size-4" />
              </button>
              <button class="secondary-btn" @click="handleExplore">
                Open editor
                <icon-lucide-command class="size-4" />
              </button>
            </div>

            <div class="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted">
              <span class="trust-item"><span class="trust-dot" /> No setup tour</span>
              <span class="trust-item"><span class="trust-dot" /> Editable from the first result</span>
              <span class="trust-item"><span class="trust-dot" /> Built for real projects</span>
            </div>
          </div>

          <div class="mt-16 lg:mt-20">
            <div class="product-window">
              <div class="window-topbar">
                <div class="flex items-center gap-1.5">
                  <span class="window-dot" /><span class="window-dot" /><span class="window-dot" />
                </div>
                <div class="window-title"><span class="brand-mark brand-mark-sm">Z</span>ZenuxsDesign</div>
                <div class="window-meta">AI / Canvas</div>
              </div>

              <div class="window-body">
                <aside class="window-sidebar left">
                  <div class="window-sidebar-title">Layers</div>
                  <div class="window-line strong w-16" />
                  <div class="window-tree-row active"><span class="tree-square accent" />Website</div>
                  <div class="window-tree-row indent"><span class="tree-square" />Header</div>
                  <div class="window-tree-row indent"><span class="tree-square accent" />Hero</div>
                  <div class="window-tree-row indent-2"><span class="tree-square" />CTA</div>
                  <div class="window-tree-row indent-2"><span class="tree-square" />Stats</div>
                  <div class="window-tree-row"><span class="tree-square" />Footer</div>
                </aside>

                <div class="window-canvas">
                  <div class="canvas-ruler-top"><span>0</span><span>240</span><span>480</span><span>720</span><span>960</span></div>
                  <div class="canvas-ruler-left"><span>0</span><span>120</span><span>240</span><span>360</span><span>480</span></div>
                  <div class="artboard">
                    <div class="artboard-nav">
                      <span class="artboard-logo">zenuxs</span>
                      <span>Work</span><span>Studio</span><span>About</span>
                      <span class="artboard-cta">Start a project</span>
                    </div>
                    <div class="artboard-kicker">A new way to build on the web</div>
                    <div class="artboard-heading">Design systems<br /><span>without the drag.</span></div>
                    <div class="artboard-copy">From the first frame to production, everything lives in one visual workspace.</div>
                    <div class="artboard-actions"><span class="artboard-primary">Explore</span><span>Read the story ↗</span></div>
                    <div class="artboard-stats"><span>01 — Visual</span><span>02 — AI</span><span>03 — Code</span></div>
                  </div>
                  <div class="canvas-selection" aria-hidden="true" />
                </div>

                <aside class="window-sidebar right">
                  <div class="window-tabs"><span class="selected">Design</span><span>Code</span><span class="selected-ai">AI</span></div>
                  <div class="window-sidebar-title">AI design</div>
                  <div class="ai-note">Describe a change. Keep the result editable.</div>
                  <div class="ai-prompt-mini">Make this hero more editorial.</div>
                  <div class="ai-chips"><span>Improve</span><span>Responsive</span><span>Code</span></div>
                  <div class="ai-result-mini"><div class="result-line long" /><div class="result-line" /><div class="result-box" /></div>
                </aside>
              </div>
            </div>
            <div class="preview-caption">
              <span>THE EDITOR</span>
              <span>Visual canvas / Layers / AI / Code</span>
            </div>
          </div>
        </div>
      </section>

      <section id="ai" class="section-shell">
        <div class="mx-auto max-w-7xl px-5 sm:px-7">
          <div class="section-head grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <div class="section-label">01 / AI layer</div>
              <h2 class="section-title">AI that lives inside the canvas.</h2>
            </div>
            <p class="section-copy">Generate, improve and translate ideas without handing control of the design over to a black box.</p>
          </div>

          <div class="ai-grid mt-12">
            <article v-for="(feature, index) in aiFeatures" :key="feature.title" class="ai-card" :class="{ 'featured': index === 0 }">
              <div class="ai-card-top"><span class="ai-index">0{{ index + 1 }}</span><component :is="feature.icon" class="size-[17px] text-accent" /></div>
              <h3>{{ feature.title }}</h3>
              <p>{{ feature.description }}</p>
              <div class="ai-card-line" />
            </article>
          </div>
        </div>
      </section>

      <section id="features" class="section-shell pt-0">
        <div class="mx-auto max-w-7xl px-5 sm:px-7">
          <div class="section-head grid gap-6 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <div>
              <div class="section-label">02 / Workspace</div>
              <h2 class="section-title">A serious editor with less chrome.</h2>
            </div>
            <p class="section-copy">The product stays quiet so the work can stay loud: clear hierarchy, compact controls and surfaces that earn their space.</p>
          </div>

          <div class="feature-grid mt-12">
            <article v-for="feature in featureGroups" :key="feature.title" class="feature-card">
              <div class="feature-icon"><component :is="feature.icon" class="size-[17px] text-accent" /></div>
              <div class="min-w-0">
                <h3>{{ feature.title }}</h3>
                <p>{{ feature.description }}</p>
              </div>
              <icon-lucide-arrow-up-right class="feature-arrow size-4" />
            </article>
          </div>
        </div>
      </section>

      <section id="workflow" class="section-shell workflow-shell">
        <div class="mx-auto max-w-7xl px-5 sm:px-7">
          <div class="workflow-frame">
            <div class="section-label">03 / Workflow</div>
            <div class="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
              <div>
                <h2 class="section-title max-w-xl">One place from blank page to shipped interface.</h2>
                <p class="section-copy mt-6 max-w-md">A deliberately short path. Start visually, use AI where it helps, and keep every decision editable.</p>
              </div>

              <div class="steps-list">
                <div v-for="step in steps" :key="step.number" class="step-row">
                  <span class="step-number">{{ step.number }}</span>
                  <div><h3>{{ step.title }}</h3><p>{{ step.copy }}</p></div>
                  <icon-lucide-arrow-up-right class="size-4 text-muted" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="section-shell final-shell">
        <div class="mx-auto max-w-7xl px-5 sm:px-7">
          <div class="final-card">
            <div class="final-grid" aria-hidden="true" />
            <div class="relative z-10 max-w-3xl">
              <div class="section-label">ZenuxsDesign / Beta</div>
              <h2 class="mt-5 text-[clamp(2.8rem,6vw,5.6rem)] font-semibold leading-[0.96] tracking-[-0.05em]">Build what you can already see in your head.</h2>
              <p class="mt-6 max-w-xl text-[16px] leading-7 text-muted">Open the editor and start with a frame, a sentence or a half-formed idea.</p>
              <button class="primary-btn mt-8" @click="handleGetStarted">
                Enter ZenuxsDesign
                <icon-lucide-arrow-right class="size-4" />
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer class="border-t border-border/60">
      <div class="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-7 text-[11px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div class="flex items-center gap-2.5"><span class="brand-mark brand-mark-xs">Z</span><span>© 2026 ZenuxsDesign</span></div>
        <div class="flex gap-5"><a href="#ai" class="footer-link">AI</a><a href="#features" class="footer-link">Features</a><a href="#workflow" class="footer-link">Workflow</a></div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.zenuxs-page {
  --zenuxs-max: 1280px;
}

.brand-mark {
  display: inline-flex;
  width: 29px;
  height: 29px;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--color-accent, #3b82f6) 35%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--color-accent, #3b82f6) 12%, transparent);
  color: var(--color-accent, #3b82f6);
  font-size: 12px;
  font-weight: 750;
  letter-spacing: -0.06em;
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 7%, transparent);
}

.brand-mark-sm { width: 18px; height: 18px; border-radius: 5px; font-size: 8px; }
.brand-mark-xs { width: 22px; height: 22px; border-radius: 7px; font-size: 9px; }

.nav-link,
.footer-link { color: var(--color-muted, #888); transition: color 160ms ease; }
.nav-link:hover,
.footer-link:hover { color: var(--color-surface, #f5f5f5); }

.header-signin,
.mobile-link { color: var(--color-muted, #888); font-size: 12px; transition: color 160ms ease, background 160ms ease; }
.header-signin { padding: 8px 9px; }
.header-signin:hover,
.mobile-link:hover { color: var(--color-surface, #f5f5f5); }

.header-cta,
.primary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 11px;
  background: var(--color-accent, #3b82f6);
  color: white;
  font-size: 12px;
  font-weight: 650;
  transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
}

.header-cta { padding: 8px 12px; }
.primary-btn { padding: 12px 16px; min-height: 44px; }
.header-cta:hover,
.primary-btn:hover { transform: translateY(-1px); filter: brightness(1.04); box-shadow: 0 10px 30px color-mix(in srgb, var(--color-accent, #3b82f6) 18%, transparent); }

.theme-toggle,
.secondary-btn {
  border: 1px solid var(--color-border, #2a2a2a);
  background: color-mix(in srgb, var(--color-panel-secondary, #171717) 88%, transparent);
  color: var(--color-muted, #888);
  transition: border-color 160ms ease, color 160ms ease, background 160ms ease;
}
.theme-toggle { display: inline-flex; width: 31px; height: 31px; align-items: center; justify-content: center; border-radius: 9px; }
.theme-toggle:hover { color: var(--color-surface, #f5f5f5); border-color: color-mix(in srgb, var(--color-accent, #3b82f6) 30%, var(--color-border, #2a2a2a)); }
.secondary-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 12px 16px; border-radius: 11px; font-size: 12px; }
.secondary-btn:hover { color: var(--color-surface, #f5f5f5); }

.hero-shell { position: relative; overflow: hidden; border-bottom: 1px solid var(--color-border, #2a2a2a); }
.hero-grid,
.final-grid {
  position: absolute;
  inset: 0;
  opacity: 0.32;
  background-image: linear-gradient(to right, color-mix(in srgb, var(--color-border, #2a2a2a) 45%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--color-border, #2a2a2a) 45%, transparent) 1px, transparent 1px);
  background-size: 54px 54px;
  mask-image: linear-gradient(to bottom, black, transparent 78%);
  pointer-events: none;
}
.hero-orb { position: absolute; border-radius: 999px; filter: blur(80px); opacity: 0.12; pointer-events: none; }
.hero-orb-a { width: 360px; height: 360px; top: 70px; right: 7%; background: var(--color-accent, #3b82f6); }
.hero-orb-b { width: 280px; height: 280px; top: 210px; left: -90px; background: #8b5cf6; opacity: 0.06; }

.eyebrow,
.section-label { color: var(--color-muted, #888); font-size: 10px; font-weight: 650; letter-spacing: 0.15em; text-transform: uppercase; }
.eyebrow { display: inline-flex; align-items: center; gap: 9px; }
.eyebrow-dot { width: 7px; height: 7px; border-radius: 999px; background: var(--color-accent, #3b82f6); box-shadow: 0 0 0 5px color-mix(in srgb, var(--color-accent, #3b82f6) 10%, transparent); }
.hero-accent { display: block; color: var(--color-accent, #3b82f6); }

.product-window { overflow: hidden; border: 1px solid color-mix(in srgb, var(--color-border, #2a2a2a) 85%, transparent); border-radius: 17px; background: var(--color-panel-secondary, #171717); box-shadow: 0 30px 70px rgb(0 0 0 / 18%); }
.window-topbar { display: flex; height: 42px; align-items: center; border-bottom: 1px solid var(--color-border, #2a2a2a); padding: 0 13px; }
.window-dot { display: block; width: 6px; height: 6px; border-radius: 999px; background: var(--color-border-strong, #454545); }
.window-title { position: absolute; left: 50%; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 6px; font-size: 10px; color: var(--color-muted, #888); }
.window-meta { margin-left: auto; font-size: 9px; color: var(--color-muted, #888); }
.window-body { display: grid; min-height: 470px; grid-template-columns: 182px minmax(0, 1fr) 210px; }
.window-sidebar { background: var(--color-canvas, #0f0f0f); padding: 13px; }
.window-sidebar.left { border-right: 1px solid var(--color-border, #2a2a2a); }
.window-sidebar.right { border-left: 1px solid var(--color-border, #2a2a2a); }
.window-sidebar-title { margin-bottom: 11px; font-size: 9px; font-weight: 650; color: var(--color-surface, #f5f5f5); }
.window-line { height: 7px; border-radius: 999px; background: var(--color-border, #2a2a2a); margin-bottom: 13px; }
.window-line.strong { background: color-mix(in srgb, var(--color-surface, #f5f5f5) 15%, transparent); }
.window-tree-row { display: flex; align-items: center; gap: 7px; min-height: 25px; border-radius: 6px; padding: 0 6px; color: var(--color-muted, #888); font-size: 9px; }
.window-tree-row.active { color: var(--color-surface, #f5f5f5); background: color-mix(in srgb, var(--color-accent, #3b82f6) 9%, transparent); }
.window-tree-row.indent { padding-left: 17px; }
.window-tree-row.indent-2 { padding-left: 29px; }
.tree-square { width: 6px; height: 6px; border: 1px solid var(--color-border-strong, #454545); border-radius: 2px; }
.tree-square.accent { border-color: var(--color-accent, #3b82f6); background: color-mix(in srgb, var(--color-accent, #3b82f6) 28%, transparent); }
.window-canvas { position: relative; overflow: hidden; background: #101214; }
.canvas-ruler-top { position: absolute; inset: 0 0 auto 0; display: flex; justify-content: space-around; height: 24px; align-items: center; border-bottom: 1px solid var(--color-border, #2a2a2a); background: #0c0e10; color: #626b74; font-size: 7px; }
.canvas-ruler-left { position: absolute; top: 24px; bottom: 0; left: 0; display: flex; width: 24px; flex-direction: column; align-items: center; justify-content: space-around; border-right: 1px solid var(--color-border, #2a2a2a); background: #0c0e10; color: #626b74; font-size: 7px; }
.artboard { position: absolute; top: 58px; left: 62px; right: 38px; bottom: 28px; overflow: hidden; border: 1px solid #dde0e4; border-radius: 5px; background: #f8f9f7; color: #17191b; padding: 26px 34px; box-shadow: 0 18px 38px rgb(0 0 0 / 24%); }
.artboard-nav { display: grid; grid-template-columns: 1fr auto auto auto auto; align-items: center; gap: 18px; font-size: 7px; color: #5e636a; }
.artboard-logo { color: #17191b; font-size: 9px; font-weight: 750; }
.artboard-cta { padding: 5px 8px; border: 1px solid #cfd4d9; border-radius: 5px; color: #23272a; }
.artboard-kicker { margin-top: 70px; color: #5f7082; font-size: 7px; font-weight: 650; letter-spacing: 0.16em; text-transform: uppercase; }
.artboard-heading { margin-top: 13px; font-size: clamp(24px, 4vw, 43px); font-weight: 600; letter-spacing: -0.06em; line-height: 0.93; }
.artboard-heading span { color: #6f7780; }
.artboard-copy { margin-top: 14px; max-width: 300px; color: #656c73; font-size: 9px; line-height: 1.6; }
.artboard-actions { display: flex; align-items: center; gap: 16px; margin-top: 19px; color: #555c63; font-size: 8px; }
.artboard-primary { display: inline-flex; padding: 7px 11px; border-radius: 6px; background: #15191d; color: white; }
.artboard-stats { position: absolute; right: 34px; bottom: 26px; display: flex; gap: 12px; color: #7b838b; font-size: 7px; }
.canvas-selection { position: absolute; top: 116px; right: 24%; width: 94px; height: 46px; border: 1px solid var(--color-accent, #3b82f6); border-radius: 3px; box-shadow: 0 0 0 9999px rgb(59 130 246 / 0.035); }
.window-tabs { display: flex; gap: 12px; margin-bottom: 17px; border-bottom: 1px solid var(--color-border, #2a2a2a); padding-bottom: 9px; font-size: 9px; color: var(--color-muted, #888); }
.window-tabs .selected { color: var(--color-surface, #f5f5f5); }
.window-tabs .selected-ai { color: var(--color-accent, #3b82f6); }
.ai-note { color: var(--color-muted, #888); font-size: 8px; line-height: 1.55; }
.ai-prompt-mini { margin-top: 12px; border: 1px solid var(--color-border, #2a2a2a); border-radius: 6px; padding: 9px; background: var(--color-panel-secondary, #171717); color: var(--color-surface, #f5f5f5); font-size: 8px; line-height: 1.4; }
.ai-chips { display: flex; gap: 5px; overflow: hidden; margin-top: 8px; }
.ai-chips span { flex: 0 0 auto; border: 1px solid var(--color-border, #2a2a2a); border-radius: 999px; padding: 3px 5px; color: var(--color-muted, #888); font-size: 7px; }
.ai-result-mini { margin-top: 14px; border: 1px solid var(--color-border, #2a2a2a); border-radius: 6px; padding: 9px; }
.result-line { width: 72%; height: 5px; border-radius: 99px; background: var(--color-border, #2a2a2a); }
.result-line.long { width: 92%; margin-bottom: 6px; }
.result-box { width: 100%; height: 56px; margin-top: 10px; border-radius: 5px; background: color-mix(in srgb, var(--color-accent, #3b82f6) 8%, var(--color-panel-secondary, #171717)); }
.preview-caption { display: flex; justify-content: space-between; gap: 16px; margin-top: 10px; color: var(--color-muted, #888); font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; }

.section-shell { padding: 120px 0; }
.section-head { padding-top: 5px; }
.section-title { max-width: 770px; margin-top: 13px; font-size: clamp(2.3rem, 5vw, 4.4rem); font-weight: 600; line-height: 0.98; letter-spacing: -0.05em; }
.section-copy { color: var(--color-muted, #888); font-size: 15px; line-height: 1.75; }
.ai-grid { display: grid; grid-template-columns: 1.35fr repeat(3, 1fr); gap: 1px; overflow: hidden; border: 1px solid var(--color-border, #2a2a2a); border-radius: 16px; background: var(--color-border, #2a2a2a); }
.ai-card { position: relative; min-height: 260px; background: var(--color-canvas, #0f0f0f); padding: 23px; }
.ai-card.featured { background: linear-gradient(140deg, color-mix(in srgb, var(--color-accent, #3b82f6) 8%, var(--color-canvas, #0f0f0f)), var(--color-canvas, #0f0f0f)); }
.ai-card-top { display: flex; align-items: center; justify-content: space-between; }
.ai-index { color: var(--color-muted, #888); font-size: 9px; }
.ai-card h3 { margin-top: 95px; font-size: 16px; font-weight: 650; }
.ai-card p { margin-top: 7px; max-width: 240px; color: var(--color-muted, #888); font-size: 12px; line-height: 1.65; }
.ai-card-line { position: absolute; bottom: 18px; left: 23px; width: 32px; height: 2px; border-radius: 99px; background: var(--color-accent, #3b82f6); opacity: 0.7; }
.feature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; overflow: hidden; border: 1px solid var(--color-border, #2a2a2a); border-radius: 16px; background: var(--color-border, #2a2a2a); }
.feature-card { display: grid; grid-template-columns: auto 1fr auto; gap: 13px; align-items: start; min-height: 142px; background: var(--color-canvas, #0f0f0f); padding: 22px; }
.feature-icon { display: inline-flex; width: 30px; height: 30px; align-items: center; justify-content: center; border: 1px solid var(--color-border, #2a2a2a); border-radius: 8px; background: var(--color-panel-secondary, #171717); }
.feature-card h3 { font-size: 13px; font-weight: 650; }
.feature-card p { margin-top: 5px; color: var(--color-muted, #888); font-size: 11px; line-height: 1.6; }
.feature-arrow { color: var(--color-muted, #888); opacity: 0.6; }
.workflow-shell { padding-top: 20px; }
.workflow-frame { border-top: 1px solid var(--color-border, #2a2a2a); padding-top: 34px; }
.steps-list { border-top: 1px solid var(--color-border, #2a2a2a); }
.step-row { display: grid; grid-template-columns: 58px 1fr auto; gap: 16px; align-items: center; border-bottom: 1px solid var(--color-border, #2a2a2a); padding: 20px 0; }
.step-number { color: var(--color-accent, #3b82f6); font-size: 10px; font-weight: 700; letter-spacing: 0.12em; }
.step-row h3 { font-size: 14px; font-weight: 650; }
.step-row p { margin-top: 4px; color: var(--color-muted, #888); font-size: 12px; line-height: 1.6; }
.final-shell { padding-top: 80px; padding-bottom: 88px; }
.final-card { position: relative; overflow: hidden; border: 1px solid var(--color-border, #2a2a2a); border-radius: 18px; padding: 42px 28px; background: linear-gradient(135deg, color-mix(in srgb, var(--color-panel-secondary, #171717) 92%, transparent), var(--color-canvas, #0f0f0f)); }
.final-grid { opacity: 0.25; mask-image: linear-gradient(to right, black, transparent 72%); }
.final-card::after { content: ''; position: absolute; right: -12%; bottom: -45%; width: 45%; aspect-ratio: 1; border-radius: 999px; background: var(--color-accent, #3b82f6); opacity: 0.07; filter: blur(80px); }
.trust-item { display: inline-flex; align-items: center; gap: 7px; }
.trust-dot { width: 5px; height: 5px; border-radius: 999px; background: var(--color-accent, #3b82f6); opacity: 0.8; }

@media (max-width: 1023px) {
  .window-body { grid-template-columns: 150px minmax(0, 1fr); }
  .window-sidebar.right { display: none; }
  .ai-grid { grid-template-columns: repeat(2, 1fr); }
  .ai-card h3 { margin-top: 65px; }
  .feature-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 767px) {
  .section-shell { padding: 88px 0; }
  .hero-shell .py-20 { padding-top: 72px; padding-bottom: 78px; }
  .window-body { min-height: 360px; grid-template-columns: 1fr; }
  .window-sidebar.left { display: none; }
  .window-canvas { min-height: 360px; }
  .artboard { top: 48px; left: 38px; right: 18px; bottom: 18px; padding: 20px; }
  .artboard-nav { grid-template-columns: 1fr auto auto; gap: 10px; }
  .artboard-nav span:nth-child(3), .artboard-nav span:nth-child(4) { display: none; }
  .artboard-kicker { margin-top: 48px; }
  .preview-caption { font-size: 8px; }
  .ai-grid, .feature-grid { grid-template-columns: 1fr; }
  .ai-card { min-height: 220px; }
  .ai-card h3 { margin-top: 75px; }
  .feature-card { min-height: 126px; }
  .step-row { grid-template-columns: 40px 1fr auto; }
}

@media (prefers-reduced-motion: no-preference) {
  .hero-orb-a { animation: drift-a 9s ease-in-out infinite; }
  .hero-orb-b { animation: drift-b 11s ease-in-out infinite; }
}

@keyframes drift-a { 0%, 100% { transform: translate3d(0, 0, 0); } 50% { transform: translate3d(-12px, 14px, 0); } }
@keyframes drift-b { 0%, 100% { transform: translate3d(0, 0, 0); } 50% { transform: translate3d(16px, -8px, 0); } }
</style>
