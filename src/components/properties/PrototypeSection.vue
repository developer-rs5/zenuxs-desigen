<script setup lang="ts">
import type {
  PrototypeEasing,
  PrototypeSpring,
  PrototypeTrigger,
  PrototypeTransition
} from '@open-pencil/scene-graph'

import NumberField from '@/components/inputs/NumberField.vue'
import type { PrototypeActionType } from '@/components/properties/prototype/use'
import { usePrototypeSection } from '@/components/properties/prototype/use'
import AppButton from '@/components/ui/button/AppButton.vue'
import IconButton from '@/components/ui/button/IconButton.vue'
import AppInput from '@/components/ui/input/AppInput.vue'
import PanelFieldGroup from '@/components/ui/panel/PanelFieldGroup.vue'
import PanelSection from '@/components/ui/panel/PanelSection.vue'
import AppSelect from '@/components/ui/select/AppSelect.vue'

const {
  store,
  panels,
  pages,
  node,
  interactions,
  stateModel,
  flows,
  activeFlow,
  flowOptions,
  isFlowStart,
  flowNameDraft,
  selectFlow,
  addFlow,
  removeFlow,
  commitFlowName,
  frameOptions,
  triggerOptions,
  actionOptions,
  transitionKindOptions,
  easingOptions,
  directionOptions,
  springModeOptions,
  SPRING_DEFAULTS,
  stateOptions,
  patchInteraction,
  setTrigger,
  setActionType,
  setTransitionKind,
  patchInteractionSpring,
  patchStateSpring,
  addInteraction,
  removeInteraction,
  addState,
  patchState,
  setStateTransition,
  patchStateDuration,
  patchStateEasing,
  removeState,
  stateNames,
  commitStateName,
  blurInput
} = usePrototypeSection()
</script>

