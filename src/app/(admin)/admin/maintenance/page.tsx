import { Wrench } from "lucide-react";
import { ComingSoon } from "@/components/common/coming-soon";

export default function Page() {
  return <ComingSoon titleKey="nav.items.maintenance" icon={Wrench} phase={3} />;
}
