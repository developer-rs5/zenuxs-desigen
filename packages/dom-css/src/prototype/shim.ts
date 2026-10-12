import type { PrototypeCondition, PrototypeVarValue } from '@open-pencil/scene-graph'

import { LONG_PRESS_THRESHOLD_MS, type PrototypeShimTriggerName } from './support'

/**
 * The JS companion emitted with a prototype HTML bundle: everything pure CSS
 * cannot drive. One document-level listener per trigger type resolves the
 * first ancestor matching any op's selector (preview `findTrigger` walk-up
 * first-match), so nested triggers fire exactly once and events resolve at
 * dispatch time — ops created for variant-swapped content work automatically.
 *
 * Screen entry mirrors preview (`enterScreen`): initial states are re-seeded
 * and `load`/`afterDelay` ops for the entered subtree run on every entry,
 * with the same cyclic load → navigate depth cap. Pending delay timers are
 * cleared on navigate (preview `timers = []`); overlay closes do NOT clear
 * them, matching preview.
 */

export interface PrototypeShimOpBase {
  /** Node selector the op acts on. */
  sel: string
  /** Top-level container id owning this op (screen or overlay); null when no screen structure exists. */
  screen: string | null
  trigger: PrototypeShimTriggerName
  /** `afterDelay` wait in ms (ignored for other triggers). */
  delay: number
  /** Guard conditions evaluated at fire time against the owner node's vars (preview parity). */
  guard?: readonly PrototypeCondition[]
  /** Initial prototype vars of the owner node, seeded lazily on first access. */
  seedVars?: Readonly<Record<string, PrototypeVarValue>>
  /** Overlay frame owning this op's subtree (delay ops re-run on open). */
  overlayOf?: string
}

/** Toggle `data-op-state` on the target element (setState). */
export interface PrototypeShimStateOp extends PrototypeShimOpBase {
  kind: 'state'
  state: string
  /** Variable writes applied atomically with the state change. */
  vars?: Readonly<Record<string, PrototypeVarValue>>
}

/** Swap the active screen class and re-seed the destination's states. */
export interface PrototypeShimNavigateOp extends PrototypeShimOpBase {
  kind: 'navigate'
  /** Selector for the destination screen element. */
  destSel: string
  /** Destination screen id (entry point for its load/delay ops). */
  dest: string
  /** Keep the outgoing screen visible while its transition runs. */
  leaveVisible: boolean
  /** `[selector, initialState]` pairs re-applied on entry (preview parity). */
  resets: ReadonlyArray<readonly [string, string]>
}

/** Restart a class-bound `@keyframes` playback on the target element. */
export interface PrototypeShimPlayOp extends PrototypeShimOpBase {
  kind: 'play'
  playClass: string
}

/** Reveal an overlay frame above the active screen and raise the backdrop. */
export interface PrototypeShimOverlayOpenOp extends PrototypeShimOpBase {
  kind: 'overlay-open'
  /** Overlay frame id (owner of its subtree's delay ops). */
  overlay: string
  /** Selector for the overlay element (hoisted to the stage). */
  overlaySel: string
  /** Dim backdrop opacity for this open (preview `backdropOpacity ?? 0.3`). */
  backdrop: number
  /** Placement relative to the trigger screen's origin (px). */
  ox: number
  oy: number
  /** `opacity T, transform T, visibility T` timing, or null for instant. */
  timing: string | null
  /** Slide start offset (px): overlay begins fully below the screen bottom. */
  slideStart?: number
}

/** Hide the topmost open overlay (preview pops `overlays.at(-1)`). */
export interface PrototypeShimOverlayCloseOp extends PrototypeShimOpBase {
  kind: 'overlay-close'
  /** Authored close timing; `null` = instant close, absent = reuse the open timing. */
  timing?: string | null
  slideStart?: number
}

/** Swap the instance's children for a variant template and update its root style. */
export interface PrototypeShimVariantOp extends PrototypeShimOpBase {
  kind: 'variant'
  /** Target component id (template key). */
  variant: string
  /** The instance's current component id (no-op guard, preview parity). */
  base: string
}

export type PrototypeShimOp =
  | PrototypeShimStateOp
  | PrototypeShimNavigateOp
  | PrototypeShimPlayOp
  | PrototypeShimOverlayOpenOp
  | PrototypeShimOverlayCloseOp
  | PrototypeShimVariantOp

