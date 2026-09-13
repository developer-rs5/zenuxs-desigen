<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { isAuthenticated, loginWithZenuxs } from '@/app/auth/zenuxs'

const router = useRouter()
const mobileMenuOpen = ref(false)

async function handleGetStarted() {
  if (isAuthenticated.value) {
    router.push('/editor')
    return
  }
  try {
    await loginWithZenuxs('ui')
  } catch {
    // User cancelled or popup blocked — still navigate to editor
  }
  router.push('/editor')
}

function handleExplore() {
  router.push('/editor')
}

const features = [
  {
    icon: 'icon-lucide-wand-2',
    title: 'AI Generate',
    description: 'Create interfaces from natural language descriptions.'
  },
  {
    icon: 'icon-lucide-sparkles',
    title: 'AI Improve',
    description: 'Select an element and ask AI to refine it.'
  },
  {
    icon: 'icon-lucide-layout-grid',
    title: 'AI Components',
    description: 'Generate reusable components and design systems.'
  },
  {
    icon: 'icon-lucide-code-2',
    title: 'AI → Code',
    description: 'Turn designs into production-ready code instantly.'
  }
]

const gridFeatures = [
  { icon: 'icon-lucide-pen-tool', title: 'Visual Editor', description: 'Professional canvas with shapes, text, images and vector tools.' },
  { icon: 'icon-lucide-sparkles', title: 'AI-Powered', description: 'Generate and improve designs with natural language.' },
  { icon: 'icon-lucide-layout-grid', title: 'Components', description: 'Build reusable component libraries and design systems.' },
  { icon: 'icon-lucize-palette', title: 'Design Systems', description: 'Variables, tokens and shared styles across your project.' },
  { icon: 'icon-lucide-smartphone', title: 'Responsive', description: 'Auto-layout and constraints for every screen size.' },
  { icon: 'icon-lucide-code-2', title: 'Code Export', description: 'Export as JSX, Tailwind or HTML/CSS with live preview.' },
  { icon: 'icon-lucide-users', title: 'Collaboration', description: 'Real-time multiplayer editing with presence indicators.' },
  { icon: 'icon-lucide-download', title: 'Export', description: 'PNG, SVG, PDF and more with resolution control.' },
  { icon: 'icon-lucide-layers', title: 'Pages & Layers', description: 'Organize complex projects with pages and a layer tree.' }
]

const steps = [
  { number: '01', title: 'Describe', description: 'Tell ZenuxsDesign what you want to create.' },
  { number: '02', title: 'Design', description: 'Refine it visually with the powerful editor.' },
  { number: '03', title: 'Ship', description: 'Turn your design into production-ready code.' }
]
</script>

