import { requireUser } from "../../lib/auth";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  await requireUser("/workspace");
  return children;
}
