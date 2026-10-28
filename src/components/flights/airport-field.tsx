"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { airportLabel } from "@/lib/airport-label";
import { cn } from "@/lib/utils";

type Suggestion = { icao: string; name: string; city: string };

/**
 * An airport picker: type a code, a city or a name ("montreal", "KTEB",
 * "Teterboro") and choose from the list. The form receives the ICAO code; the
 * airport's name shows under the field so a typo can't slip through.
 * Keyboard: ↑ ↓ to move, Enter to choose, Esc to close (ARIA combobox pattern).
 */
export function AirportField({
  name,
  label,
  defaultValue = "",
  defaultLabel = "",
  placeholder,
  required,
  error,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  /** "Saint-Hubert · Montréal Saint-Hubert Longueuil" for the default code. */
  defaultLabel?: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
}) {
  const id = useId();
  const [text, setText] = useState(defaultValue);
  const [code, setCode] = useState(defaultValue);
  const [chosen, setChosen] = useState(defaultLabel);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const search = (q: string) => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/airports?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          setItems((await res.json()) as Suggestion[]);
          setActive(0);
          setOpen(true);
        }
      } catch {
        // Offline: the typed code still goes through and the server checks it.
      }
    }, 160);
  };

  const choose = (s: Suggestion) => {
    setText(s.icao);
    setCode(s.icao);
    setChosen(airportLabel(s));
    setOpen(false);
  };

  return (
    <div className="relative flex flex-col gap-1.5" data-field={name}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && items[active] ? `${id}-${items[active]!.icao}` : undefined}
        aria-describedby={`${id}-chosen`}
        aria-invalid={error ? true : undefined}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder={placeholder}
        required={required}
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          // A typed 4-letter code counts as chosen until a suggestion replaces it.
          setCode(/^[a-z0-9]{3,4}$/i.test(v.trim()) ? v.trim().toUpperCase() : "");
          setChosen("");
          search(v);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!open || items.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % items.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + items.length) % items.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(items[active]!);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      <input type="hidden" name={name} value={code} />
      <p id={`${id}-chosen`} className={cn("min-h-4 truncate text-xs", error ? "text-danger" : "text-muted")}>
        {error ?? chosen}
      </p>
      {open && items.length ? (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className="border-border bg-surface shadow-float absolute top-[4.6rem] right-0 left-0 z-50 max-h-72 overflow-y-auto rounded-[14px] border p-1"
        >
          {items.map((s, i) => (
            <li
              key={s.icao}
              id={`${id}-${s.icao}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-baseline gap-3 rounded-[10px] px-3 py-2.5",
                i === active && "bg-surface-muted",
              )}
            >
              <span className="tabular w-12 shrink-0 text-sm font-medium">{s.icao}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm">{s.city || s.name}</span>
                <span className="text-muted block truncate text-xs">{s.name}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
