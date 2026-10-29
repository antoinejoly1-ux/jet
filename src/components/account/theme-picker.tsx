import { Check } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { THEMES, type Theme } from "@/lib/theme";

/**
 * A miniature of the portal in each look: a rail, a hero band and two rows.
 * Raw colours on purpose: each swatch previews its own palette whatever the current theme.
 */
function Swatch({ theme }: { theme: Theme }) {
  const pane = (dark: boolean) => (
    <span className={cn("flex size-full gap-1.5 p-2", dark ? "bg-[#0c0b0a]" : "bg-[#f5f2ec]")}>
      <span className={cn("w-2.5 rounded-sm", dark ? "bg-[#1b1a17]" : "bg-white")} />
      <span className="flex flex-1 flex-col gap-1.5">
        <span className={cn("h-7 rounded-sm", dark ? "bg-[#2a2723]" : "bg-[#e5dfd5]")} />
        <span className={cn("h-1.5 w-3/4 rounded-full", dark ? "bg-[#d2b48c]" : "bg-[#7a5530]")} />
        <span className={cn("h-1.5 w-1/2 rounded-full", dark ? "bg-[#a8a196]/50" : "bg-[#625c54]/40")} />
      </span>
    </span>
  );
  return (
    <span className="border-border relative block aspect-[16/10] overflow-hidden rounded-md border" aria-hidden>
      {theme === "system" ? (
        <span className="flex size-full">
          <span className="w-1/2 overflow-hidden">
            <span className="block h-full w-[200%]">{pane(true)}</span>
          </span>
          <span className="w-1/2 overflow-hidden">
            <span className="-ml-[100%] block h-full w-[200%]">{pane(false)}</span>
          </span>
        </span>
      ) : (
        pane(theme === "dark")
      )}
    </span>
  );
}

/** Three visual choices; each is a submit button, so it works before any script loads. */
export async function ThemePicker({ current, action }: { current: Theme; action: (d: FormData) => Promise<void> }) {
  const t = await getTranslations("account.themes");
  return (
    <form action={action} className="grid grid-cols-3 gap-3 sm:gap-4">
      {THEMES.map((theme) => {
        const on = theme === current;
        return (
          <button
            key={theme}
            type="submit"
            name="theme"
            value={theme}
            aria-pressed={on}
            className={cn(
              "group flex flex-col gap-3 rounded-lg p-1.5 text-left transition-colors",
              on ? "ring-accent ring-1" : "hover:bg-surface-muted",
            )}
          >
            <Swatch theme={theme} />
            <span className="flex items-start justify-between gap-2 px-1 pb-1">
              <span>
                <span className="block text-sm font-medium">{t(`${theme}.label`)}</span>
                <span className="text-muted hidden text-xs sm:block">{t(`${theme}.hint`)}</span>
              </span>
              {on ? <Check className="text-accent mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden /> : null}
            </span>
          </button>
        );
      })}
    </form>
  );
}
