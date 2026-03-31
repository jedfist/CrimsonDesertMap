<template>
  <div class="map-compass" aria-hidden="true">
    <svg
      class="map-compass__svg"
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id="mcr-grain"
          patternUnits="userSpaceOnUse"
          width="4"
          height="4"
        >
          <circle cx="1" cy="1" r="0.35" fill="#6b5c48" opacity="0.12" />
          <circle cx="3" cy="2.5" r="0.25" fill="#4a4034" opacity="0.1" />
        </pattern>
        <linearGradient id="mcr-iron" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#454038" />
          <stop offset="35%" stop-color="#1c1a17" />
          <stop offset="100%" stop-color="#0a0908" />
        </linearGradient>
        <linearGradient id="mcr-brass" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#e8cc7a" />
          <stop offset="30%" stop-color="#a8843c" />
          <stop offset="65%" stop-color="#6b5228" />
          <stop offset="100%" stop-color="#3d3018" />
        </linearGradient>
        <linearGradient id="mcr-brass-hi" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#5c4a28" />
          <stop offset="50%" stop-color="#d4b870" />
          <stop offset="100%" stop-color="#5c4a28" />
        </linearGradient>
        <radialGradient id="mcr-parchment" cx="38%" cy="32%" r="72%">
          <stop offset="0%" stop-color="#524838" />
          <stop offset="45%" stop-color="#2e2820" />
          <stop offset="100%" stop-color="#100e0c" />
        </radialGradient>
        <radialGradient id="mcr-gem" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stop-color="#8ec8e8" />
          <stop offset="45%" stop-color="#2a5a8c" />
          <stop offset="85%" stop-color="#0f2844" />
          <stop offset="100%" stop-color="#061018" />
        </radialGradient>
        <linearGradient id="mcr-north" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#ff5c6c" />
          <stop offset="55%" stop-color="#b01830" />
          <stop offset="100%" stop-color="#5a0818" />
        </linearGradient>
        <linearGradient id="mcr-gold-edge" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f5e6a8" />
          <stop offset="100%" stop-color="#8a7030" />
        </linearGradient>
        <filter id="mcr-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="0.6" result="b" />
          <feOffset dx="0" dy="0.6" in="b" result="o" />
          <feMerge>
            <feMergeNode in="o" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="mcr-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <!-- Scalloped iron bezel -->
      <path :d="scallopBezel" fill="url(#mcr-iron)" stroke="#050504" stroke-width="0.75" />
      <path
        :d="scallopBezelInner"
        fill="none"
        stroke="url(#mcr-brass)"
        stroke-width="1.6"
        opacity="0.9"
      />

      <!-- Sun-crown teeth on rim -->
      <g fill="none" stroke="#2a2418" stroke-width="0.85" stroke-linecap="round" opacity="0.85">
        <line
          v-for="(t, i) in rimRays"
          :key="'r' + i"
          :x1="t.x1"
          :y1="t.y1"
          :x2="t.x2"
          :y2="t.y2"
        />
      </g>

      <!-- Studs (16) -->
      <g>
        <circle
          v-for="(p, i) in studPoints16"
          :key="'s' + i"
          :cx="p.x"
          :cy="p.y"
          r="1.9"
          fill="#6b5838"
          stroke="#1a1510"
          stroke-width="0.35"
        />
        <circle
          v-for="(p, i) in studPoints16"
          :key="'h' + i"
          :cx="p.x - 0.35"
          :cy="p.y - 0.35"
          r="0.55"
          fill="#c4a86a"
          opacity="0.35"
        />
      </g>

      <!-- Filigree hooks (4 intercardinals, outer) -->
      <g
        fill="none"
        stroke="#7a6238"
        stroke-width="0.55"
        stroke-linecap="round"
        opacity="0.65"
      >
        <path v-for="(f, i) in filigreePaths" :key="'f' + i" :d="f" />
      </g>

      <!-- Rope + bead inner ring -->
      <circle
        cx="64"
        cy="64"
        r="53.5"
        fill="none"
        stroke="#4a3c28"
        stroke-width="0.9"
        stroke-dasharray="2.2 1.8"
        opacity="0.55"
      />
      <circle
        cx="64"
        cy="64"
        r="51.2"
        fill="none"
        stroke="url(#mcr-brass-hi)"
        stroke-width="0.45"
        opacity="0.5"
      />

      <!-- Parchment face + grain overlay -->
      <circle cx="64" cy="64" r="48.5" fill="url(#mcr-parchment)" />
      <circle cx="64" cy="64" r="48.5" fill="url(#mcr-grain)" opacity="0.9" />
      <circle
        cx="64"
        cy="64"
        r="48.5"
        fill="none"
        stroke="#1f1a14"
        stroke-width="1.1"
      />
      <circle
        cx="64"
        cy="64"
        r="45"
        fill="none"
        stroke="#3d3428"
        stroke-width="0.35"
        stroke-dasharray="1 2.5"
        opacity="0.4"
      />

      <!-- Inscribed octagon frame -->
      <path
        :d="octagonPath"
        fill="none"
        stroke="#5c4e3e"
        stroke-width="0.4"
        opacity="0.35"
      />

      <!-- 32-point micro rose -->
      <g opacity="0.2" fill="none" stroke="#7a6a52" stroke-width="0.45" stroke-linecap="round">
        <line
          v-for="(t, i) in micro32"
          :key="'m' + i"
          :x1="t.x1"
          :y1="t.y1"
          :x2="t.x2"
          :y2="t.y2"
        />
      </g>

      <!-- Fine 16-point -->
      <g opacity="0.26" fill="none" stroke="#6b5c48" stroke-width="0.5">
        <line
          v-for="(t, i) in fineTickLines"
          :key="'ff' + i"
          :x1="t.x1"
          :y1="t.y1"
          :x2="t.x2"
          :y2="t.y2"
        />
      </g>

      <!-- Quarter petals (layered) -->
      <g opacity="0.22" fill="#3d3228" stroke="#2a2218" stroke-width="0.25">
        <path d="M64 22 L71 46 L64 42 L57 46 Z" />
        <path d="M64 106 L57 82 L64 86 L71 82 Z" />
        <path d="M22 64 L46 57 L42 64 L46 71 Z" />
        <path d="M106 64 L82 71 L86 64 L82 57 Z" />
      </g>

      <!-- Intercardinal ticks -->
      <g
        stroke="#8b7355"
        stroke-width="1.35"
        stroke-linecap="round"
        fill="none"
        opacity="0.92"
      >
        <line
          v-for="(t, i) in interTickLines"
          :key="i"
          :x1="t.x1"
          :y1="t.y1"
          :x2="t.x2"
          :y2="t.y2"
        />
      </g>

      <!-- Cardinal ticks -->
      <g stroke="#d4b878" stroke-width="2" stroke-linecap="square" fill="none" opacity="0.92">
        <line x1="64" y1="14.5" x2="64" y2="27" />
        <line x1="64" y1="113.5" x2="64" y2="101" />
        <line x1="14.5" y1="64" x2="27" y2="64" />
        <line x1="113.5" y1="64" x2="101" y2="64" />
      </g>

      <!-- Decorative knot dots at intercardinals -->
      <g fill="#a68b5b" opacity="0.45">
        <circle
          v-for="(c, i) in crossMarks"
          :key="'d' + i"
          :cx="c.x"
          :cy="c.y"
          r="1.1"
        />
      </g>

      <!-- Manuscript-style pinpricks (intercardinal ring) -->
      <g fill="#5c5040" opacity="0.4">
        <circle
          v-for="(p, i) in windDots"
          :key="'w' + i"
          :cx="p.x"
          :cy="p.y"
          r="0.5"
        />
      </g>

      <!-- Fleur-de-lis crest (north) -->
      <g
        transform="translate(64 10) scale(0.42)"
        fill="url(#mcr-brass)"
        stroke="#2a2210"
        stroke-width="1.2"
        filter="url(#mcr-soft)"
      >
        <path
          d="M0 -14 C-8 -14 -10 -4 -6 2 C-10 6 -8 12 0 10 C8 12 10 6 6 2 C10 -4 8 -14 0 -14 M0 -14 L0 14 M-6 6 Q0 10 6 6"
          transform="translate(0, 4)"
        />
      </g>

      <!-- North pointer stack -->
      <path
        d="M64 27 L74 56 L64 49 L54 56 Z"
        fill="#2a080e"
        opacity="0.45"
        transform="translate(1.2 1)"
      />
      <path
        d="M64 25 L73.5 55 L64 47.5 L54.5 55 Z"
        fill="url(#mcr-north)"
        stroke="#3d060c"
        stroke-width="0.9"
        filter="url(#mcr-soft)"
      />
      <path
        d="M64 25 L69 42 L64 38 L59 42 Z"
        fill="url(#mcr-gold-edge)"
        opacity="0.55"
      />
      <path
        d="M64 47.5 L67.5 54 L64 51.5 L60.5 54 Z"
        fill="#fff"
        opacity="0.12"
      />

      <!-- Center jewel + brass mount -->
      <circle cx="64" cy="64" r="10" fill="#14110e" stroke="url(#mcr-brass)" stroke-width="1.8" />
      <circle cx="64" cy="64" r="7.8" fill="#1e1a14" stroke="#3d3228" stroke-width="0.4" />
      <circle
        cx="64"
        cy="64"
        r="5.2"
        fill="url(#mcr-gem)"
        stroke="#0a1828"
        stroke-width="0.35"
        filter="url(#mcr-glow)"
      />
      <ellipse
        cx="61.5"
        cy="61"
        rx="1.6"
        ry="1"
        fill="#fff"
        opacity="0.35"
      />
      <!-- Quatrefoil mount -->
      <g stroke="#8a7344" stroke-width="0.5" fill="none" opacity="0.55">
        <path d="M64 56 v16 M56 64 h16" />
        <circle cx="64" cy="56" r="1.2" fill="#5c4a32" stroke="none" opacity="0.6" />
        <circle cx="64" cy="72" r="1.2" fill="#5c4a32" stroke="none" opacity="0.6" />
        <circle cx="56" cy="64" r="1.2" fill="#5c4a32" stroke="none" opacity="0.6" />
        <circle cx="72" cy="64" r="1.2" fill="#5c4a32" stroke="none" opacity="0.6" />
      </g>

      <!-- Cardinal letters -->
      <text
        x="64"
        y="13"
        text-anchor="middle"
        class="map-compass__letter map-compass__letter--north"
      >
        N
      </text>
      <text x="64" y="122.5" text-anchor="middle" class="map-compass__letter">
        S
      </text>
      <text x="12.5" y="68.5" text-anchor="middle" class="map-compass__letter">
        W
      </text>
      <text x="115.5" y="68.5" text-anchor="middle" class="map-compass__letter">
        E
      </text>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const cx = 64
