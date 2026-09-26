"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function Autocomplete<T>({
  value,
  onValueChange,
  onSelect,
  fetcher,
  getLabel,
  getKey,
  placeholder,
  className,
  inputClassName,
  minChars = 1,
  debounceMs = 200,
  id,
}: {
  value: string;
  onValueChange: (v: string) => void;
  onSelect: (item: T) => void;
  fetcher: (q: string) => Promise<T[]>;
  getLabel: (item: T) => string;
  getKey: (item: T) => string;
  placeholder?: string;
  className?: string;
  /** Extra classes for the <input> itself (e.g. a compact height). */
  inputClassName?: string;
  minChars?: number;
  /** Wait before calling `fetcher`. Use 0 for in-memory (synchronous) sources. */
  debounceMs?: number;
  id?: string;
}) {
  const [items, setItems] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const query = value.trim();
  // Results are only meaningful once the query is long enough; gating the
  // render (instead of clearing state in the effect) keeps the effect pure.
  const active = query.length >= minChars;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetcher(query);
        if (!cancelled) {
          setItems(res);
          setOpen(true);
        }
      } catch {
        /* ignore */
      }
    };
    const id = debounceMs > 0 ? setTimeout(run, debounceMs) : null;
    if (id === null) void run();
    return () => {
      cancelled = true;
      if (id !== null) clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, active]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const showList = open && active && items.length > 0;

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <input
        id={id}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onFocus={() => items.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className={cn(
          "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          inputClassName
        )}
      />
      {showList && (
        <ul className="suggestion-list scroll-quiet absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border p-1 shadow-xl">
          {items.map((it) => (
            <li key={getKey(it)}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(it);
                  setOpen(false);
                }}
                className="flex w-full items-center rounded-md px-2 py-1.5 text-start text-sm transition-colors hover:bg-brand/20 hover:text-foreground"
              >
                {getLabel(it)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
