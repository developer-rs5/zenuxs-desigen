export const FULLSCREEN_VS = `attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`

export const PLATE_FS = `precision highp float;
uniform sampler2D uPlate;
uniform vec2 uPlateFit;
uniform vec2 uRes;
void main() {
    vec2 uv = (gl_FragCoord.xy / uRes - 0.5) * uPlateFit + 0.5;
    gl_FragColor = texture2D(uPlate, clamp(uv, 0.0, 1.0));
}`

export const GLASS_FS = `precision highp float;

uniform vec2 uRes;
uniform float uAspect;
uniform float uTanHalf;

uniform sampler2D uPlate;
uniform vec2 uPlateFit;
uniform float uHasPlate;
uniform sampler2D uEnv;
uniform sampler2D uSDF;

uniform mat3 uRot;
uniform mat3 uRotT;
uniform vec3 uCenter;
uniform float uScale;
uniform float uBoundR;

uniform float uShape;
uniform float uHalfDepth;
uniform float uBevel;
uniform float uTorusTube;
uniform vec2 uLogoHalf;
uniform float uSdfUnits;

uniform float uDisp;
uniform float uFrost;
uniform vec3 uTint;

const float PI = 3.14159265359;
const float CORE_REFRACT = 1.0000;
const float IOR = 1.5000;
const float THICKNESS = 2.0000;

float sdCross(vec2 p, vec2 b) {
    p = abs(p);
    p = (p.y > p.x) ? p.yx : p.xy;
    vec2 q = p - b;
    float k = max(q.y, q.x);
    vec2 w = (k > 0.0) ? q : vec2(b.y - p.x, -k);
    return sign(k) * length(max(w, 0.0));
}

vec2 r45(vec2 p) {
    const float c = 0.7071067811865476;
    return vec2((p.x + p.y) * c, (p.y - p.x) * c);
}

float sdLogo(vec2 p) {
    vec2 uv = p / (2.0 * uLogoHalf) + 0.5;
    uv.y = 1.0 - uv.y;
    vec2 e = abs(p) - uLogoHalf;
    float dBox = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0);
    float dTex = (0.5 - texture2D(uSDF, clamp(uv, 0.0, 1.0)).r) * 2.0 * uSdfUnits;
    return max(dTex, dBox);
}

float extrudeRound(float d2, float pz, float hd, float r) {
    vec2 q = vec2(d2 + r, abs(pz) - hd + r);
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

float map(vec3 p) {
    if (uShape < 0.5) {
        return extrudeRound(sdCross(r45(p.xy), vec2(1.3, 0.35)), p.z, uHalfDepth, uBevel);
    } else if (uShape < 1.5) {
        vec2 q = vec2(length(p.xy) - 0.8, p.z);
        return length(q) - uTorusTube;
    } else if (uShape < 2.5) {
        return length(p) - 1.2;
    }
    return extrudeRound(sdLogo(p.xy), p.z, uHalfDepth, uBevel);
}

vec3 mapNormal(vec3 p) {
    const float e = 0.0015;
    vec2 k = vec2(1.0, -1.0);
    return normalize(
        k.xyy * map(p + k.xyy * e) +
        k.yyx * map(p + k.yyx * e) +
        k.yxy * map(p + k.yxy * e) +
        k.xxx * map(p + k.xxx * e)
    );
}

vec4 plate(vec2 screenUv) {
    if (uHasPlate < 0.5) return vec4(0.0);
    vec2 uv = (screenUv - 0.5) * uPlateFit + 0.5;
    return texture2D(uPlate, clamp(uv, 0.0, 1.0));
}

float rand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 screenUv = gl_FragCoord.xy / uRes;
    vec2 ndc = screenUv * 2.0 - 1.0;

    vec3 D = normalize(vec3(ndc.x * uTanHalf * uAspect, ndc.y * uTanHalf, -1.0));
    vec3 rd = normalize(uRotT * D);
    vec3 ro = (uRotT * -uCenter) / uScale;

    float bb = dot(ro, rd);
    float cc = dot(ro, ro) - uBoundR * uBoundR;
    float hh = bb * bb - cc;
    if (hh < 0.0) discard;
    hh = sqrt(hh);
    float t = max(-bb - hh, 0.0);
    float tMax = -bb + hh;

    bool hit = false;
    for (int i = 0; i < 80; i++) {
        if (t > tMax) break;
        float d = map(ro + rd * t);
        if (d < 0.0009) { hit = true; break; }
        t += d * 0.9;
    }
    if (!hit) discard;

    vec3 pObj = ro + rd * t;
    vec3 nObj = mapNormal(pObj);

    vec3 vP = uCenter + uScale * (uRot * pObj);
    vec3 normal = normalize(uRot * nObj);
    vec3 viewDir = normalize(-vP);

    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 4.0);

    float coreFactor = pow(max(dot(normal, viewDir), 0.0), 2.0);
    vec2 lensOffset = (screenUv - 0.5) * (CORE_REFRACT * 0.15) * coreFactor;

    vec3 refractView = refract(-viewDir, normal, 1.0 / IOR);
    vec2 offset = refractView.xy * (THICKNESS * 0.1) - lensOffset;

    vec3 reflectDir = reflect(-viewDir, normal);
    vec2 equirectUv = vec2(
        atan(reflectDir.z, reflectDir.x) / (2.0 * PI) + 0.5,
        asin(clamp(reflectDir.y, -1.0, 1.0)) / PI + 0.5
    );
    vec3 reflection = texture2D(uEnv, equirectUv).rgb * 2.5;

    vec3 transmission = vec3(0.0);
    float bgAlpha = 0.0;

    vec2 uvR = screenUv + offset * (1.0 + uDisp);
    vec2 uvG = screenUv + offset;
    vec2 uvB = screenUv + offset * (1.0 - uDisp);

    if (uFrost > 0.001) {
        float rnd = rand(screenUv) * 6.2831853;
        const int SAMPLES = 24;
        const float GOLDEN_ANGLE = 2.39996323;
        float radius = 0.0;
        float radiusStep = 1.0 / float(SAMPLES);
        float blurMultiplier = uFrost * 0.025;
        for (int i = 0; i < SAMPLES; i++) {
            float theta = float(i) * GOLDEN_ANGLE + rnd;
            radius += radiusStep;
            vec2 bo = vec2(cos(theta), sin(theta)) * radius * blurMultiplier;
            transmission.r += plate(uvR + bo).r;
            vec4 g = plate(uvG + bo);
            transmission.g += g.g;
            bgAlpha += g.a;
            transmission.b += plate(uvB + bo).b;
        }
        transmission /= float(SAMPLES);
        bgAlpha /= float(SAMPLES);
    } else {
        transmission.r = plate(uvR).r;
        vec4 g = plate(uvG);
        transmission.g = g.g;
        bgAlpha = g.a;
        transmission.b = plate(uvB).b;
    }

    transmission *= uTint;

    vec3 clearGlassTint = mix(uTint, reflection, 0.5);
    transmission = mix(clearGlassTint, transmission, bgAlpha);

    vec3 finalColor = mix(transmission, reflection, fresnel * 0.8);

    float baseAlpha = max(0.25, fresnel * 0.85);
    float outAlpha = mix(baseAlpha, 1.0, bgAlpha);

    gl_FragColor = vec4(finalColor, outAlpha);
}`

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)
  if (!s) return null
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn('LiquidGlassCluster shader:', gl.getShaderInfoLog(s))
    gl.deleteShader(s)
    return null
  }
  return s
}

export function link(gl: WebGLRenderingContext, vs: string, fs: string) {
  const v = compile(gl, gl.VERTEX_SHADER, vs)
  const f = compile(gl, gl.FRAGMENT_SHADER, fs)
  if (!v || !f) return null
  const p = gl.createProgram()
  gl.attachShader(p, v)
  gl.attachShader(p, f)
  gl.linkProgram(p)
  gl.deleteShader(v)
  gl.deleteShader(f)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn('LiquidGlassCluster link:', gl.getProgramInfoLog(p))
    return null
  }
  return p
}
