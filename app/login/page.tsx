import { AuthForm } from "../auth/AuthForm";
import { getCurrentUser } from "../../lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/workspace");
  return <AuthForm key="login" mode="login" />;
}
