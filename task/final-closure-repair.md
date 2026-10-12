# ZENUXS DESIGN — FINAL CLOSURE REPAIR + REAL UI VERIFICATION

This is the FINAL closure pass.

The previous agent reported:

```text
PRODUCTION READY
```

with the major audit findings marked PASS, including prototype runtime, AI routing, persistence, E2E, and real-AI QA. 

However, before accepting that status, you must independently close the remaining limitations and perform a **REAL HUMAN-STYLE UI verification of the prototype and motion experience**.

There is a known user-observed concern:

```text
AI creates prototype
→ normal workspace still shows normal design
→ user clicks the Play/Present button in the top-right navigation
→ prototype runtime should open
→ user should be able to interact with it like a real mobile prototype
→ click / scroll / gesture / navigation / overlay / state / animation should work
```

The user previously observed that clicking the prototype/play button produced no visible result.

Therefore:

**DO NOT trust the previous report's prototype PASS status without reproducing the entire flow yourself.**

---

# 1. CORE RULE — DO NOT FAKE VERIFICATION

The single most important rule:

```text
CODE EXISTS ≠ FEATURE WORKS

TEST EXISTS ≠ FEATURE WORKS

UNIT TEST PASSES ≠ FEATURE WORKS

E2E MOCK PASSES ≠ FEATURE WORKS

AI REPORT SAYS PASS ≠ FEATURE WORKS
```

A feature is PASS only when the actual application is launched and the real user-facing path works.

For UI/prototype functionality, you must:

```text
launch real app
→ open/create real design
→ use real editor UI
→ invoke real Play/Present button
→ observe actual UI state change
→ interact with actual prototype
→ observe actual transitions/animations
→ inspect console/network/errors
→ repeat after reload
```

Do not replace this with source-code inspection.

---

# 2. FIRST — SAVE THIS MISSION

Before editing anything:

Save this entire mission into the project's persistent task/progress structure.

For example:

```text
task/final-closure-repair.md
task/progress/final-closure-repair-progress.md
```

Use the project's existing structure when one already exists.

The mission file becomes the source of truth.

Continuously record:

```text
current phase
what was inspected
what was discovered
root cause
what changed
tests
manual UI result
remaining blockers
next phase
```

Do not rely on chat memory.

---

# 3. WORK IN PHASES

This is a large task.

Do not execute everything as one uncontrolled operation.

Divide it into phases based on the real architecture.

Use a structure similar to:

```text
Phase 0 — Baseline verification
Phase 1 — Prototype UI / Play entry-point investigation
Phase 2 — .pen round-trip closure
Phase 3 — Prototype → code export closure
Phase 4 — Environment/toolchain closure
Phase 5 — Real prototype interaction QA
Phase 6 — Real motion QA
Phase 7 — AI → prototype → Present QA
Phase 8 — Persistence / undo / reopen QA
Phase 9 — Full regression
Phase 10 — Final audit + report correction
```

You may change the phase structure when source evidence shows a better dependency order.

---

# 4. MOST IMPORTANT NEW GATE — REAL PROTOTYPE UI VERIFICATION

## TARGET

The product must clearly separate:

```text
EDITOR WORKSPACE
        ↓
normal design editing
        ↓
PLAY / PRESENT
        ↓
PROTOTYPE RUNTIME
        ↓
real interaction
```

The workspace is NOT expected to continuously behave like the prototype.

That is correct.

The important requirement is:

```text
Click Play/Present
→ actual prototype runtime opens
→ prototype is visible
→ interaction works
→ motion works
```

---

# 5. TRACE THE REAL PLAY/PRESENT FLOW

Before changing code, inspect the complete path from the UI button to the runtime.

Trace:

```text
Top-right Play/Present button
        ↓
click handler
        ↓
prototype launch command
        ↓
active document/page/flow selection
        ↓
prototype runtime creation
        ↓
render target / overlay / window / preview surface
        ↓
runtime mount
        ↓
initial screen
        ↓
interaction handling
```

