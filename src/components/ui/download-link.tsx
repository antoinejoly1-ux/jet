import { Download } from "lucide-react";
import { Button } from "./button";

/** A file download styled as a small secondary button. Plain <a>: the browser handles the file. */
export function DownloadLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button asChild size="sm" variant="secondary">
      <a href={href} download>
        <Download aria-hidden />
        {children}
      </a>
    </Button>
  );
}
