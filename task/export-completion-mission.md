# EXPORT COMPLETION MISSION (user directive, verbatim source of truth)

The prototype-to-code export still explicitly excludes spring, drag, scroll, long press,
guards, SetVariant and overlays. Do not present "marked unsupported" as full completion.

- Inspect actual export architecture; implement each remaining behavior end-to-end
  wherever the target runtime can support it. Use generated JS when CSS alone is
  insufficient. Preserve semantic behavior; never silently downgrade unsupported
  interactions.

- For every capability verify complete flow:
  Prototype authored in Zenuxs → exported code generated → exported code executed →
  actual interaction performed → visible result observed → behavior compared with
  the Zenuxs prototype.

- Make dev/test environment reproducible, retain secure external credential config,
  ensure the 18-check gate count matches actual command output.

- Do not declare complete until every item implemented+verified, or a specific
  evidence-based technical limitation documented. Separate product functionality
  from test-environment dependencies.
