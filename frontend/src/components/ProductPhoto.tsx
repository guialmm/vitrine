import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { ROAST_LABEL } from "../lib/format";
import { rectToQuad } from "../lib/perspective";
import type { Point } from "../lib/perspective";
import type { Product } from "../lib/types";

type LabelProduct = Pick<Product, "name" | "origin" | "roast" | "tasting_notes">;
type Quad = readonly [Point, Point, Point, Point];

/** Stock photos (Pexels, free licence). `quad` is the printable area measured
 * on the original photo, in its own pixels: [top-left, top-right, bottom-right,
 * bottom-left]. The label is designed flat at LABEL_W px wide and warped onto
 * that quad, so it follows the photo's perspective. */
const PHOTOS = {
  pouch: {
    src: "/img/pexels-12039675.jpg",
    size: [1600, 1067],
    quad: [[614, 416], [986, 416], [986, 811], [614, 811]] as Quad,
    variant: "sticker",
  },
  table: {
    src: "/img/pexels-29795387.jpg",
    size: [1600, 1067],
    quad: [[568, 276], [996, 330], [962, 840], [557, 782]] as Quad,
    variant: "ink",
  },
  hand: {
    src: "/img/pexels-29795384.jpg",
    size: [881, 1400],
    quad: [[226, 316], [699, 293], [725, 895], [269, 936]] as Quad,
    variant: "ink",
  },
} as const;

export type PhotoKind = keyof typeof PHOTOS;

const LABEL_W = 400;

const ROAST_BAND: Record<string, string> = {
  clara: "var(--color-roast-clara)",
  media: "var(--color-roast-media)",
  "media-escura": "var(--color-roast-media-escura)",
  escura: "var(--color-roast-escura)",
};

const dist = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);

function Label({ product, variant }: { product: LabelProduct; variant: "sticker" | "ink" }) {
  return (
    <div
      className="flex size-full flex-col text-[#2a211a]"
      style={{
        padding: "34px 32px 28px",
        ...(variant === "sticker" ? { background: "#f7f3eb", borderRadius: 4 } : { opacity: 0.9 }),
      }}
    >
      <div className="flex items-center justify-between text-[20px]">
        <span className="font-extrabold tracking-[0.22em]">VITRINE</span>
        <span className="font-medium">250 g</span>
      </div>
      <div
        className="rounded-full"
        style={{ height: 9, margin: "16px 0 24px", background: ROAST_BAND[product.roast] ?? ROAST_BAND.media }}
      />
      <p className="text-[44px] font-extrabold uppercase leading-[0.95] tracking-[-0.01em]">{product.name}</p>
      <p className="mt-4 text-[22px] font-medium">{product.origin}</p>
      <p className="mt-auto text-[19px] leading-snug opacity-80">{product.tasting_notes}</p>
      <p className="mt-3.5 border-t-[1.5px] border-current pt-3 text-[17px] font-semibold uppercase tracking-[0.12em]">
        {ROAST_LABEL[product.roast] ?? "Torra média"}
      </p>
    </div>
  );
}

/** The photo at its native aspect ratio with the warped label on top. */
function Photo({ product, kind, eager }: { product: LabelProduct; kind: PhotoKind; eager?: boolean }) {
  const photo = PHOTOS[kind];
  const [pw, ph] = photo.size;
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  // Label height follows the quad's own proportions so the text isn't squashed.
  const [tl, tr, br, bl] = photo.quad;
  const labelH = Math.round(LABEL_W * ((dist(tl, bl) + dist(tr, br)) / (dist(tl, tr) + dist(bl, br))));
  const matrix = useMemo(() => rectToQuad(LABEL_W, labelH, photo.quad), [labelH, photo.quad]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / pw);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pw]);

  return (
    <div ref={ref} className="relative size-full select-none" style={{ aspectRatio: `${pw} / ${ph}` }}>
      <img
        src={photo.src}
        alt=""
        loading={eager ? "eager" : "lazy"}
        draggable={false}
        className="absolute inset-0 size-full"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 origin-top-left"
        style={{
          width: LABEL_W,
          height: labelH,
          // Right-to-left: warp onto the quad (photo px), then scale to the rendered size.
          transform: `scale(${scale}) ${matrix}`,
          mixBlendMode: "multiply",
          visibility: scale ? "visible" : "hidden",
        }}
      >
        <Label product={product} variant={photo.variant} />
      </div>
    </div>
  );
}

interface Props {
  product: LabelProduct;
  kind?: PhotoKind;
  /** "cover": fill a box of the given aspect, cropping the sides (cards).
   *  "natural": show the whole photo at its own aspect ratio. */
  fit?: "cover" | "natural";
  aspect?: string;
  className?: string;
  eager?: boolean;
}

export function ProductPhoto({ product, kind = "pouch", fit = "cover", aspect = "4 / 5", className = "", eager }: Props) {
  const label = `Pacote de ${product.name}`;
  if (fit === "natural") {
    return (
      <div role="img" aria-label={label} className={`relative overflow-hidden ${className}`}>
        <Photo product={product} kind={kind} eager={eager} />
      </div>
    );
  }
  const [pw, ph] = PHOTOS[kind].size;
  return (
    <div
      role="img"
      aria-label={label}
      className={`relative overflow-hidden bg-photo ${className}`}
      style={{ aspectRatio: aspect }}
    >
      {/* Full photo scaled to the box height and centred; the sides are cropped. */}
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2" style={{ aspectRatio: `${pw} / ${ph}` }}>
        <Photo product={product} kind={kind} eager={eager} />
      </div>
    </div>
  );
}
