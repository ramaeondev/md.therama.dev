import { BRAND_PATHS, type BrandName } from "./brands";

/**
 * Inline brand mark, copied from apps.therama.dev. Renders a 24px viewBox SVG
 * filled with currentColor so it inherits the surrounding button's text colour.
 */
export function BrandIcon({
  brand,
  className,
  size = 20,
}: {
  brand: BrandName;
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={BRAND_PATHS[brand]} />
    </svg>
  );
}
