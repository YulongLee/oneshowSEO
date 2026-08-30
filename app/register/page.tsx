import { AuthForm } from "../auth/AuthForm";
import { getCurrentUser } from "../../lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/workspace");
  return <AuthForm key="register" mode="register" />;
}
