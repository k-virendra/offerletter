import type { FieldValues } from "./types";

export const DEFAULT_LETTER_NAME = "New offer letter";

/** The name a letter gets from its candidate and role, until the user names it themselves. */
export function automaticName(values: FieldValues): string {
  const candidate = typeof values["candidate.full_name"] === "string" ? values["candidate.full_name"].trim() : "";
  const role = typeof values["position.job_title"] === "string" ? values["position.job_title"].trim() : "";
  if (candidate && role) return `${candidate} – ${role}`.slice(0, 200);
  return (candidate || role || DEFAULT_LETTER_NAME).slice(0, 200);
}
