<script setup lang="ts">
import PrototypeDeviceSection from './PrototypeDeviceSection.vue'
import PrototypeSection from './PrototypeSection.vue'

defineOptions({ name: 'PrototypePanel' })
</script>

<template>
  <div class="scrollbar-thin flex-1 overflow-x-hidden overflow-y-auto pb-8">
    <!-- Prototype Device Settings (Device Chassis, Orientation, Canvas Background) -->
    <PrototypeDeviceSection />

    <div class="mx-3 my-2 h-px bg-[#444444]" />

    <!-- Prototype Interactions & Flows (Starting frames, triggers, actions, transitions) -->
    <PrototypeSection />
  </div>
</template>
