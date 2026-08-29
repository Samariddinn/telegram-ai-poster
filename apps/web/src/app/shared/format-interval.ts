/** Renders a workflow's interval in minutes as human-friendly text (e.g. "90 min", "2 hours"). */
export function formatInterval(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `${minutes} min`;
}
