import { SqliteNotificationRepository } from "../platform/adapters/sqlite/notification-repository";
import { NotificationService, RecoveryLinkSigner } from "../platform/modules/notifications";
import { getDatabase } from "./auth";
import { ensureExecutionSchema } from "./execution";
import { sendNotificationEmail } from "./email";

let repository:SqliteNotificationRepository|undefined,service:NotificationService|undefined;
export async function notificationService(){await ensureExecutionSchema();repository??=new SqliteNotificationRepository(getDatabase());repository.ensureSchema();const secret=process.env.NOTIFICATION_RECOVERY_SIGNING_SECRET;if(!secret)throw new Error("NOTIFICATION_RECOVERY_NOT_CONFIGURED");return service??=new NotificationService(repository,new RecoveryLinkSigner(secret));}
export const notificationEmailSender={send:(input:{recipient:string;title:string;body:string;recoveryUrl:string|null;locale:"zh-CN"|"en"})=>sendNotificationEmail({to:input.recipient,title:input.title,body:input.body,recoveryUrl:input.recoveryUrl,locale:input.locale})};
