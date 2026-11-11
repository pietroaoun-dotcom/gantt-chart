import { fmtDate } from "./model";

/** Short, human time for "last saved": just now, 5 min ago, at 14:02, or the date. */
export function when(isoTime: string | null | undefined): string {
  if (!isoTime) return "";
  const t = new Date(isoTime);
  if (isNaN(+t)) return "";
  const mins = Math.round((Date.now() - +t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hm = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  if (t.toDateString() === new Date().toDateString()) return `today at ${hm}`;
  return `on ${fmtDate(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()))}`;
}
