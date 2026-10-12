import type { SemanticSkill } from '#core/skills/types'

/** Design-system and accessibility intelligence (spec §23, §55). */
export const SYSTEM_SKILLS: readonly SemanticSkill[] = [
  {
    id: 'systems.design-system',
    name: 'design-system',
    category: 'systems',
    description: 'Reuse and extend existing design-system conventions: tokens, scales, variants.',
    version: '1.0.0',
    triggers: [
      'design system',
      'style guide',
      'typography scale',
      'spacing scale',
      'color tokens',
      'more premium',
      'look premium',
      'consistent style',
      'match the style'
    ],
    aliases: ['tokens', 'style', 'premium'],
    requires: [],
    defaults: { spacing: 'document scale first, else 4px grid', radius: 'document radius scale' },
    operations: [
      'find_variables',
      'list_variables',
      'create_variable',
      'bind_variable',
      'analyze_typography',
      'analyze_colors',
      'analyze_spacing',
      'combine_as_variants',
      'create_component'
    ],
    knowledge: [
      'Inspect before inventing (spec §23, §44): use analyze_typography / analyze_colors / analyze_spacing and find_variables to learn the document’s scales, then reuse them — prefer consistency over introducing unrelated new styles.',
      'Represent shared values as variables (create_variable + bind_variable) when the document already uses them; component reuse = create_component / combine_as_variants, not duplicated frames.',
      '“More premium” is a visual-language request: refine hierarchy, spacing rhythm, restrained palette, and type contrast — do not swap the whole design language (spec §44).',
      'When modifying an existing project, extend existing components and preserve hierarchy; never rebuild everything in your own favorite style.',
      'Project-specific preferences (e.g. “12px radius”) stay scoped to this document — do not globalize them (spec §34).'
    ].join('\n'),
    validation: [
      'New styles reuse existing tokens/scales where they exist.',
      'No duplicate components created for structures that already exist.'
    ],
    examples: [
      {
        prompt: 'Make this page look more premium.',
        intent: 'refine within existing design language: hierarchy, spacing, palette restraint'
      }
    ]
  },
  {
    id: 'systems.accessibility',
    name: 'accessibility',
    category: 'systems',
    description: 'Accessibility intelligence: contrast, focus, labels, reduced motion.',
    version: '1.0.0',
    triggers: [
      'accessible',
      'accessibility',
      'keyboard',
      'focus ring',
      'tab order',
      'screen reader',
      'reduced motion',
      'wcag',
      'high contrast'
    ],
    aliases: ['a11y', 'contrast', 'aria', 'focus visible'],
    requires: [],
    defaults: {
      textContrast: 'WCAG AA (4.5:1 body)',
      focus: 'visible focus ring on interactive elements'
    },
    operations: ['set_fill', 'set_text_properties', 'set_visible', 'describe'],
    knowledge: [
      'When creating interactions/motion consider (spec §55): keyboard reachability, visible focus, readable contrast (AA 4.5:1 body text), semantic/legible labels, and disabled states.',
      'Keyboard: every control reachable in a sensible tab order that follows visual order, a focus ring visible on each interactive element, no keyboard traps (every overlay/dialog has a dismissal path), and Enter/Space on the focused control doing the same thing as a click.',
      'Motion should respect reduced-motion preferences where the runtime supports it; where it does not, prefer short, subtle transitions over large movement (spec §45 — do not claim support that does not exist).',
      'Interactive states must be perceivable without color alone (add weight/shape changes for selected/error).',
      'Validate with describe/analyze after changes; fix contrast offenders rather than adding decorative layers.'
    ].join('\n'),
    validation: [
      'Body text contrast ≥ 4.5:1; state changes distinguishable without color alone.',
      'Interactive elements carry a visible focus treatment; overlays keep a keyboard/click dismissal path.'
    ],
    examples: [
      {
        prompt: 'Make this form accessible.',
        intent: 'contrast, labels, focus visibility, state distinguishability'
      },
      {
        prompt: 'Check the tab order and focus ring on this dialog.',
        intent: 'visual order → tab order, visible focus, no keyboard trap on the overlay'
      }
    ]
  },
  {
    id: 'systems.document-model',
    name: 'document-model',
    category: 'systems',
    description:
      'How the document is stored: node graph, prototype references, components, pluginData.',
    version: '1.0.0',
    triggers: ['document model', 'node types', 'plugin data', 'how nodes are stored'],
    aliases: ['node type', 'document structure'],
    requires: [],
    defaults: { hierarchy: 'flat id-keyed graph with parentId/childIds' },
    operations: ['describe', 'get_node', 'find_nodes', 'node_tree'],
    knowledge: [
      'The document is a flat graph: every node is keyed by id, hierarchy is expressed with parentId/childIds, and pages are CANVAS nodes holding top-level frames. Node types: FRAME, GROUP, SECTION, COMPONENT, COMPONENT_SET, INSTANCE, TEXT, RECTANGLE, ELLIPSE, LINE, STAR, POLYGON, VECTOR, BOOLEAN_OPERATION, CONNECTOR, SHAPE_WITH_TEXT.',
      'Prototype references — flow starts, navigate destinations, overlay targets, state targets — are stored as document data (pluginData) on nodes/root and point at node ids. They must resolve to nodes that exist; validate_prototype reports the ones that do not.',
      'Components: an INSTANCE maps each of its children back to the component child (componentId); per-instance overrides are separate from the component definition, and variants are members of a COMPONENT_SET combined with combine_as_variants.',
      'pluginData is document data that round-trips with the file. Selection, viewport zoom, active tool, hover, and undo history are runtime/editor state — never write them into the document.'
    ].join('\n'),
    validation: [
      'Every id a prototype or component reference points at exists in the graph.',
      'Only persisted document data is written; runtime/editor state stays out of the file.'
    ],
    examples: [
      {
        prompt: 'What node types can a flow destination point to?',
        intent: 'document model: destinations are node ids on real screens (FRAME/COMPONENT)'
      }
    ]
  }
]