Identify the exact implementation of every step.

Do not assume.

---

# 6. REPRODUCE THE USER-OBSERVED BUG

Create or open a document containing a minimal prototype:

```text
Screen A
    ↓ click
Screen B
```

Then perform this exact real UI sequence:

```text
open Zenuxs
→ load document
→ verify normal design workspace
→ click top-right Play/Present button
```

Observe the actual application.

Expected:

```text
prototype runtime becomes visible
```

Failure examples:

```text
nothing happens
button closes/open nothing
console error
blank screen
wrong page
runtime mounted but invisible
runtime immediately closes
prototype opens behind another surface
prototype opens with no rendered content
```

Any of these is FAIL.

Do not mark PASS because the function returns successfully.

---

# 7. DEBUG THE ACTUAL FAILURE

If Play/Present does not work:

Trace the failure from browser/UI to runtime.

Inspect:

```text
button registration
event handler
active document
active page
active flow
prototype lookup
runtime initialization
render mount target
CSS/layout
z-index
visibility
portal/overlay
canvas/container dimensions
JavaScript exceptions
network requests
runtime state
```

Determine the real root cause.

Do not add arbitrary:

```text
setTimeout()
display:block
z-index:99999
force re-render
```

unless evidence shows that this is actually the architectural cause.

---

# 8. VISUAL PROOF IS REQUIRED

For the prototype launch test, verify all of these visually:

```text
prototype surface exists
initial screen renders
screen is not blank
content is visible
viewport is usable
controls are clickable
runtime is on top
editor is not incorrectly blocking it
```

A console message saying:

```text
Prototype started
```

is NOT sufficient evidence.

---

# 9. REAL INTERACTION TEST

Once the prototype opens, interact with it as an actual user.

Test:

```text
tap
click
scroll
drag
long press
navigation
back
overlay
state change
variant change
```

Only test behaviors that the created prototype actually defines.

Do not manufacture unsupported behavior just to produce a pass.

For each interaction:

```text
user action
→ runtime event
→ semantic action
→ document/prototype state change
→ visible result
```

must be observed.

---

# 10. MOBILE-LIKE INTERACTION TEST

The user specifically expects to use the prototype in a mobile-like way.

Therefore test:

```text
tap target
scroll page
drag drawer
long press
navigate between screens
open overlay
close overlay
change state
```

Check:

```text
gesture starts correctly
gesture does not get stuck
interaction target is correct
visual state updates
navigation occurs
animation begins
animation completes
```

Also test the same prototype repeatedly.

---

# 11. MOTION IS A SEPARATE AUTHORING CONCEPT

Do NOT misunderstand the requirement.

There are two separate concepts:

## Prototype

Defines:

```text
what happens when user interacts
```

Example:

```text
tap button
→ navigate to another screen
```

## Motion

Defines:

```text
how the visual change happens
```

Example:

```text
screen transition
→ slide/spring/fade
```

Therefore:

```text
AI: "Create a prototype"
```

does not necessarily mean “make every part animated.”

And:

```text
AI: "Create motion"
```

means authoring animation behavior explicitly.

However, when a prototype contains motion, that motion must visibly execute inside the prototype runtime.

---

# 12. REAL MOTION VERIFICATION

Create a minimal prototype with:

```text
Screen A
→ Screen B
```

and explicitly add:

```text
fade
slide
spring
```

where supported.

Launch through the real Play/Present button.

Observe:

```text
Screen A visible
→ user action
→ transition begins
→ visual movement occurs
→ transition settles
→ Screen B visible
```

Failure:

```text
Screen instantly swaps
no visual transition
animation exists only in JSON
runtime ticks but visual state never changes
animation starts and gets stuck
```

These are FAIL.

---

# 13. VERIFY SPRING VISUALLY

