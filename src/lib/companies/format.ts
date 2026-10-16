// Wording for company cards, shared by the desktop and phone layouts.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "12 paid · 2 drafts", "5 paid", "2 drafts · none paid", "No letters yet". */
export function letterSummary(paid: number, drafts: number): string {
  if (paid && drafts) return `${paid} paid · ${plural(drafts, "draft", "drafts")}`;
  if (paid) return `${paid} paid`;
  if (drafts) return `${plural(drafts, "draft", "drafts")} · none paid`;
  return "No letters yet";
}

/** The shorter phone version: "12 paid letters", "2 drafts". */
export function letterSummaryShort(paid: number, drafts: number): string {
  if (paid) return plural(paid, "paid letter", "paid letters");
  if (drafts) return plural(drafts, "draft", "drafts");
  return "No letters yet";
}

export function placesLeft(used: number, limit: number): string {
  const left = Math.max(0, limit - used);
  return `${plural(left, "place", "places")} left`;
}

/** Two letters for the logo tile when there's no logo: "Example Engineering GmbH" → "EE". */
export function companyInitials(name: string): string {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}
