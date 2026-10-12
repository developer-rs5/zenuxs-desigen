<script setup lang="ts">
import SdkDataTable from './SdkDataTable.vue'

interface Row {
  name: string
  type?: string
  description: string
  required?: boolean
  default?: string
}

const { rows } = defineProps<{
  rows: Row[]
}>()

const columns = [
  { key: 'name', label: 'Prop', kind: 'code' },
  { key: 'default', label: 'Default', kind: 'chip' },
  { key: 'type', label: 'Type', kind: 'chip' },
] as const
</script>

<template>
  <SdkDataTable :columns="columns" :rows="rows" />
</template>