Do not rely solely on runtime unit tests.

Create a noticeable spring.

Use visibly distinguishable values.

Then launch Present mode and watch the actual transition.

Verify:

```text
start
→ movement
→ spring behavior
→ settling
→ final stable position
```

Also change spring parameters and confirm the visible result changes.

If changing:

```text
stiffness
damping
mass
bounce
```

does not affect the real runtime, the feature is not complete.

---

# 14. AI → PROTOTYPE → PLAY TEST

This is a mandatory end-to-end test.

Do NOT create the prototype manually first.

Test the actual AI workflow:

```text
User:
"Create a mobile login prototype with a login button that navigates to a dashboard."

AI
↓
real semantic routing
↓
real tool execution
↓
real prototype mutation
↓
workspace shows normal design
↓
user clicks Play/Present
↓
real prototype opens
↓
tap Login
↓
dashboard appears
```

Then test:

```text
User:
"Add a slide transition to the login-to-dashboard navigation."

AI
↓
real motion mutation
↓
Play/Present
↓
tap Login
↓
actual slide transition visibly occurs
```

This exact type of flow is the strongest proof that the system works.

---

# 15. AI CONTEXT TEST

Repeat with:

```text
User:
"Create a dashboard with a card."

Then:
"Make the card interactive."

Then:
"Animate it."

Then:
"Change the mobile behavior."
```

Each turn must modify the actual existing document.

Do not accept a response that merely describes what should happen.

---

# 16. VERIFY PLAY AFTER REFRESH

This is mandatory.

Test:

```text
AI creates prototype
→ save
→ refresh/restart
→ reopen document
→ click Play/Present
→ prototype opens
→ interactions work
→ motion works
```

This catches the class of bugs where prototype metadata exists only in memory.

---

# 17. VERIFY PLAY WITH MULTIPLE FLOWS

Create:

```text
Flow A
Flow B
```

Verify active flow selection.

Then:

```text
select Flow A
→ Present
→ correct flow runs

select Flow B
→ Present
→ correct flow runs
```

No stale flow data.

No silent fallback to `flows[0]`.

---

# 18. FIX `.PEN` COMPLETELY

Previous report claimed `.pen` round-trip was closed through pluginData passthrough.

Do NOT blindly trust that.

Verify:

```text
create prototype
→ save .pen
→ close
→ reopen
→ Play/Present
→ interaction works
→ motion works
```

The acceptance criterion is NOT:

```text
metadata exists
```

It is:

```text
saved prototype remains executable
```

If the current implementation still loses anything needed for runtime execution, fix it.

---

# 19. FIX PROTOTYPE → CODE EXPORT

Previous report marked this PASS only for a supported/scoped subset.

That is acceptable only if the implementation is genuinely usable.

Verify:

```text
prototype
→ compatibility analysis
→ export
→ generated code
→ run generated code
→ behavior matches supported Zenuxs prototype
```

For unsupported capabilities:

```text
spring
drag
scroll
longPress
guard
setVariant
overlay
```

do NOT fake equivalent output.

The exported result must explicitly report unsupported behavior.

---

# 20. ENVIRONMENT DEPENDENCIES MUST BE ELIMINATED OR DOCUMENTED CORRECTLY

Previous report still listed:

```text
Git LFS
gitleaks
official Node
inotify/polling
OPENROUTER_API_KEY
local relay
```

as environment limitations.

Now determine for each one:

```text
Is it required for production?
Is it required only for development?
Is it required only for one test?
Can the project bootstrap it automatically?
Can CI provide it?
Can the test be made deterministic without it?
```

Do not silently depend on a machine-local setup.

Where appropriate, improve repository setup / CI / tooling so a fresh development environment can reproduce the required checks.

For genuine secrets/credentials, document the requirement rather than embedding them.

---

# 21. REMOVE MACHINE-SPECIFIC POLLING DEPENDENCY WHERE POSSIBLE

