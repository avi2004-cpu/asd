// Step 2.2 -- child details + mandatory consent (shared by Signup and "add a child" on ParentHome).
import { pb } from "../lib/pb";
import { todayUtc } from "../lib/asd";
import type { Child } from "../types/schema";
import { Field, Input, Select } from "./ui";

export const CONSENT_LABEL = "I consent to camera use and data collection";

export interface ChildDraft {
  name: string;
  dob: string; // YYYY-MM-DD from <input type="date">
  gender: string;
  consent: boolean;
}

export const EMPTY_CHILD: ChildDraft = { name: "", dob: "", gender: "", consent: false };

export function childDraftError(d: ChildDraft): string | null {
  if (!d.name.trim()) return "Please enter your child's name.";
  if (!d.dob) return "Please enter your child's date of birth.";
  if (d.dob > todayUtc()) return "Date of birth cannot be in the future.";
  if (!d.gender) return "Please select a gender.";
  if (!d.consent) return `Please tick “${CONSENT_LABEL}” to save the profile.`;
  return null;
}

export async function createChild(parentId: string, d: ChildDraft): Promise<Child> {
  if (!d.consent) throw new Error(`Consent is required: ${CONSENT_LABEL}.`);
  return pb.collection("children").create<Child>({
    parent: parentId,
    name: d.name.trim(),
    dob: `${d.dob} 00:00:00.000Z`,
    gender: d.gender,
    consent: true,
    consent_at: new Date().toISOString(),
  });
}

export function ChildFields({
  value,
  onChange,
  disabled,
}: {
  value: ChildDraft;
  onChange: (v: ChildDraft) => void;
  disabled?: boolean;
}) {
  const set = <K extends keyof ChildDraft>(k: K, v: ChildDraft[K]) => onChange({ ...value, [k]: v });

  return (
    <div className="space-y-4">
      <Field label="Child's name">
        <Input
          required
          value={value.name}
          disabled={disabled}
          onChange={(e) => set("name", e.target.value)}
          autoComplete="off"
          maxLength={100}
          placeholder="e.g. Aarav"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date of birth">
          <Input
            type="date"
            required
            value={value.dob}
            max={todayUtc()}
            disabled={disabled}
            onChange={(e) => set("dob", e.target.value)}
          />
        </Field>
        <Field label="Gender">
          <Select required value={value.gender} disabled={disabled} onChange={(e) => set("gender", e.target.value)}>
            <option value="" disabled>
              Select…
            </option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other / prefer not to say</option>
          </Select>
        </Field>
      </div>

      <label
        className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 ${
          value.consent ? "border-brand-600 bg-brand-50" : "border-amber-300 bg-amber-50"
        }`}
      >
        <input
          type="checkbox"
          className="mt-0.5 h-6 w-6 shrink-0 accent-brand-700"
          checked={value.consent}
          disabled={disabled}
          onChange={(e) => set("consent", e.target.checked)}
          aria-describedby="consent-help"
        />
        <span>
          <span className="block font-semibold text-slate-900">{CONSENT_LABEL}</span>
          <span id="consent-help" className="mt-1 block text-sm text-slate-600">
            The front camera is used during play. Video is analysed on this phone and never uploaded. Only a few
            summary numbers per session are sent to your doctor.
          </span>
        </span>
      </label>
      {!value.consent && (
        <p className="text-sm font-medium text-amber-800" role="note">
          Consent is required. “Save Profile” stays disabled until the box above is ticked.
        </p>
      )}
    </div>
  );
}
