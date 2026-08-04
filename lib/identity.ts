import { cookies } from "next/headers";
import { SqliteIdentityAuthRepository } from "../platform/adapters/sqlite/identity-auth-repository";
import { IdentityAuthenticationService, IdentityError } from "../platform/modules/identity/authentication";
import { ensureAuthSchema, getDatabase, isAdminEmail, SESSION_COOKIE, writeAudit } from "./auth";
import { validEmailCode } from "./email-code";
import { hashPassword, validatePassword, verifyPassword } from "./password";

export { IdentityError };

export async function identityService(request: Request): Promise<IdentityAuthenticationService> {
  const database = getDatabase();
  await ensureAuthSchema(database);
  return new IdentityAuthenticationService(
    new SqliteIdentityAuthRepository(database),
    { hash: hashPassword, verify: verifyPassword, validate: validatePassword },
    { verify: (email,purpose,code) => validEmailCode(email,purpose,code,request) },
    { record: (action,accountId,detail) => writeAudit(action,accountId,request,detail) },
    isAdminEmail,
  );
}

export async function currentSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}
