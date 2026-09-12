"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { DeviceChoice } from "@/lib/shop/device-picker";
import {
  addMyDevice,
  removeMyDevice,
  setPrimaryDevice,
  type MyDevice,
} from "@/lib/shop/my-devices";

const REASONS: Record<string, string> = {
  signed_out: "Sign in to save your phones.",
  missing: "We do not have that model listed.",
  limit: "Six phones is the most we keep — remove one first.",
};

export function MyDevices({
  mine,
  choices,
}: {
  mine: MyDevice[];
  choices: DeviceChoice[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const owned = new Set(mine.map((d) => d.deviceModelId));

  function run(action: () => Promise<{ ok: boolean; reason?: string }>) {
    start(async () => {
      const result = await action();
      setError(
        result.ok ? null : (REASONS[result.reason ?? ""] ?? "That did not work."),
      );
      if (result.ok) {
        setChosen("");
        setLabel("");
      }
      router.refresh();
    });
  }

  return (
    <>
      {error ? (
        <p className="mt-4 rounded-md border border-warn px-3 py-2 text-sm text-warn">
          {error}
        </p>
      ) : null}

      {mine.length > 0 ? (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {mine.map((device) => (
            <li
              key={device.deviceModelId}
              className="flex flex-wrap items-center gap-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {device.brand} {device.model}
                  {device.isPrimary ? (
                    <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
                      main phone
                    </span>
                  ) : null}
                </p>
                {device.label ? (
                  <p className="text-sm text-muted">{device.label}</p>
                ) : null}
              </div>

              {!device.isPrimary ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => setPrimaryDevice(device.deviceModelId))}
                  className="text-sm text-accent underline disabled:opacity-50"
                >
                  Make main
                </button>
              ) : null}

              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => removeMyDevice(device.deviceModelId))}
                aria-label={`Remove ${device.brand} ${device.model}`}
                className="text-sm text-warn underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-muted">No phones added yet.</p>
      )}

      <div className="mt-6 space-y-3 rounded-lg border border-line bg-raised p-4">
        <label className="block">
          <span className="text-sm font-medium">Add a phone</span>
          <select
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
          >
            <option value="">Choose a model…</option>
            {choices.map((choice) => (
              <option
                key={choice.id}
                value={choice.id}
                disabled={owned.has(choice.id)}
              >
                {choice.brand} {choice.model}
                {owned.has(choice.id) ? " — already added" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium">Call it something</span>
          <span className="mt-0.5 block text-xs text-muted">
            Optional — &ldquo;work phone&rdquo;, &ldquo;my wife&rsquo;s&rdquo;.
          </span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={40}
            className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
          />
        </label>

        <button
          type="button"
          disabled={pending || !chosen}
          onClick={() => run(() => addMyDevice(chosen, label || undefined))}
          className="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
        >
          Add phone
        </button>
      </div>
    </>
  );
}