The previous E2E run required polling because another IDE consumed the host's inotify watchers.

Do not “fix” that by killing unrelated applications.

Instead determine whether:

```text
CHOKIDAR_USEPOLLING=1
```

is only a local workaround or can/should become part of a controlled test configuration.

Do not claim the project itself requires polling unless the source proves that.

---

# 22. FIX THE TEST COUNT INCONSISTENCY

The report claims:

```text
bun run check = 15/15
```

but lists more individual checks than that.

Resolve this.

Determine the exact meaning of:

```text
15 gates
```

and the exact number of underlying checks.

Then update the final report so the numbers are internally consistent.

Do not change the number artificially.

Use the actual command output as evidence.

---

# 23. FULL AUTOMATED TESTING

Run:

```text
engine/unit
integration
E2E
prototype
AI skills
persistence
CLI
export
pen
tooling
lint
architecture
security
duplicates
```

Do NOT hide tests by modifying configuration merely to obtain green output.

If a test requires credentials:

```text
state that
```

Do not fabricate a credential-backed result.

---

# 24. FAILURE TRIAGE RULE

Any failure must be classified:

```text
REAL PRODUCT BUG
TEST BUG
ENVIRONMENT ISSUE
RESOURCE/LOAD FLAKE
EXPECTED LIMITATION
EXTERNAL DEPENDENCY
```

Then prove the classification.

For example:

```text
fails once under load
→ isolate
→ rerun
→ baseline comparison
```

is acceptable.

But:

```text
fails
→ mark pre-existing
```

without reproducing baseline is not acceptable.

---

# 25. HUMAN-STYLE BROWSER QA

Do not only run test scripts.

Perform a genuine manual interaction session.

Use the UI the way an actual designer would:

```text
open app
create/open document
select object
ask AI to modify it
observe workspace
click Play/Present
interact with prototype
exit prototype
edit again
play again
save
reload
play again
```

While doing this inspect:

```text
console
network
runtime errors
visual state
button state
loading state
overlay state
```

---

# 26. CRITICAL PROTOTYPE PASS CONDITION

This exact chain MUST pass:

```text
AI:
"Create a simple mobile prototype:
screen 1 → screen 2"

↓
workspace visibly contains the created design

↓
top-right Play/Present is clicked

↓
prototype runtime visibly opens

↓
screen 1 renders

↓
user taps the intended control

↓
screen 2 appears

↓
if transition/motion was authored,
the transition visibly plays

↓
user can interact naturally

↓
exit prototype

↓
return to normal workspace

↓
make another AI modification

↓
Play again

↓
new behavior is present
```

If ANY part fails, the prototype system is NOT complete.

---

# 27. DO NOT CONFUSE EDITOR VIEW WITH PROTOTYPE VIEW

This distinction must remain explicit throughout the implementation:

```text
EDITOR
────────────────
design authoring
selection
layers
properties
AI editing

PRESENT / PLAY
────────────────
prototype runtime
navigation
interaction
state
overlay
motion
```

Do not redesign the normal workspace just to demonstrate prototype behavior.

Do not embed the runtime into the editor unless the architecture explicitly requires it.

Fix the Play/Present entry point instead.

---

# 28. REAL VISUAL VERIFICATION OF MOTION

For every supported animation type, produce at least one real runtime observation:

```text
fade
slide
spring
keyframe
parallel
sequence
```

Where applicable.

The test must establish:

```text
before frame
→ animation visibly runs
→ after frame
```

Do not mark it PASS merely because an animation object exists in the document.

---

# 29. VERIFY INTERACTION + MOTION COMBINATION

Test cases like:

```text
tap button
→ overlay opens
→ fade animation

drag drawer
→ drawer follows gesture
→ release
→ state settles

tap
→ navigate
→ spring transition
```

The point is to verify the interaction system and animation system actually connect.

---

# 30. FINAL ROOT-CAUSE SWEEP

