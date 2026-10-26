import { Wallet } from "lucide-react";
import { ComingSoon } from "@/components/common/coming-soon";

export default function Page() {
  return <ComingSoon titleKey="nav.items.finances" icon={Wallet} phase={2} />;
}
