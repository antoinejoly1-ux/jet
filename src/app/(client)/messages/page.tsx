import { MessageSquare } from "lucide-react";
import { ComingSoon } from "@/components/common/coming-soon";

export default function Page() {
  return <ComingSoon titleKey="nav.items.messages" icon={MessageSquare} phase={4} />;
}
