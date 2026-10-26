import type { ReactNode } from "react";

/** Centered card layout for sign-in, sign-up and the other account screens. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <p className="mb-8 text-xl font-extrabold tracking-tight">Jet</p>
      <div className="border-border bg-surface w-full max-w-sm rounded-lg border p-6 shadow-sm sm:p-8">{children}</div>
    </div>
  );
}
