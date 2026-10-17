import { Lock } from "lucide-react";

/** Why a country can or can't be switched on. */
export function CountryStatus({ missing, required, inherited }: { missing: string[]; required: number; inherited: number }) {
  if (missing.length) {
    return (
      <p className="mt-0.5 flex items-start gap-1.5 text-[13px] text-marigold-800">
        <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        Can’t switch on: {missing.join(", ")} {missing.length === 1 ? "still needs an approved clause" : "still need approved clauses"}
      </p>
    );
  }
  return (
    <p className="mt-0.5 text-[13px] text-evergreen-700">
      {inherited ? `Ready · inherits ${inherited} approved ${inherited === 1 ? "clause" : "clauses"}` : `All ${required} required sections approved`}
    </p>
  );
}
