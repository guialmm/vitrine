import type { Roast } from "../lib/types";

const ROAST_LEVEL: Record<string, number> = { clara: 1, media: 2, "media-escura": 3, escura: 4 };
const BAG_COLOR: Record<string, string> = {
  clara: "var(--color-roast-clara)",
  media: "var(--color-roast-media)",
  "media-escura": "var(--color-roast-media-escura)",
  escura: "var(--color-roast-escura)",
};

// Small deterministic variation per product so a grid of bags doesn't look cloned.
function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}
const LABEL_TINTS = ["#f5eadc", "#efe2cf", "#f3e6d8", "#eadcc6"];

interface Props {
  slug: string;
  name: string;
  origin: string;
  roast: Roast | "";
  className?: string;
}

export function CoffeeBag({ slug, name, origin, roast, className }: Props) {
  const h = hash(slug);
  const level = ROAST_LEVEL[roast] ?? 2;
  const bag = BAG_COLOR[roast] ?? BAG_COLOR.media;
  const label = LABEL_TINTS[h % LABEL_TINTS.length];
  const tilt = (h % 5) - 2; // -2..2 degrees
  const words = name.split(" ");
  const line1 = words.slice(0, Math.ceil(words.length / 2)).join(" ");
  const line2 = words.slice(Math.ceil(words.length / 2)).join(" ");
  const id = `bag-${slug}`;

  return (
    <svg
      viewBox="0 0 200 260"
      className={className}
      role="img"
      aria-label={`Pacote de ${name}`}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <defs>
        <linearGradient id={`${id}-shade`} x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.28" />
          <stop offset="0.18" stopColor="#000" stopOpacity="0" />
          <stop offset="0.82" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.32" />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* shadow */}
      <ellipse cx="100" cy="250" rx="70" ry="7" fill="#000" opacity="0.45" />

      {/* body */}
      <path
        d="M40 42 L160 42 L168 238 Q100 246 32 238 Z"
        fill={bag}
      />
      <path d="M40 42 L160 42 L168 238 Q100 246 32 238 Z" fill={`url(#${id}-shade)`} />
      <path d="M40 42 L160 42 L168 238 Q100 246 32 238 Z" fill={`url(#${id}-shine)`} />

      {/* crimped top */}
      <rect x="36" y="22" width="128" height="24" rx="3" fill={bag} />
      <rect x="36" y="22" width="128" height="24" rx="3" fill="#000" opacity="0.18" />
      {Array.from({ length: 15 }, (_, i) => (
        <line
          key={i}
          x1={42 + i * 8.3}
          x2={42 + i * 8.3}
          y1="25"
          y2="43"
          stroke="#000"
          strokeOpacity="0.22"
          strokeWidth="1.4"
        />
      ))}
      {/* valve */}
      <circle cx="100" cy="66" r="6" fill="#000" opacity="0.25" />
      <circle cx="100" cy="66" r="2.5" fill="#000" opacity="0.35" />

      {/* label */}
      <rect x="52" y="92" width="96" height="118" rx="6" fill={label} />
      <text
        x="100"
        y="112"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="7"
        letterSpacing="2"
        fill="#7a5a40"
      >
        VITRINE
      </text>
      <line x1="64" x2="136" y1="119" y2="119" stroke="#7a5a40" strokeOpacity="0.35" />
      <text
        x="100"
        y={line2 ? 140 : 148}
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fontSize="15"
        fontWeight="600"
        fill="#2a1a10"
      >
        {line1}
      </text>
      {line2 && (
        <text
          x="100"
          y="157"
          textAnchor="middle"
          fontFamily="var(--font-display)"
          fontSize="15"
          fontWeight="600"
          fill="#2a1a10"
        >
          {line2}
        </text>
      )}
      <text
        x="100"
        y="176"
        textAnchor="middle"
        fontFamily="var(--font-sans)"
        fontSize="6.5"
        fill="#6b5240"
      >
        {origin.split(",")[0].toUpperCase()}
      </text>
      {/* roast meter: 4 beans, filled up to the level */}
      {[0, 1, 2, 3].map((i) => (
        <ellipse
          key={i}
          cx={82 + i * 12}
          cy="194"
          rx="3.6"
          ry="5"
          transform={`rotate(25 ${82 + i * 12} 194)`}
          fill={i < level ? "#5a3520" : "none"}
          stroke="#5a3520"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}