After fixing all issues, search for:

```text
dead UI handlers
dead buttons
prototype runtime never mounted
runtime mounted but hidden
events emitted but never consumed
animations authored but never rendered
prototype metadata written but never read
read paths without write paths
write paths without read paths
mock-only success paths
test-only branches
fake export output
silent unsupported fallbacks
```

---

# 31. FINAL ACCEPTANCE MATRIX

Create a matrix:

| Capability | Code | Unit | E2E | REAL UI | REAL INTERACTION | Persisted | Status |
|---|---:|---:|---:|---:|---:|---:|---|
| Create prototype | | | | | | | |
| Play/Present | | | | | | | |
| Click | | | | | | | |
| Scroll | | | | | | | |
| Drag | | | | | | | |
| Long press | | | | | | | |
| Navigation | | | | | | | |
| Overlay | | | | | | | |
| State | | | | | | | |
| Variant | | | | | | | |
| Fade | | | | | | | |
| Slide | | | | | | | |
| Spring | | | | | | | |
| Keyframe | | | | | | | |
| Sequence | | | | | | | |
| Parallel | | | | | | | |
| AI-created prototype | | | | | | | |
| AI-created motion | | | | | | | |
| Save/reopen | | | | | | | |
| Undo/redo | | | | | | | |
| `.pen` round trip | | | | | | | |
| Code export | | | | | | | |

A capability cannot receive an overall PASS if the **REAL UI** column is required and remains unverified.

---

# 32. FINAL REPORT MUST DISTINGUISH THESE

Never merge these concepts:

```text
IMPLEMENTED
VERIFIED BY AUTOMATED TEST
VERIFIED BY REAL UI
VERIFIED BY REAL USER INTERACTION
PERSISTED
SUPPORTED
UNSUPPORTED
ENVIRONMENT BLOCKED
```

Example:

```text
Spring runtime:
IMPLEMENTED ✅
Unit tests ✅
E2E ✅
Real UI ✅
Real interaction ✅
Persistence ✅
```

That is strong evidence.

But:

```text
Implemented ✅
Unit tests ✅
Real UI ❌
```

must NOT be reported as fully verified.

---

# 33. FINAL STATUS RULE

Only use:

```text
PRODUCTION READY
```

when:

```text
all critical features work
+
real Play/Present path works
+
prototype actually opens
+
real interactions work
+
motion visibly works
+
AI-created prototype works
+
save/reopen preserves executable behavior
+
automation gates are clean
+
remaining limitations are intentional and clearly scoped
```

Otherwise use:

```text
PARTIALLY COMPLETE
```

or:

```text
BLOCKED
```

---

# 34. FINAL REPORT

The final report must contain:

## 1. What was previously wrong

## 2. What you independently reproduced

## 3. Root causes discovered

## 4. Fixes implemented

## 5. Real UI tests performed

## 6. Exact prototype Play/Present result

## 7. Exact motion runtime result

## 8. AI → prototype → Play result

## 9. `.pen` result

## 10. Code export result

## 11. Environment/toolchain result

## 12. Exact automated test numbers

## 13. Exact remaining limitations

## 14. Final status

Do not write a generic success summary.

---

# 35. ABSOLUTE FINAL RULE

The final question you must be able to answer with evidence is:

> "Could a real designer open Zenuxs right now, ask the AI to create a prototype and motion, see the normal design in the workspace, click the Play/Present button, and actually use the resulting prototype with real clicks/scroll/gestures while seeing the authored motion?"

If the answer is not demonstrably YES, the mission is not complete.

Do not hide this behind unit tests.

Do not hide this behind E2E mocks.

Do not hide this behind source-code inspection.

Do not mark it PASS because the runtime object exists.

**Open the actual application.  
Click the actual button.  
Watch the actual prototype open.  
Interact with it.  
Watch the actual motion play.  
Then verify the implementation behind what you observed.**