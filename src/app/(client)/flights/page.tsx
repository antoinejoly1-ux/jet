import { PlaneTakeoff } from "lucide-react";
import { ComingSoon } from "@/components/common/coming-soon";

export default function Page() {
  return <ComingSoon titleKey="nav.items.flights" icon={PlaneTakeoff} phase={3} />;
}
