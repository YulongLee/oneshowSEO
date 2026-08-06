import { requireOperatorConsole } from "../../lib/operator-administration";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireOperatorConsole();
  return children;
}