/** Cyclic OnLoad → Navigate guard, matching preview's `enterDepth` cap. */
const ENTER_DEPTH_LIMIT = 8

/**
 * Source for the embedded `<script>`: JSON-encoded ops plus the delegated
 * runtime. Returns an empty string when there is nothing JS-dependent to
 * drive, so the bundle stays script-free for CSS-only prototypes.
 */
export function prototypeShim(
  ops: readonly PrototypeShimOp[],
  initialScreen: string | null
): string {
  if (ops.length === 0) return ''
  return [
    '(function(){',
    `var ops=${JSON.stringify(ops)};`,
    `var initial=${JSON.stringify(initialScreen)};`,
    `var lpMs=${LONG_PRESS_THRESHOLD_MS};`,
    'var started=false,depth=0;',
    'var vars={},stack=[],dragEls=[],timers=[];',
    'var backdrop=null,pressed=null,drag=null,suppressClick=false,lpTimer=null,lpHit=null;',
    'function q(sel){return document.querySelector(sel)}',
    'function qa(sel){return document.querySelectorAll(sel)}',
    'function varsFor(op){var k=op.sel;if(!(k in vars)){vars[k]={};if(op.seedVars){for(var p in op.seedVars)vars[k][p]=op.seedVars[p]}}return vars[k]}',
    'function guardOk(op){',
    'if(!op.guard)return true;var vs=varsFor(op);',
    'for(var i=0;i<op.guard.length;i++){var c=op.guard[i],cur=vs[c.variable];',
    'if(cur===undefined)return false;',
    "if(c.op==='eq'||c.op==='neq'){var eq=typeof cur===typeof c.value?cur===c.value:String(cur)===String(c.value);if((c.op==='eq')!==eq)return false;continue}",
    "if(typeof cur!=='number'||typeof c.value!=='number')return false;",
    'if(!isFinite(cur)||!isFinite(c.value))return false;',
    "if(c.op==='gt'&&!(cur>c.value))return false;",
    "if(c.op==='lt'&&!(cur<c.value))return false;",
    "if(c.op==='gte'&&!(cur>=c.value))return false;",
    "if(c.op==='lte'&&!(cur<=c.value))return false}",
    'return true}',
    // Walk target → root; first element owning any op for this trigger wins
    // (preview findTrigger: first node with a matching trigger, walk up).
    'function walk(target,trigger){',
    'for(var el=target;el&&el.nodeType===1;el=el.parentElement){',
    'for(var i=0;i<ops.length;i++){var op=ops[i];',
    'if(op.trigger!==trigger)continue;',
    'if(el.matches&&el.matches(op.sel))return{op:op,el:el}}}',
    'return null}',
    'function containerOf(el,op){',
    "var c=el.closest?el.closest('[data-op-screen],[data-op-overlay]'):null;",
    'if(!c)return false;',
    "var id=c.getAttribute('data-op-screen')||c.getAttribute('data-op-overlay');",
    // Overlay-owned elements match via overlayOf (the hoist moves them out
    // of their host screen's DOM); everything else matches its screen.
    'return id===op.screen||(op.overlayOf!==undefined&&id===op.overlayOf)}',
    'function applyIn(op){',
    'var els=qa(op.sel);',
    'for(var j=0;j<els.length;j++){',
    'if(op.screen!==null&&!containerOf(els[j],op))continue;',
    'apply(op,els[j])}}',
    'function later(fn,ms){var id=setTimeout(fn,ms);timers.push(id);return id}',
    'function apply(op,el){',
    'if(!guardOk(op))return;',
    'var target=el||q(op.sel);if(!target)return;',
    "if(op.kind==='state'){",
    'if(op.vars){var vs=varsFor(op);for(var k in op.vars)vs[k]=op.vars[k]}',
    "target.setAttribute('data-op-state',op.state);",
    "target.style.translate=''}",
    "else if(op.kind==='play'){target.classList.remove(op.playClass);target.offsetWidth;target.classList.add(op.playClass)}",
    "else if(op.kind==='navigate'){navigate(op)}",
    "else if(op.kind==='overlay-open'){openOverlay(op)}",
    "else if(op.kind==='overlay-close'){closeOverlay(op)}",
    "else if(op.kind==='variant'){swapVariant(op,target)}}",
    'function ensureBackdrop(){',
    'if(backdrop)return backdrop;',
    "backdrop=document.createElement('div');backdrop.className='op-backdrop';",
    "var stage=q('.op-stage')||document.body;stage.appendChild(backdrop);",
    'return backdrop}',
    'function sizeBackdrop(){',
    'var bd=ensureBackdrop();',
    "var s=q('.op-screen.is-active')||q('.op-stage')||document.body;",
    "bd.style.left=(s.offsetLeft||0)+'px';bd.style.top=(s.offsetTop||0)+'px';",
    "bd.style.width=(s.offsetWidth||0)+'px';bd.style.height=(s.offsetHeight||0)+'px';",
    "bd.style.visibility='visible';return bd}",
    'function openOverlay(op){',
    'var ov=q(op.overlaySel);if(!ov)return;',
    "ov.style.left=op.ox+'px';ov.style.top=op.oy+'px';",
    "ov.style.transition=op.timing?('opacity '+op.timing+', transform '+op.timing+', visibility '+op.timing):'none';",
    "if(op.slideStart!==undefined)ov.style.transform='translateY('+op.slideStart+'px)';",
    'var bd=sizeBackdrop();',
    "bd.style.transition=op.timing?('opacity '+op.timing+', visibility '+op.timing):'none';",
    'bd.style.opacity=String(op.backdrop);',
    'void ov.offsetWidth;',
    "ov.classList.add('is-open');",
    "ov.style.transform='translateY(0)';",
    'stack.push({sel:op.overlaySel,timing:op.timing,backdrop:op.backdrop,slide:op.slideStart});',
    'for(var i=0;i<ops.length;i++){var o=ops[i];',
    // Delay ops inside the overlay subtree re-run on open; overlayOf tags
    // nested overlays whose `screen` field points at the host screen.
    "if(o.trigger!=='delay'||o.overlayOf!==op.overlay)continue;",
    '(function(o){later(function(){applyIn(o)},o.delay)})(o)}}',
    'function closeOverlay(op){',
    'var top=stack.pop();if(!top)return;',
    'var ov=q(top.sel);if(!ov)return;',
    // An authored close timing (string) wins; an explicit null means instant
    // close; an absent field reuses the open timing (preview: entry.transition).
    'var timing=op.timing!==undefined?(op.timing===null?null:op.timing):top.timing;',
    "ov.style.transition=timing?('opacity '+timing+', transform '+timing+', visibility '+timing):'none';",
    // A slide-opened overlay slides back out on close while it fades
    // (preview closeProgress drives translateY back to startOffset).
    "if(top.slide!==undefined&&timing)ov.style.transform='translateY('+top.slide+'px)';",
    "ov.classList.remove('is-open');",
    'if(backdrop){',
    "backdrop.style.transition=timing?('opacity '+timing+', visibility '+timing):'none';",
    'if(stack.length>0){backdrop.style.opacity=String(stack[stack.length-1].backdrop)}',
    "else{backdrop.style.opacity='0'}}}",
    'function swapVariant(op,target){',
    "var cur=target.getAttribute('data-op-variant')||op.base;",
    'if(op.variant===cur)return;',
    "var tpl=target.querySelector('template[data-op-variant-for=\"'+op.variant+'\"]');",
    'if(!tpl)return;',
    'for(var i=target.children.length-1;i>=0;i--){',
    "if(target.children[i].tagName!=='TEMPLATE')target.removeChild(target.children[i])}",
    "target.setAttribute('data-op-variant',op.variant);",
    'target.appendChild(tpl.content.cloneNode(true))}',
    'function navigate(op){',
    // Preview clears timers, vars, drag visuals, overlays, and states on navigate.
    'for(var t=0;t<timers.length;t++)clearTimeout(timers[t]);timers=[];',
    'vars={};',
    "for(var d=0;d<dragEls.length;d++)dragEls[d].style.translate='';dragEls=[];",
    "while(stack.length){var e=stack.pop();var o=q(e.sel);if(o){o.style.transition='none';o.classList.remove('is-open');o.style.transform=''}}",
    "if(backdrop){backdrop.style.transition='none';backdrop.style.opacity='0'}",
    "var current=document.querySelector('.op-screen.is-active');",
    "if(current){current.classList.remove('is-active');if(op.leaveVisible){current.classList.add('is-leaving')}}",
    'var next=q(op.destSel);',
    "if(next){next.classList.remove('is-leaving');next.classList.add('is-active')}",
    "for(var i=0;i<op.resets.length;i++){var node=q(op.resets[i][0]);if(node){node.setAttribute('data-op-state',op.resets[i][1]);node.style.translate=''}}",
    'enter(op.dest)}',
    'function enter(id){',
    'var initialEntry=!started;started=true;',
    `if(depth>=${ENTER_DEPTH_LIMIT})return;depth+=1;`,
    'try{',
    'for(var i=0;i<ops.length;i++){',
    'var op=ops[i];',
    "if(op.trigger!=='load'&&op.trigger!=='delay')continue;",
    'if(op.screen===null){if(!initialEntry)continue}else if(op.screen!==id)continue;',
    "if(op.trigger==='load'){applyIn(op);if(op.kind==='navigate')break}",
    '(function(o){later(function(){applyIn(o)},o.delay)})(op)}',
    '}finally{depth-=1}}',
    // --- delegated event wiring ---
    "document.addEventListener('click',function(e){",
    'if(suppressClick){suppressClick=false;return}',
    'var hit=walk(e.target,"click");if(hit)apply(hit.op,hit.el)});',
    "document.addEventListener('pointerdown',function(e){",
    'suppressClick=false;pressed=e.target;',
    "var p=walk(e.target,'press');if(p)apply(p.op,p.el);",
    "var d=walk(e.target,'drag');if(d){var base=parseTranslate(d.el.style.translate);drag={op:d.op,el:d.el,x0:e.clientX,y0:e.clientY,bx:base[0],by:base[1],moved:false};apply(d.op,d.el)}",
    "var l=walk(e.target,'longpress');if(l){lpHit=l;lpTimer=setTimeout(function(){lpTimer=null;if(lpHit){apply(lpHit.op,lpHit.el);lpHit=null}},lpMs)}});",
    'function parseTranslate(v){',
    'if(!v)return[0,0];',
    "var parts=v.split(' ');",
    'return[parseFloat(parts[0])||0,parseFloat(parts[1])||0]}',
    "document.addEventListener('pointermove',function(e){",
    'if(!drag)return;',
    'var dx=e.clientX-drag.x0,dy=e.clientY-drag.y0;',
    'if(dx===0&&dy===0)return;',
    'drag.moved=true;',
    // Preview accumulates: settled.translate += delta from THIS press origin.
    "drag.el.style.translate=(drag.bx+dx)+'px '+(drag.by+dy)+'px';",
    'if(dragEls.indexOf(drag.el)<0)dragEls.push(drag.el)});',
    'function endPointer(e){',
    'if(lpTimer!==null){clearTimeout(lpTimer);lpTimer=null;lpHit=null}',
    'if(drag){',
    // No movement: the offset from earlier drags stays (preview endDrag
    // early-returns on dx=dy=0 without touching settled translate).
    'if(drag.moved){suppressClick=true}',
    'drag=null}',
    'if(pressed){',
    "var r=walk(pressed,'release');if(r)apply(r.op,r.el);",
    'pressed=null}}',
    "document.addEventListener('pointerup',endPointer);",
    "document.addEventListener('pointercancel',endPointer);",
    // Leaving the document cancels a pending long-press (preview pointer leave).
    "document.addEventListener('pointerout',function(e){",
    'if(e.relatedTarget===null&&lpTimer!==null){clearTimeout(lpTimer);lpTimer=null;lpHit=null}});',
    "document.addEventListener('wheel',function(e){",
    'if(e.deltaY===0)return;',
    "var hit=walk(e.target,'scroll');if(hit){e.preventDefault();apply(hit.op,hit.el)}}",
    ',{passive:false});',
    "document.addEventListener('pointerover',function(e){",
    "var hit=walk(e.target,'enter');",
    'if(hit&&(!e.relatedTarget||!hit.el.contains(e.relatedTarget)))apply(hit.op,hit.el)});',
    "document.addEventListener('pointerout',function(e){",
    "var hit=walk(e.target,'leave');",
    'if(hit&&(!e.relatedTarget||!hit.el.contains(e.relatedTarget)))apply(hit.op,hit.el)});',
    'enter(initial)',
    '})();'
  ].join('')
}
