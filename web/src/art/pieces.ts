// Piece artwork: round wooden tokens with a painted tiger / goat face.
// Drawn as SVG (crisp at any size) and rasterised once into kaplay sprites.

const SIZE = 320;

const tiger = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 256 256">
  <defs>
    <radialGradient id="rim" cx="50%" cy="35%" r="70%">
      <stop offset="0" stop-color="#6b4528"/><stop offset="1" stop-color="#2a160b"/>
    </radialGradient>
    <radialGradient id="bg" cx="50%" cy="40%" r="60%">
      <stop offset="0" stop-color="#4a2a17"/><stop offset="1" stop-color="#26130a"/>
    </radialGradient>
    <radialGradient id="fur" cx="50%" cy="38%" r="65%">
      <stop offset="0" stop-color="#ffbe5c"/><stop offset=".6" stop-color="#f08a22"/><stop offset="1" stop-color="#c25d10"/>
    </radialGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <g id="side">
      <circle cx="72" cy="78" r="25" fill="url(#fur)" stroke="#2a160b" stroke-width="3"/>
      <circle cx="74" cy="81" r="13" fill="#3a1d0e"/>
      <circle cx="76" cy="84" r="6" fill="#d77a6a"/>
      <path d="M58 146 L34 170 L70 166 Z" fill="#fff4e0" stroke="#2a160b" stroke-width="3" stroke-linejoin="round"/>
      <path d="M50 116 Q68 118 80 130 Q64 128 50 132 Z" fill="#1c0d05"/>
      <path d="M52 140 Q68 140 80 150 Q66 150 56 156 Z" fill="#1c0d05"/>
      <path d="M62 96 Q74 100 84 112 Q70 110 58 110 Z" fill="#1c0d05"/>
      <path d="M100 82 Q114 88 118 102 Q108 94 96 94 Z" fill="#1c0d05"/>
      <ellipse cx="100" cy="106" rx="15" ry="7" fill="#fff4e0" transform="rotate(-12 100 106)"/>
      <path d="M86 124 Q100 112 116 124 Q100 134 86 124 Z" fill="#ffd34a" stroke="#1c0d05" stroke-width="3.5"/>
      <ellipse cx="102" cy="124" rx="4" ry="7" fill="#1c0d05"/>
      <circle cx="104" cy="121" r="1.8" fill="#fff"/>
      <ellipse cx="110" cy="166" rx="25" ry="19" fill="#fff4e0"/>
      <circle cx="100" cy="162" r="2" fill="#5b3a26"/><circle cx="108" cy="170" r="2" fill="#5b3a26"/>
      <circle cx="96" cy="171" r="2" fill="#5b3a26"/>
    </g>
  </defs>
  <circle cx="128" cy="128" r="125" fill="url(#rim)"/>
  <circle cx="128" cy="128" r="113" fill="none" stroke="#e0ab48" stroke-width="5"/>
  <circle cx="128" cy="128" r="107" fill="url(#bg)"/>
  <ellipse cx="128" cy="136" rx="80" ry="72" fill="url(#fur)" stroke="#2a160b" stroke-width="3"/>
  <use href="#side"/>
  <use href="#side" transform="translate(256 0) scale(-1 1)"/>
  <path d="M128 70 Q137 84 128 106 Q119 84 128 70 Z" fill="#1c0d05"/>
  <ellipse cx="128" cy="186" rx="18" ry="11" fill="#fff4e0"/>
  <path d="M114 148 Q128 142 142 148 Q136 160 128 162 Q120 160 114 148 Z" fill="#c9505f" stroke="#2a160b" stroke-width="3" stroke-linejoin="round"/>
  <path d="M128 162 L128 172 M128 172 Q118 182 108 176 M128 172 Q138 182 148 176" fill="none" stroke="#2a160b" stroke-width="3.5" stroke-linecap="round"/>
  <ellipse cx="128" cy="96" rx="96" ry="60" fill="url(#gloss)"/>
</svg>`;

const goat = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 256 256">
  <defs>
    <radialGradient id="rim" cx="50%" cy="35%" r="70%">
      <stop offset="0" stop-color="#46663a"/><stop offset="1" stop-color="#18280f"/>
    </radialGradient>
    <radialGradient id="bg" cx="50%" cy="40%" r="60%">
      <stop offset="0" stop-color="#7fb069"/><stop offset="1" stop-color="#3f6b35"/>
    </radialGradient>
    <linearGradient id="fur" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffdf6"/><stop offset="1" stop-color="#e6d9bd"/>
    </linearGradient>
    <linearGradient id="horn" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#d9c6a5"/><stop offset="1" stop-color="#8d7455"/>
    </linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <g id="side">
      <path d="M108 80 Q92 38 58 40 Q76 50 86 70 Q92 82 96 92 Z" fill="url(#horn)" stroke="#4f3d29" stroke-width="3" stroke-linejoin="round"/>
      <path d="M78 52 Q84 56 86 62 M86 66 Q90 70 92 76" stroke="#6b5539" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M90 104 Q56 92 30 112 Q50 128 92 120 Z" fill="url(#fur)" stroke="#4f3d29" stroke-width="3" stroke-linejoin="round"/>
      <path d="M84 108 Q62 104 46 113 Q62 120 86 116 Z" fill="#e9aea0"/>
    </g>
  </defs>
  <circle cx="128" cy="128" r="125" fill="url(#rim)"/>
  <circle cx="128" cy="128" r="113" fill="none" stroke="#e0ab48" stroke-width="5"/>
  <circle cx="128" cy="128" r="107" fill="url(#bg)"/>
  <use href="#side"/>
  <use href="#side" transform="translate(256 0) scale(-1 1)"/>
  <path d="M128 76 C168 76 176 112 168 140 C162 168 150 196 128 200 C106 196 94 168 88 140 C80 112 88 76 128 76 Z"
        fill="url(#fur)" stroke="#4f3d29" stroke-width="3"/>
  <path d="M90 126 Q104 116 118 126 Q104 134 90 126 Z" fill="#f2c94c" stroke="#3a2c1c" stroke-width="3"/>
  <rect x="96" y="123.5" width="16" height="5" rx="2.5" fill="#1d150c"/>
  <path d="M166 126 Q152 116 138 126 Q152 134 166 126 Z" fill="#f2c94c" stroke="#3a2c1c" stroke-width="3"/>
  <rect x="144" y="123.5" width="16" height="5" rx="2.5" fill="#1d150c"/>
  <path d="M112 84 Q120 72 128 82 Q136 72 144 84 Q136 92 128 88 Q120 92 112 84 Z" fill="#fffdf6" stroke="#4f3d29" stroke-width="2.5"/>
  <ellipse cx="128" cy="178" rx="24" ry="16" fill="#f1d3c6"/>
  <ellipse cx="119" cy="176" rx="4.5" ry="3" fill="#6b3e35"/>
  <ellipse cx="137" cy="176" rx="4.5" ry="3" fill="#6b3e35"/>
  <path d="M120 188 Q128 194 136 188" stroke="#6b3e35" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M118 198 Q128 232 138 198 Z" fill="url(#fur)" stroke="#4f3d29" stroke-width="3" stroke-linejoin="round"/>
  <ellipse cx="128" cy="96" rx="96" ry="60" fill="url(#gloss)"/>
</svg>`;

export function svgUrl(svg: string): string {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.trim());
}

export const PIECE_SVGS = { tiger, goat };