const cy = 64

/** Screen-style polar: 0° = up, clockwise positive → SVG coords (y down) */
function navPoint(navDeg: number, r: number) {
  const rad = (navDeg * Math.PI) / 180
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) }
}

function interTick(navDeg: number, r1: number, r2: number) {
  const a = navPoint(navDeg, r1)
  const b = navPoint(navDeg, r2)
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
}

function scallopPolygon(ridgeR: number, valleyR: number, steps: number) {
  const pts: string[] = []
  for (let i = 0; i < steps; i++) {
    const a0 = (-90 + (360 / steps) * i) * (Math.PI / 180)
    const a1 = (-90 + (360 / steps) * (i + 0.5)) * (Math.PI / 180)
    const x0 = cx + ridgeR * Math.cos(a0)
    const y0 = cy + ridgeR * Math.sin(a0)
    const x1 = cx + valleyR * Math.cos(a1)
    const y1 = cy + valleyR * Math.sin(a1)
    pts.push(i === 0 ? `M${x0.toFixed(2)} ${y0.toFixed(2)}` : `L${x0.toFixed(2)} ${y0.toFixed(2)}`)
    pts.push(`L${x1.toFixed(2)} ${y1.toFixed(2)}`)
  }
  return `${pts.join(' ')} Z`
}

