import type { CSSProperties } from "react";

import { ROAST_LABEL } from "../lib/format";
import type { Product } from "../lib/types";

type LabelProduct = Pick<Product, "name" | "origin" | "roast" | "tasting_notes">;

/** Stock photos (Pexels, free licence) and where the label sits on each, as a
 * percentage of the photo. `sticker` prints a paper label on bare kraft; `ink`
 * prints straight onto a blank white label already in the photo. */
const PHOTOS = {
  pouch: {
    src: "/img/pexels-12039675.jpg",
    ratio: 1600 / 1067,
    area: { left: 38.4, top: 39, width: 23.2, height: 37 },
    rotate: 0,
    variant: "sticker",
  },
  table: {
    src: "/img/pexels-29795387.jpg",
    ratio: 1600 / 1067,
    area: { left: 37.2, top: 34, width: 23, height: 38 },
    rotate: 1.2,
    variant: "ink",
  },
  hand: {
    src: "/img/pexels-29795384.jpg",
    ratio: 1400 / 2223,
    area: { left: 30, top: 26.5, width: 46, height: 35 },
    rotate: -2.2,
    variant: "ink",
  },
} as const;

export type PhotoKind = keyof typeof PHOTOS;

const ROAST_BAND: Record<string, string> = {
  clara: "var(--color-roast-clara)",
  media: "var(--color-roast-media)",
  "media-escura": "var(--color-roast-media-escura)",
  escura: "var(--color-roast-escura)",
};

function Label({ product, variant }: { product: LabelProduct; variant: "sticker" | "ink" }) {
  // Sizes are in cqw (% of the label's own width) so it scales with the photo.
  return (
    <div
      className="flex size-full flex-col text-[#2a211a]"
      style={{
        padding: "8cqw 8cqw 7cqw",
        ...(variant === "sticker"
          ? { background: "#f7f3eb", borderRadius: "1.2cqw", boxShadow: "0 0.4cqw 1.2cqw rgba(0,0,0,.12)" }
          : { opacity: 0.9 }),
      }}
    >
      <div className="flex items-center justify-between" style={{ fontSize: "5cqw" }}>
        <span className="font-extrabold tracking-[0.22em]">VITRINE</span>
        <span className="font-medium">250 g</span>
      </div>
      <div
        className="rounded-full"
        style={{ height: "2.2cqw", margin: "4cqw 0 6cqw", background: ROAST_BAND[product.roast] ?? ROAST_BAND.media }}
      />
      <p className="font-extrabold uppercase" style={{ fontSize: "11cqw", lineHeight: 0.95, letterSpacing: "-0.01em" }}>
        {product.name}
      </p>
      <p className="font-medium" style={{ fontSize: "5.4cqw", marginTop: "4cqw" }}>
        {product.origin}
      </p>
      <p style={{ fontSize: "4.8cqw", marginTop: "auto", lineHeight: 1.3, opacity: 0.8 }}>{product.tasting_notes}</p>
      <p
        className="font-semibold uppercase tracking-[0.12em]"
        style={{ fontSize: "4.2cqw", marginTop: "3.5cqw", paddingTop: "3cqw", borderTop: "0.3cqw solid currentColor" }}
      >
        {ROAST_LABEL[product.roast] ?? "Torra média"}
      </p>
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
  const photo = PHOTOS[kind];
  const { left, top, width, height } = photo.area;
  const labelStyle: CSSProperties = {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
    transform: photo.rotate ? `rotate(${photo.rotate}deg)` : undefined,
    containerType: "inline-size",
    mixBlendMode: "multiply",
  };

  const inner = (
    <>
      <img
        src={photo.src}
        alt=""
        loading={eager ? "eager" : "lazy"}
        className="absolute inset-0 size-full"
        draggable={false}
      />
      <div className="absolute" style={labelStyle}>
        <Label product={product} variant={photo.variant} />
      </div>
    </>
  );

  if (fit === "natural") {
    return (
      <div
        role="img"
        aria-label={`Pacote de ${product.name}`}
        className={`relative overflow-hidden ${className}`}
        style={{ aspectRatio: photo.ratio }}
      >
        {inner}
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={`Pacote de ${product.name}`}
      className={`relative overflow-hidden bg-photo ${className}`}
      style={{ aspectRatio: aspect }}
    >
      {/* Full photo scaled to the box height and centred, sides cropped. */}
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2" style={{ aspectRatio: photo.ratio }}>
        {inner}
      </div>
    </div>
  );
}
