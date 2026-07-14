const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad2 = (value: number) => String(value).padStart(2, "0");

export function getUtcWeekNumber(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / (7 * 24 * 60 * 60 * 1000));
}

export function formatGanttAxisTick(time: number, format = "%m/%d"): string {
  const date = new Date(time);
  const replacements: Record<string, string> = {
    "%Y": String(date.getUTCFullYear()),
    "%m": pad2(date.getUTCMonth() + 1),
    "%d": pad2(date.getUTCDate()),
    "%W": pad2(getUtcWeekNumber(date)),
    "%a": WEEKDAYS[date.getUTCDay()],
    "%H": pad2(date.getUTCHours()),
    "%M": pad2(date.getUTCMinutes()),
    "%S": pad2(date.getUTCSeconds()),
  };

  return Object.entries(replacements).reduce(
    (text, [token, value]) => text.split(token).join(value),
    format,
  );
}