<template>
  <PanelSection v-if="node" :label="panels.prototype" data-property="prototype-section">
    <template #actions>
      <IconButton
        v-if="node.type === 'FRAME' && !isFlowStart"
        :label="panels.setFlowStart"
        @click="store.setPrototypeStartNode(node.id)"
      >
        <icon-lucide-flag class="size-3.5" />
      </IconButton>
    </template>

    <p v-if="isFlowStart" class="mb-1.5 text-[10px] leading-4 text-[#3B82F6]">
      {{ panels.startsFlow }}
    </p>

    <div class="mb-1.5 flex items-center gap-1" data-property="prototype-flows">
      <AppSelect
        v-if="flows.length > 0"
        :model-value="activeFlow?.id ?? ''"
        :label="panels.flow"
        :options="flowOptions"
        class="flex-1"
        data-property="prototype-flow"
        @update:model-value="selectFlow($event as string)"
      />
      <IconButton :label="panels.add" data-property="add-flow" @click="addFlow">
        <icon-lucide-plus class="size-3.5" />
      </IconButton>
      <IconButton
        v-if="activeFlow"
        :label="pages.delete"
        data-property="remove-flow"
        @click="removeFlow"
      >
        <icon-lucide-trash-2 class="size-3.5" />
      </IconButton>
    </div>

    <AppInput
      v-if="activeFlow"
      v-model="flowNameDraft"
      size="sm"
      tone="panel"
      :aria-label="panels.flow"
      data-property="prototype-flow-name"
      class="mb-1.5"
      @change="commitFlowName"
      @enter="blurInput"
    />

    <div class="mb-1 flex items-center justify-between">
      <span class="text-[11px] text-muted">{{ panels.interactions }}</span>
      <IconButton
        :label="panels.addInteraction"
        data-property="add-interaction"
        @click="addInteraction"
      >
        <icon-lucide-plus class="size-3.5" />
      </IconButton>
    </div>

    <div v-if="interactions.length" class="flex flex-col gap-2">
      <div
        v-for="(interaction, index) in interactions"
        :key="interaction.id"
        class="flex flex-col gap-1.5 rounded border border-border p-1.5"
        data-property="interaction"
      >
        <div class="flex items-center gap-1">
          <AppSelect
            :model-value="interaction.trigger"
            :label="panels.trigger"
            :options="triggerOptions"
            class="flex-1"
            :data-property="`interaction-${index}-trigger`"
            @update:model-value="setTrigger(index, $event as PrototypeTrigger)"
          />
          <IconButton :label="panels.removeInteraction" @click="removeInteraction(index)">
            <icon-lucide-trash-2 class="size-3.5" />
          </IconButton>
        </div>

        <NumberField
          v-if="interaction.trigger === 'afterDelay'"
          :label="panels.delay"
          :model-value="interaction.delayMs ?? 500"
          :min="0"
          :max="60000"
          :step="100"
          :data-property="`interaction-${index}-delay`"
          @commit="(value: number) => patchInteraction(index, { delayMs: value })"
        />

        <AppSelect
          :model-value="interaction.action.type"
          :label="panels.prototypeAction"
          :options="actionOptions"
          :data-property="`interaction-${index}-action`"
          @update:model-value="setActionType(index, $event as PrototypeActionType)"
        />

        <AppSelect
          v-if="interaction.action.type === 'navigate'"
          :model-value="interaction.action.destinationId"
          :label="panels.destination"
          :options="frameOptions"
          :data-property="`interaction-${index}-destination`"
          @update:model-value="
            patchInteraction(index, {
              action: { type: 'navigate', destinationId: $event as string }
            })
          "
        />

        <template v-if="interaction.action.type === 'openOverlay'">
          <AppSelect
            :model-value="interaction.action.overlayId"
            :label="panels.prototypeOverlay"
            :options="frameOptions"
            :data-property="`interaction-${index}-overlay`"
            @update:model-value="
              patchInteraction(index, {
                action: { type: 'openOverlay', overlayId: $event as string }
              })
            "
          />
          <NumberField
            :label="panels.overlayOpacity"
            :model-value="Math.round((interaction.action.backdropOpacity ?? 0.3) * 100)"
            :min="0"
            :max="100"
            suffix="%"
            :data-property="`interaction-${index}-backdrop`"
            @commit="
              (value: number) =>
                patchInteraction(index, {
                  action: {
                    type: 'openOverlay',
                    overlayId:
                      interaction.action.type === 'openOverlay' ? interaction.action.overlayId : '',
                    backdropOpacity: Math.min(1, Math.max(0, value / 100))
                  }
                })
            "
          />
        </template>

        <AppSelect
          v-if="interaction.action.type === 'setState' && stateOptions.length"
          :model-value="interaction.action.state"
          :label="panels.prototypeState"
          :options="stateOptions"
          :data-property="`interaction-${index}-state`"
          @update:model-value="
            patchInteraction(index, { action: { type: 'setState', state: $event as string } })
          "
        />

        <AppSelect
          :model-value="interaction.transition?.kind ?? 'instant'"
          :label="panels.transition"
          :options="transitionKindOptions"
          :data-property="`interaction-${index}-transition`"
          @update:model-value="setTransitionKind(index, $event as PrototypeTransition['kind'])"
        />

        <div
          v-if="interaction.transition?.kind === 'spring'"
          class="flex flex-col gap-1.5"
          :data-property="`interaction-${index}-spring`"
        >
          <AppSelect
            :model-value="interaction.transition.spring.mode"
            :label="panels.springMode"
            :options="springModeOptions"
            :data-property="`interaction-${index}-spring-mode`"
            @update:model-value="
              patchInteractionSpring(index, { mode: $event as PrototypeSpring['mode'] })
            "
          />
          <NumberField
            v-if="interaction.transition.spring.mode === 'time'"
            :label="panels.bounce"
            :model-value="interaction.transition.spring.bounce ?? SPRING_DEFAULTS.bounce"
            :min="0"
            :max="1"
            :step="0.05"
            :data-property="`interaction-${index}-spring-bounce`"
            @commit="(value: number) => patchInteractionSpring(index, { bounce: value })"
          />
          <template v-else>
            <div class="grid grid-cols-2 gap-1.5">
              <NumberField
                :label="panels.stiffness"
                :model-value="interaction.transition.spring.stiffness ?? SPRING_DEFAULTS.stiffness"
                :min="0"
                :max="10000"
                :step="10"
                :data-property="`interaction-${index}-spring-stiffness`"
                @commit="(value: number) => patchInteractionSpring(index, { stiffness: value })"
              />
              <NumberField
                :label="panels.damping"
                :model-value="interaction.transition.spring.damping ?? SPRING_DEFAULTS.damping"
                :min="0"
                :max="1000"
                :step="1"
                :data-property="`interaction-${index}-spring-damping`"
                @commit="(value: number) => patchInteractionSpring(index, { damping: value })"
              />
            </div>
            <NumberField
              :label="panels.mass"
              :model-value="interaction.transition.spring.mass ?? SPRING_DEFAULTS.mass"
              :min="0"
              :max="100"
              :step="0.1"
              :data-property="`interaction-${index}-spring-mass`"
              @commit="(value: number) => patchInteractionSpring(index, { mass: value })"
            />
          </template>
        </div>

        <PanelFieldGroup
          v-if="
            interaction.transition &&
            interaction.transition.kind !== 'instant' &&
            interaction.transition.kind !== 'spring'
          "
          :label="panels.duration"
        >
          <NumberField
            :model-value="interaction.transition.durationMs"
            :min="0"
            :max="60000"
            :step="50"
            :data-property="`interaction-${index}-duration`"
            @commit="
              (value: number) => {
                const transition = interaction.transition
                if (transition && transition.kind !== 'instant' && transition.kind !== 'spring') {
                  patchInteraction(index, { transition: { ...transition, durationMs: value } })
                }
              }
            "
          />
        </PanelFieldGroup>

        <AppSelect
          v-if="
            interaction.transition &&
            (interaction.transition.kind === 'fade' || interaction.transition.kind === 'slide')
          "
          :model-value="interaction.transition.easing"
          :label="panels.easing"
          :options="easingOptions"
          :data-property="`interaction-${index}-easing`"
          @update:model-value="
            patchInteraction(index, {
              transition: {
                ...(interaction.transition as Extract<PrototypeTransition, { kind: 'fade' }>),
                easing: $event as PrototypeEasing
              }
            })
          "
        />

        <AppSelect
          v-if="interaction.transition?.kind === 'slide'"
          :model-value="interaction.transition.direction"
          :label="panels.slideDirection"
          :options="
            directionOptions.map((option) => ({
              value: option.value,
              label: panels[option.labelKey]
            }))
          "
          :data-property="`interaction-${index}-direction`"
          @update:model-value="
            patchInteraction(index, {
              transition: {
                ...(interaction.transition as Extract<PrototypeTransition, { kind: 'slide' }>),
                direction: $event as 'left' | 'right' | 'up' | 'down'
              }
            })
          "
        />
      </div>
    </div>

    <div class="mt-2 mb-1 flex items-center justify-between">
      <span class="text-[11px] text-muted">{{ panels.prototypeStates }}</span>
      <IconButton :label="panels.addState" data-property="add-state" @click="addState">
        <icon-lucide-plus class="size-3.5" />
      </IconButton>
    </div>

    <div v-if="stateModel" class="flex flex-col gap-1.5">
      <div
        v-for="(state, index) in stateModel.states"
        :key="state.name"
        class="flex flex-col gap-1.5 rounded border border-border p-1.5"
        data-property="prototype-state"
      >
        <div class="flex items-center gap-1">
          <AppInput
            v-model="stateNames[state.name]"
            size="sm"
            tone="panel"
            :aria-label="panels.stateName"
            :data-property="`state-${index}-name`"
            @change="commitStateName(index, state.name)"
            @enter="blurInput"
          />
          <IconButton :label="panels.removeState" @click="removeState(index)">
            <icon-lucide-trash-2 class="size-3.5" />
          </IconButton>
        </div>
        <div class="grid grid-cols-2 gap-1.5">
          <NumberField
            :label="panels.scale"
            :model-value="state.visual.scale ?? 1"
            :min="0"
            :max="4"
            :step="0.01"
            :data-property="`state-${index}-scale`"
            @commit="
              (value: number) => patchState(index, { visual: { ...state.visual, scale: value } })
            "
          />
          <NumberField
            :label="panels.opacity"
            :model-value="Math.round((state.visual.opacity ?? 1) * 100)"
            :min="0"
            :max="100"
            suffix="%"
            :data-property="`state-${index}-opacity`"
            @commit="
              (value: number) =>
                patchState(index, {
                  visual: { ...state.visual, opacity: Math.min(1, Math.max(0, value / 100)) }
                })
            "
          />
        </div>
        <AppSelect
          :model-value="state.transition?.kind ?? 'instant'"
          :label="panels.transition"
          :options="transitionKindOptions"
          :data-property="`state-${index}-transition`"
          @update:model-value="setStateTransition(index, $event as PrototypeTransition['kind'])"
        />

        <div
          v-if="state.transition?.kind === 'spring'"
          class="flex flex-col gap-1.5"
          :data-property="`state-${index}-spring`"
        >
          <AppSelect
            :model-value="state.transition.spring.mode"
            :label="panels.springMode"
            :options="springModeOptions"
            :data-property="`state-${index}-spring-mode`"
            @update:model-value="
              patchStateSpring(index, { mode: $event as PrototypeSpring['mode'] })
            "
          />
          <NumberField
            v-if="state.transition.spring.mode === 'time'"
            :label="panels.bounce"
            :model-value="state.transition.spring.bounce ?? SPRING_DEFAULTS.bounce"
            :min="0"
            :max="1"
            :step="0.05"
            :data-property="`state-${index}-spring-bounce`"
            @commit="(value: number) => patchStateSpring(index, { bounce: value })"
          />
          <template v-else>
            <div class="grid grid-cols-2 gap-1.5">
              <NumberField
                :label="panels.stiffness"
                :model-value="state.transition.spring.stiffness ?? SPRING_DEFAULTS.stiffness"
                :min="0"
                :max="10000"
                :step="10"
                :data-property="`state-${index}-spring-stiffness`"
                @commit="(value: number) => patchStateSpring(index, { stiffness: value })"
              />
              <NumberField
                :label="panels.damping"
                :model-value="state.transition.spring.damping ?? SPRING_DEFAULTS.damping"
                :min="0"
                :max="1000"
                :step="1"
                :data-property="`state-${index}-spring-damping`"
                @commit="(value: number) => patchStateSpring(index, { damping: value })"
              />
            </div>
            <NumberField
              :label="panels.mass"
              :model-value="state.transition.spring.mass ?? SPRING_DEFAULTS.mass"
              :min="0"
              :max="100"
              :step="0.1"
              :data-property="`state-${index}-spring-mass`"
              @commit="(value: number) => patchStateSpring(index, { mass: value })"
            />
          </template>
        </div>
        <div
          v-if="
            state.transition &&
            (state.transition.kind === 'fade' || state.transition.kind === 'slide')
          "
          class="grid grid-cols-2 gap-1.5"
        >
          <NumberField
            :label="panels.duration"
            :model-value="state.transition.durationMs"
            :min="0"
            :max="60000"
            :step="50"
            :data-property="`state-${index}-duration`"
            @commit="(value: number) => patchStateDuration(index, value)"
          />
          <AppSelect
            :model-value="state.transition.easing"
            :label="panels.easing"
            :options="easingOptions"
            :data-property="`state-${index}-easing`"
            @update:model-value="patchStateEasing(index, $event as PrototypeEasing)"
          />
        </div>
      </div>
    </div>
    <AppButton v-else variant="ghost" size="sm" class="w-full" @click="addState()">
      {{ panels.addState }}
    </AppButton>
  </PanelSection>
</template>
