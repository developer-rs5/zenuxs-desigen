<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import {
  PROTOTYPE_DEVICES,
  type PrototypeDevice,
  type PrototypeDeviceRotation,
  type PrototypeSettings
} from '@open-pencil/scene-graph'
import { useI18n } from '@open-pencil/vue'

import { useEditorStore } from '@/app/editor/active-store'
import PanelFieldGroup from '@/components/ui/panel/PanelFieldGroup.vue'
import PanelItemRow from '@/components/ui/panel/PanelItemRow.vue'
import PanelSection from '@/components/ui/panel/PanelSection.vue'
import AppSelect from '@/components/ui/select/AppSelect.vue'

const store = useEditorStore()
const { panels } = useI18n()

const currentSettings = computed<PrototypeSettings>(() => {
  void store.state.sceneVersion
  return (
    store.getPrototypeSettings() ?? {
      device: 'None',
      background: '#1E1E1E',
      rotation: 'portrait',
      color: '',
      customSize: [1280, 720],
      responsive: false
    }
  )
})

const selectedDeviceName = ref(currentSettings.value.device || 'None')
const selectedRotation = ref<PrototypeDeviceRotation>(currentSettings.value.rotation || 'portrait')
const selectedColor = ref(currentSettings.value.color || '')
const selectedBackground = ref(currentSettings.value.background || '#1E1E1E')
const isResponsive = ref(currentSettings.value.responsive || false)

watch(currentSettings, (next) => {
  selectedDeviceName.value = next.device || 'None'
  selectedRotation.value = next.rotation || 'portrait'
  selectedColor.value = next.color || ''
  selectedBackground.value = next.background || '#1E1E1E'
  isResponsive.value = next.responsive || false
})

const deviceOptions = computed(() => [
  { value: 'None', label: 'None' },
  { value: 'Custom size', label: 'Custom size' },
  ...PROTOTYPE_DEVICES.map((d) => ({ value: d.name, label: d.name }))
])

const activeDevice = computed<PrototypeDevice | null>(() => {
  return PROTOTYPE_DEVICES.find((d) => d.name === selectedDeviceName.value) ?? null
})

const colorOptions = computed(() => {
  const dev = activeDevice.value
  if (!dev || dev.colors.length === 0) return []
  return dev.colors.map((c) => ({ value: c.name, label: c.name }))
})

function commitSettings() {
  store.setPrototypeSettings({
    device: selectedDeviceName.value,
    rotation: selectedRotation.value,
    color: selectedColor.value,
    background: selectedBackground.value,
    customSize: currentSettings.value.customSize ?? [1280, 720],
    responsive: isResponsive.value
  })
}

function onDeviceChange(name: string) {
  selectedDeviceName.value = name
  const dev = PROTOTYPE_DEVICES.find((d) => d.name === name)
  selectedColor.value = dev?.colors[0]?.name ?? ''
  commitSettings()
}

function onRotationChange(rot: PrototypeDeviceRotation) {
  selectedRotation.value = rot
  commitSettings()
}

function onColorChange(c: string) {
  selectedColor.value = c
  commitSettings()
}

function onBackgroundChange(bg: string) {
  selectedBackground.value = bg
  commitSettings()
}
</script>

<template>
  <PanelSection
    :label="panels.prototype || 'Prototype Device'"
    data-property="prototype-device-section"
  >
    <PanelFieldGroup>
      <PanelItemRow label="Device">
        <AppSelect
          :model-value="selectedDeviceName"
          :options="deviceOptions"
          @update:model-value="onDeviceChange"
        />
      </PanelItemRow>

      <PanelItemRow v-if="activeDevice && activeDevice.rotates" label="Orientation">
        <div class="flex gap-1">
          <button
            type="button"
            class="flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors"
            :class="
              selectedRotation === 'portrait'
                ? 'bg-[#3B82F6] text-white'
                : 'bg-[#1B1E22] text-[#9CA3AF] hover:text-[#F5F7FA]'
            "
            @click="onRotationChange('portrait')"
          >
            Portrait
          </button>
          <button
            type="button"
            class="flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors"
            :class="
              selectedRotation === 'landscape'
                ? 'bg-[#3B82F6] text-white'
                : 'bg-[#1B1E22] text-[#9CA3AF] hover:text-[#F5F7FA]'
            "
            @click="onRotationChange('landscape')"
          >
            Landscape
          </button>
        </div>
      </PanelItemRow>

      <PanelItemRow v-if="colorOptions.length > 0" label="Model Color">
        <AppSelect
          :model-value="selectedColor || colorOptions[0].value"
          :options="colorOptions"
          @update:model-value="onColorChange"
        />
      </PanelItemRow>

      <PanelItemRow label="Background">
        <div class="flex items-center gap-2">
          <input
            type="color"
            :value="selectedBackground"
            class="size-5 cursor-pointer rounded border border-border bg-transparent p-0"
            @input="onBackgroundChange(($event.target as HTMLInputElement).value)"
          />
          <span class="text-[11px] uppercase text-muted">{{ selectedBackground }}</span>
        </div>
      </PanelItemRow>
    </PanelFieldGroup>
  </PanelSection>
</template>
