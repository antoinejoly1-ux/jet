import Link from "next/link";
import type { ReactNode } from "react";
import { ProductMark } from "@/components/brand/logo";

/** Pages anyone can read, signed in or not: a plain column with the wordmark. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-10 sm:px-6">
      <Link href="/" className="mb-10">
        <ProductMark />
      </Link>
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