const scallopBezel = computed(() => scallopPolygon(62.5, 58.5, 12))
const scallopBezelInner = computed(() => scallopPolygon(59.2, 56.2, 12))

const rimRays = computed(() => {
  const out: { x1: number; y1: number; x2: number; y2: number }[] = []
  for (let i = 0; i < 24; i++) {
    const deg = i * 15
    const a = navPoint(deg, 63.2)
    const b = navPoint(deg, 59.5)
    out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
  }
  return out
})

const studPoints16 = computed(() =>
  Array.from({ length: 16 }, (_, i) => navPoint(i * 22.5, 60.5)),
)

const filigreePaths = computed(() => {
  const r = 56
  const paths: string[] = []
  for (const deg of [45, 135, 225, 315]) {
    const p = navPoint(deg, r)
    const t = deg * (Math.PI / 180)
    const dx = Math.sin(t) * 4
    const dy = -Math.cos(t) * 4
    paths.push(
      `M${p.x + dx * 0.2} ${p.y + dy * 0.2} Q${p.x + dx * 1.2} ${p.y + dy * 1.2} ${p.x + dx * 0.5} ${p.y + dy * 1.8}`,
    )
  }
  return paths
})

const octagonPath = computed(() => {
  const r = 40
  const pts: string[] = []
  for (let i = 0; i < 8; i++) {
    const ang = (-90 + i * 45) * (Math.PI / 180)
    const x = cx + r * Math.cos(ang)
    const y = cy + r * Math.sin(ang)
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  return `${pts.join(' ')} Z`
})

const interTickLines = [45, 135, 225, 315].map((deg) => interTick(deg, 45.5, 38.5))

const fineNav = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5]
const fineTickLines = fineNav.map((deg) => interTick(deg, 46.5, 42.5))

const micro32 = Array.from({ length: 32 }, (_, i) => interTick(i * 11.25, 44, 40.5))

const crossMarks = [45, 135, 225, 315].map((deg) => navPoint(deg, 32.5))

const windDots = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map(
  (deg) => navPoint(deg, 36.2),
)
</script>

<style scoped>
.map-compass {
  width: 9rem;
  height: 9rem;
  pointer-events: none;
  filter: drop-shadow(0 3px 10px rgba(0, 0, 0, 0.58))
    drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.45));
}

.map-compass__svg {
  display: block;
  width: 100%;
  height: 100%;
}

.map-compass__letter {
  font-family: Metamorphous, 'Times New Roman', serif;
  font-size: 14px;
  font-weight: 400;
  fill: #e2d2b0;
  letter-spacing: 0.04em;
  paint-order: stroke fill;
  stroke: #1a1410;
  stroke-width: 0.35px;
}

.map-compass__letter--north {
  font-size: 16px;
  fill: #fff2d4;
  stroke-width: 0.4px;
}
</style>
