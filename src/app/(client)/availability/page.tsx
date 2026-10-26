import { CalendarDays } from "lucide-react";
import { ComingSoon } from "@/components/common/coming-soon";

export default function Page() {
  return <ComingSoon titleKey="nav.items.availability" icon={CalendarDays} phase={3} />;
}
