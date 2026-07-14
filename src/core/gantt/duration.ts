/**
 * Parses a Mermaid gantt duration token (e.g. `9m`, `3h`, `2w`, `7d`, `30s`)
 * into a fractional number of days. Units follow real Mermaid gantt syntax
 * exactly (lowercase only — Mermaid has no month unit and is case-sensitive):
 *   s = seconds, m = minutes, h = hours, d = days, w = weeks.
 */
export const parseDurationDays = (value: string | undefined): number | null => {
  if (!value) return null;
  const match = value.trim().match(/^(\d+)\s*([dhwms])$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount) || amount <= 0) return null;
  switch (unit) {
    case "s":
      return amount / 86400;
    case "m":
      return amount / 1440;
    case "h":
      return amount / 24;
    case "w":
      return amount * 7;
    default:
      return amount; // "d"
  }
};