<template>
  <div class="min-h-screen bg-[#0D0F12] text-[#F5F7FA]">
    <!-- Header -->
    <header class="fixed top-0 right-0 left-0 z-50 border-b border-[#282D34]/50 bg-[#0D0F12]/80 backdrop-blur-xl">
      <div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <!-- Logo -->
        <div class="flex items-center gap-2.5">
          <div class="flex size-8 items-center justify-center rounded-lg bg-[#3B82F6] text-[12px] font-bold text-white">
            Z
          </div>
          <span class="text-[16px] font-semibold">ZenuxsDesign</span>
          <span class="rounded-full bg-[#3B82F6]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#3B82F6]">
            Beta
          </span>
        </div>

        <!-- Nav (desktop) -->
        <nav class="hidden items-center gap-8 md:flex">
          <a href="#features" class="text-[13px] text-[#9CA3AF] transition-colors hover:text-[#F5F7FA]">Features</a>
          <a href="#ai" class="text-[13px] text-[#9CA3AF] transition-colors hover:text-[#F5F7FA]">AI Design</a>
          <a href="#workflow" class="text-[13px] text-[#9CA3AF] transition-colors hover:text-[#F5F7FA]">Components</a>
          <a href="#features" class="text-[13px] text-[#9CA3AF] transition-colors hover:text-[#F5F7FA]">Code</a>
        </nav>

        <!-- Actions -->
        <div class="flex items-center gap-3">
          <button
            class="hidden rounded-lg px-4 py-2 text-[13px] text-[#9CA3AF] transition-colors hover:text-[#F5F7FA] md:block"
            @click="handleGetStarted"
          >
            Sign in
          </button>
          <button
            class="rounded-lg bg-[#3B82F6] px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-[#2563EB] hover:shadow-lg hover:shadow-[#3B82F6]/25"
            @click="handleGetStarted"
          >
            Get Started
          </button>
          <!-- Mobile menu toggle -->
          <button
            class="flex size-9 items-center justify-center rounded-lg text-[#9CA3AF] md:hidden"
            @click="mobileMenuOpen = !mobileMenuOpen"
          >
            <icon-lucide-menu class="size-5" />
          </button>
        </div>
      </div>

      <!-- Mobile menu -->
      <div v-if="mobileMenuOpen" class="border-t border-[#282D34]/50 px-6 py-4 md:hidden">
        <nav class="flex flex-col gap-3">
          <a href="#features" class="text-[13px] text-[#9CA3AF]" @click="mobileMenuOpen = false">Features</a>
          <a href="#ai" class="text-[13px] text-[#9CA3AF]" @click="mobileMenuOpen = false">AI Design</a>
          <a href="#workflow" class="text-[13px] text-[#9CA3AF]" @click="mobileMenuOpen = false">Components</a>
          <a href="#features" class="text-[13px] text-[#9CA3AF]" @click="mobileMenuOpen = false">Code</a>
          <button class="mt-2 rounded-lg bg-[#3B82F6] px-4 py-2 text-[13px] font-medium text-white" @click="handleGetStarted">
            Get Started
          </button>
        </nav>
      </div>
    </header>

    <!-- Hero -->
    <section class="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-16">
      <!-- Background glow -->
      <div class="pointer-events-none absolute top-1/4 left-1/2 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3B82F6]/5 blur-[120px]" />

      <div class="relative z-10 mx-auto max-w-4xl text-center">
        <div class="mb-6 inline-flex items-center gap-2 rounded-full border border-[#282D34] bg-[#15181C] px-4 py-1.5 text-[12px] text-[#9CA3AF]">
          <icon-lucide-sparkles class="size-3.5 text-[#3B82F6]" />
          <span>AI-powered design editor</span>
        </div>

        <h1 class="mb-6 text-5xl font-bold leading-tight tracking-tight md:text-7xl">
          Design at the
          <span class="bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] bg-clip-text text-transparent">speed of thought</span>
        </h1>

        <p class="mx-auto mb-10 max-w-2xl text-lg text-[#9CA3AF] md:text-xl">
          A modern AI-powered design workspace for creating beautiful interfaces,
          components and production-ready experiences.
        </p>

        <div class="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <button
            class="flex items-center gap-2 rounded-xl bg-[#3B82F6] px-8 py-3.5 text-[15px] font-medium text-white transition-all hover:bg-[#2563EB] hover:shadow-xl hover:shadow-[#3B82F6]/25"
            @click="handleGetStarted"
          >
            Get Started
            <icon-lucide-arrow-right class="size-4" />
          </button>
          <button
            class="flex items-center gap-2 rounded-xl border border-[#282D34] bg-[#15181C] px-8 py-3.5 text-[15px] text-[#9CA3AF] transition-all hover:border-[#3B82F6]/30 hover:text-[#F5F7FA]"
            @click="handleExplore"
          >
            Explore the editor
          </button>
        </div>
      </div>

      <!-- Product Preview -->
      <div class="relative z-10 mx-auto mt-20 w-full max-w-5xl">
        <div class="overflow-hidden rounded-2xl border border-[#282D34] bg-[#15181C] shadow-2xl shadow-black/50">
          <!-- Editor chrome mockup -->
          <div class="flex h-10 items-center gap-2 border-b border-[#282D34] bg-[#0D0F12] px-4">
            <div class="flex gap-1.5">
              <div class="size-3 rounded-full bg-[#FF5F57]" />
              <div class="size-3 rounded-full bg-[#FFBD2E]" />
              <div class="size-3 rounded-full bg-[#28C840]" />
            </div>
            <div class="mx-auto flex items-center gap-2 text-[11px] text-[#6B7280]">
              <div class="size-4 rounded bg-[#3B82F6]" />
              <span>ZenuxsDesign</span>
              <span class="rounded bg-[#3B82F6]/15 px-1 py-0.5 text-[8px] text-[#3B82F6]">BETA</span>
            </div>
          </div>
          <!-- Editor body mockup -->
          <div class="flex h-[360px] md:h-[420px]">
            <!-- Left sidebar mockup -->
            <div class="hidden w-48 shrink-0 border-r border-[#282D34] bg-[#0D0F12] p-3 md:block">
              <div class="mb-3 flex gap-1">
                <div class="rounded bg-[#3B82F6]/15 px-2 py-1 text-[10px] text-[#3B82F6]">Pages</div>
                <div class="rounded px-2 py-1 text-[10px] text-[#6B7280]">Assets</div>
              </div>
              <div class="mb-2 text-[10px] font-semibold text-[#F5F7FA]">Pages</div>
              <div class="mb-3 rounded-md bg-[#3B82F6]/10 px-2 py-1.5 text-[10px] text-[#F5F7FA]">Page 1</div>
              <div class="mb-4 text-[10px] text-[#6B7280]">+ Create new page</div>
              <div class="mb-2 text-[10px] font-semibold text-[#F5F7FA]">Layers</div>
              <div class="space-y-1">
                <div class="flex items-center gap-1.5 rounded px-1.5 py-1 text-[10px] text-[#9CA3AF]">
                  <div class="size-2 rounded bg-[#3B82F6]" />
                  Frame 1
                </div>
                <div class="flex items-center gap-1.5 rounded px-1.5 py-1 pl-5 text-[10px] text-[#9CA3AF]">
                  <div class="size-2 rounded bg-[#F5F7FA]" />
                  Header
                </div>
                <div class="flex items-center gap-1.5 rounded px-1.5 py-1 pl-5 text-[10px] text-[#9CA3AF]">
                  <div class="size-2 rounded bg-[#3B82F6]" />
                  Hero Section
                </div>
                <div class="flex items-center gap-1.5 rounded px-1.5 py-1 pl-5 text-[10px] text-[#9CA3AF]">
                  <div class="size-2 rounded bg-[#F5F7FA]" />
                  CTA Button
                </div>
              </div>
            </div>
            <!-- Canvas mockup -->
            <div class="relative flex-1 bg-[#15181C]">
              <!-- Ruler mockup -->
              <div class="absolute top-0 right-0 left-0 flex h-5 items-end border-b border-[#282D34] bg-[#0D0F12] px-2">
                <span v-for="n in 12" :key="n" class="mr-6 text-[8px] text-[#6B7280]">{{ n * 100 }}</span>
              </div>
              <div class="absolute top-5 bottom-0 left-0 flex w-5 flex-col items-end border-r border-[#282D34] bg-[#0D0F12] pt-1">
                <span v-for="n in 8" :key="n" class="mb-4 text-[8px] text-[#6B7280]">{{ n * 100 }}</span>
              </div>
              <!-- Canvas artboard -->
              <div class="absolute top-12 left-12 h-64 w-[420px] rounded-lg bg-white shadow-lg md:h-80 md:w-[520px]">
                <div class="p-6">
                  <div class="mb-3 h-3 w-32 rounded bg-gray-200" />
                  <div class="mb-2 h-2 w-48 rounded bg-gray-100" />
                  <div class="mb-4 h-2 w-36 rounded bg-gray-100" />
                  <div class="mb-6 h-8 w-24 rounded-md bg-[#3B82F6]" />
                  <div class="flex gap-3">
                    <div class="h-20 flex-1 rounded-lg bg-gray-100" />
                    <div class="h-20 flex-1 rounded-lg bg-gray-100" />
                    <div class="h-20 flex-1 rounded-lg bg-gray-100" />
                  </div>
                </div>
              </div>
              <!-- Floating toolbar mockup -->
              <div class="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl bg-[#0D0F12] p-1.5 shadow-lg">
                <div class="size-7 rounded-lg bg-[#3B82F6]" />
                <div class="size-7 rounded-lg bg-[#1E2126]" />
                <div class="size-7 rounded-lg bg-[#1E2126]" />
                <div class="size-7 rounded-lg bg-[#1E2126]" />
                <div class="size-7 rounded-lg bg-[#1E2126]" />
                <div class="size-7 rounded-lg bg-[#1E2126]" />
              </div>
            </div>
            <!-- Right sidebar mockup -->
            <div class="hidden w-52 shrink-0 border-l border-[#282D34] bg-[#0D0F12] p-3 md:block">
              <div class="mb-3 flex gap-2 border-b border-[#282D34] pb-2">
                <div class="text-[10px] text-[#F5F7FA]">Design</div>
                <div class="text-[10px] text-[#6B7280]">Code</div>
                <div class="text-[10px] text-[#3B82F6]">✦ AI</div>
              </div>
              <div class="mb-3 text-[10px] font-semibold text-[#F5F7FA]">Position</div>
              <div class="mb-3 grid grid-cols-2 gap-1.5">
                <div class="rounded bg-[#1E2126] px-2 py-1 text-[9px] text-[#9CA3AF]">X: 0</div>
                <div class="rounded bg-[#1E2126] px-2 py-1 text-[9px] text-[#9CA3AF]">Y: 0</div>
              </div>
              <div class="mb-3 text-[10px] font-semibold text-[#F5F7FA]">Layout</div>
              <div class="mb-3 flex gap-1">
                <div class="flex-1 rounded bg-[#1E2126] px-2 py-1 text-center text-[9px] text-[#9CA3AF]">Flex</div>
                <div class="flex-1 rounded bg-[#1E2126] px-2 py-1 text-center text-[9px] text-[#9CA3AF]">Grid</div>
                <div class="flex-1 rounded bg-[#1E2126] px-2 py-1 text-center text-[9px] text-[#9CA3AF]">Auto</div>
              </div>
              <div class="mb-3 text-[10px] font-semibold text-[#F5F7FA]">Fill</div>
              <div class="mb-3 flex items-center gap-2">
                <div class="size-5 rounded border border-[#282D34] bg-[#3B82F6]" />
                <span class="text-[9px] text-[#9CA3AF]">#3B82F6</span>
              </div>
              <div class="text-[10px] font-semibold text-[#F5F7FA]">Effects</div>
              <div class="mt-1 rounded bg-[#1E2126] px-2 py-1 text-[9px] text-[#9CA3AF]">Shadow • 0 4px 12px</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- AI Section -->
    <section id="ai" class="relative px-6 py-32">
      <div class="mx-auto max-w-6xl">
        <div class="mb-16 text-center">
          <div class="mb-4 inline-flex items-center gap-2 rounded-full border border-[#282D34] bg-[#15181C] px-4 py-1.5 text-[12px] text-[#3B82F6]">
            <icon-lucide-sparkles class="size-3.5" />
            <span>AI-Powered</span>
          </div>
          <h2 class="mb-4 text-4xl font-bold md:text-5xl">Your AI design copilot.</h2>
          <p class="mx-auto max-w-xl text-lg text-[#9CA3AF]">
            From natural language to production-ready designs. Let AI handle the heavy lifting.
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div
            v-for="feature in features"
            :key="feature.title"
            class="group rounded-2xl border border-[#282D34] bg-[#15181C] p-6 transition-all hover:border-[#3B82F6]/30 hover:bg-[#191D22]"
          >
            <div class="mb-4 flex size-10 items-center justify-center rounded-xl bg-[#3B82F6]/10">
              <component :is="feature.icon" class="size-5 text-[#3B82F6]" />
            </div>
            <h3 class="mb-2 text-[15px] font-semibold">{{ feature.title }}</h3>
            <p class="text-[13px] leading-relaxed text-[#9CA3AF]">{{ feature.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Features Grid -->
    <section id="features" class="px-6 py-32">
      <div class="mx-auto max-w-6xl">
        <div class="mb-16 text-center">
          <h2 class="mb-4 text-4xl font-bold md:text-5xl">Everything you need.</h2>
          <p class="mx-auto max-w-xl text-lg text-[#9CA3AF]">
            A complete design tool built for modern teams.
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="feature in gridFeatures"
            :key="feature.title"
            class="group rounded-2xl border border-[#282D34] bg-[#15181C] p-6 transition-all hover:border-[#3B82F6]/20 hover:bg-[#191D22]"
          >
            <component :is="feature.icon" class="mb-3 size-5 text-[#3B82F6]" />
            <h3 class="mb-1.5 text-[14px] font-semibold">{{ feature.title }}</h3>
            <p class="text-[13px] leading-relaxed text-[#9CA3AF]">{{ feature.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Workflow -->
    <section id="workflow" class="px-6 py-32">
      <div class="mx-auto max-w-4xl">
        <div class="mb-16 text-center">
          <h2 class="mb-4 text-4xl font-bold md:text-5xl">Simple workflow.</h2>
          <p class="text-lg text-[#9CA3AF]">From idea to production in three steps.</p>
        </div>

        <div class="grid gap-8 md:grid-cols-3">
          <div v-for="step in steps" :key="step.number" class="text-center">
            <div class="mb-4 text-5xl font-bold text-[#3B82F6]/20">{{ step.number }}</div>
            <h3 class="mb-2 text-xl font-semibold">{{ step.title }}</h3>
            <p class="text-[14px] leading-relaxed text-[#9CA3AF]">{{ step.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Final CTA -->
    <section class="px-6 py-32">
      <div class="mx-auto max-w-3xl text-center">
        <h2 class="mb-4 text-4xl font-bold md:text-5xl">Ready to design differently?</h2>
        <p class="mb-10 text-lg text-[#9CA3AF]">Start creating with ZenuxsDesign.</p>
        <button
          class="inline-flex items-center gap-2 rounded-xl bg-[#3B82F6] px-10 py-4 text-[16px] font-medium text-white transition-all hover:bg-[#2563EB] hover:shadow-xl hover:shadow-[#3B82F6]/25"
          @click="handleGetStarted"
        >
          Get Started
          <icon-lucide-arrow-right class="size-4" />
        </button>
      </div>
    </section>

    <!-- Footer -->
    <footer class="border-t border-[#282D34] px-6 py-8">
      <div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div class="flex items-center gap-2">
          <div class="flex size-6 items-center justify-center rounded bg-[#3B82F6] text-[10px] font-bold text-white">Z</div>
          <span class="text-[13px] text-[#6B7280]">© 2026 ZenuxsDesign. All rights reserved.</span>
        </div>
        <div class="flex gap-6">
          <a href="#" class="text-[12px] text-[#6B7280] transition-colors hover:text-[#F5F7FA]">Privacy</a>
          <a href="#" class="text-[12px] text-[#6B7280] transition-colors hover:text-[#F5F7FA]">Terms</a>
          <a href="#" class="text-[12px] text-[#6B7280] transition-colors hover:text-[#F5F7FA]">Contact</a>
        </div>
      </div>
    </footer>
  </div>
</template>
