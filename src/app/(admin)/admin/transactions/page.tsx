import { ClipboardList } from "lucide-react";
import { ComingSoon } from "@/components/common/coming-soon";

export default function Page() {
  return <ComingSoon titleKey="nav.items.transactions" icon={ClipboardList} phase={2} />;
}
