export type KaraokeTier = "normal" | "high" | "perfect";

/**
 * Tier reward colors, applied to the 🌀 emoji via CSS filters. The emoji is
 * normalized to grayscale first, then re-tinted with sepia + hue-rotate so the
 * spiral's internal shading is preserved while the hue lands on the target
 * color regardless of platform emoji artwork.
 *   normal  → purple
 *   high    → bright pink
 *   perfect → bright yellow
 */
const TIER_FILTER: Record<KaraokeTier, string> = {
  normal: "grayscale(1) sepia(1) saturate(10) hue-rotate(225deg) brightness(1.5)",
  high: "grayscale(1) sepia(1) saturate(14) hue-rotate(290deg) brightness(1.1)",
  perfect: "grayscale(1) sepia(1) saturate(12) hue-rotate(20deg) brightness(1.45)",
};

export const TIER_ORDER: KaraokeTier[] = ["normal", "high", "perfect"];

export function RewardSpiral({
  tier,
  spin = false,
  className = "",
  style,
}: {
  tier: KaraokeTier;
  spin?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center ${spin ? "animate-spin-slow" : ""} ${className}`}
      style={{ filter: TIER_FILTER[tier], verticalAlign: "middle", ...style }}
      aria-hidden="true"
    >
      🌀
    </span>
  );
}
