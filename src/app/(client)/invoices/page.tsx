import { FileText } from "lucide-react";
import { ComingSoon } from "@/components/common/coming-soon";

export default function Page() {
  return <ComingSoon titleKey="nav.items.invoices" icon={FileText} phase={2} />;
}
