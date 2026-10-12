import type { ToolDef } from '#core/tools/schema'

import { addKeyframe, createAnimation, createAnimationGroup } from './prototype/animations'
import { connectScreens, createPrototypeFlow, listFlows, setActiveFlow } from './prototype/flows'
import {
  createInteraction,
  setInteractionAction,
  setInteractionTransition,
  setInteractionTrigger
} from './prototype/interactions'
import { previewPrototype } from './prototype/preview'
import { createBottomSheet, createOverlayBehavior } from './prototype/sheet'
import { applyState, createState, setStateVisual } from './prototype/states'
import { validatePrototype } from './prototype/validate'

/**
 * Semantic prototype/interaction/state/motion tools (spec §16).
 *
 * Flat param surface (ParamDef has no nested objects) mapped onto the same
 * pluginData document mutations the inspector uses, so every AI edit lands in
 * the undoable, serializable document — never in hidden side state. Each tool
 * validates its inputs against referenced targets before writing (spec §17).
 */

export {
  addKeyframe,
  applyState,
  connectScreens,
  createAnimation,
  createAnimationGroup,
  createBottomSheet,
  createInteraction,
  createOverlayBehavior,
  createPrototypeFlow,
  createState,
  listFlows,
  previewPrototype,
  setActiveFlow,
  setStateVisual,
  setInteractionAction,
  setInteractionTransition,
  setInteractionTrigger,
  validatePrototype
}

export const PROTOTYPE_TOOLS: ToolDef[] = [
  createPrototypeFlow,
  listFlows,
  setActiveFlow,
  createInteraction,
  setInteractionTrigger,
  setInteractionAction,
  setInteractionTransition,
  createState,
  setStateVisual,
  applyState,
  createAnimation,
  addKeyframe,
  createAnimationGroup,
  connectScreens,
  createBottomSheet,
  createOverlayBehavior,
  previewPrototype,
  validatePrototype
]
