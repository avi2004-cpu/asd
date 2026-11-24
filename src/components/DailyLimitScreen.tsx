import { Button } from "./ui";

/** Step 2.3 / TC10: friendly screen shown when the server daily-limit hook rejects a session. */
export function DailyLimitScreen({ childName, onDone }: { childName?: string; onDone?: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-3xl bg-gradient-to-b from-indigo-50 to-sky-50 px-6 py-10 text-center">
      <div aria-hidden className="mb-4 text-7xl">🌙</div>
      <h2 className="text-2xl font-bold text-indigo-900">Come back tomorrow!</h2>
      <p className="mt-2 max-w-sm text-base text-indigo-800">
        {childName ? `${childName} has` : "You have"} finished today's play sessions. Great job! 🌟
      </p>
      <p className="mt-1 text-sm text-indigo-700/80">Daily session limit reached.</p>
      {onDone && (
        <Button className="mt-6 w-full max-w-xs" onClick={onDone}>
          Back to home
        </Button>
      )}
    </div>
  );
}
