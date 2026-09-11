"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { useToast } from "@/components/admin/toast";
import {
  deleteImage,
  reorderImages,
  setImageAlt,
  uploadImages,
} from "@/lib/admin/image-actions";

export type ImageRow = {
  id: string;
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  position: number;
};

export function ProductImages({
  productId,
  rows,
  durable,
}: {
  productId: string;
  rows: ImageRow[];
  /** False on the local driver, where files vanish on the next deploy. */
  durable: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function send(files: FileList | File[]) {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    start(async () => {
      const result = await uploadImages(productId, form);
      if (!result.ok) {
        toast({ text: result.error, tone: "error" });
        return;
      }
      toast({
        text:
          result.skipped && result.skipped.length > 0
            ? `${result.added} added. Skipped — ${result.skipped.join("; ")}`
            : `${result.added} image${result.added === 1 ? "" : "s"} added.`,
        // A partial success is still a problem to read, so it gets the longer
        // dwell an error gets rather than flashing past.
        tone: result.skipped && result.skipped.length > 0 ? "error" : "ok",
      });
      if (input.current) input.current.value = "";
      router.refresh();
    });
  }

  function move(index: number, delta: number) {
    const next = [...rows];
    const a = next[index];
    const b = next[index + delta];
    if (!a || !b) return;
    next[index] = b;
    next[index + delta] = a;
    start(async () => {
      const result = await reorderImages(productId, next.map((r) => r.id));
      if (!result.ok) {
        toast({ text: result.error, tone: "error" });
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Images</h2>
        <span className="text-xs text-muted">
          {rows.length === 0
            ? "none yet"
            : `${rows.length} · first one is the main photo`}
        </span>
      </div>

      {!durable ? (
        <p className="mt-2 rounded-md border border-warn bg-raised px-3 py-2 text-xs">
          <strong>Development storage.</strong> Images are written to disk in
          this project and will not survive a deploy. Set a storage provider
          before uploading a real catalog.
        </p>
      ) : null}

      {/*
        A label wrapping a hidden input, not a button calling .click() — this way
        the keyboard and screen-reader path is the platform's own, and the drop
        zone stays a single focusable control.
      */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) send(e.dataTransfer.files);
        }}
        className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center ${
          dragOver ? "border-accent bg-accent-soft" : "border-line"
        }`}
      >
        <input
          ref={input}
          id="product-images"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) send(e.target.files);
          }}
        />
        <span className="text-sm font-medium">
          {pending ? "Uploading…" : "Drop images here, or choose files"}
        </span>
        <span className="mt-1 text-xs text-muted">
          JPEG, PNG, WebP or AVIF · up to 8MB each · 12 per product
        </span>
      </label>

      {rows.length > 0 ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((row, index) => (
            <li
              key={row.id}
              className="overflow-hidden rounded-lg border border-line bg-raised"
            >
              <div className="relative aspect-square bg-sunken">
                {/*
                  A plain <img>, not next/image: these are admin thumbnails
                  behind auth, so the optimizer's cache buys nothing, and it
                  would 404 on a local-driver file the moment one is deleted.
                */}
                {/* eslint-disable-next-line @next/next/no-img-element --
                    next/image is wrong here: these thumbnails sit behind auth
                    so the optimizer's shared cache buys nothing, and on the
                    local driver it 404s the instant a file is deleted. */}
                <img
                  src={row.url}
                  alt={row.alt ?? ""}
                  loading="lazy"
                  className="h-full w-full object-contain"
                />
                {index === 0 ? (
                  <span className="absolute left-1.5 top-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-on-accent">
                    Main
                  </span>
                ) : null}
              </div>

              <div className="space-y-1.5 p-2">
                <input
                  defaultValue={row.alt ?? ""}
                  placeholder="Describe the photo"
                  aria-label={`Alt text for image ${index + 1}`}
                  maxLength={160}
                  // On blur, not on every keystroke: a round trip per character
                  // would be pointless traffic and a toast storm.
                  onBlur={(e) => {
                    if ((row.alt ?? "") === e.target.value.trim()) return;
                    start(async () => {
                      const result = await setImageAlt(productId, row.id, e.target.value);
                      if (!result.ok) toast({ text: result.error, tone: "error" });
                      else router.refresh();
                    });
                  }}
                  className="w-full rounded border border-line bg-surface px-1.5 py-1 text-xs"
                />
                <p className="text-[11px] text-muted">
                  {row.width && row.height ? `${row.width}×${row.height}` : "size unknown"}
                  {row.bytes ? ` · ${Math.round(row.bytes / 1024)}KB` : null}
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={pending || index === 0}
                    aria-label={`Move image ${index + 1} earlier`}
                    className="px-1 text-muted disabled:opacity-30"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={pending || index === rows.length - 1}
                    aria-label={`Move image ${index + 1} later`}
                    className="px-1 text-muted disabled:opacity-30"
                  >
                    →
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const result = await deleteImage(productId, row.id);
                        if (!result.ok) {
                          toast({ text: result.error, tone: "error" });
                          return;
                        }
                        toast({ text: "Image removed." });
                        router.refresh();
                      })
                    }
                    aria-label={`Remove image ${index + 1}`}
                    className="ml-auto text-[11px] text-warn underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
