import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { listBackups } from "@/lib/backup";
import { PageHeader } from "@/components/layout/page-header";
import { BackupManager } from "@/components/manager/backup-manager";

export const metadata: Metadata = { title: "Backup" };

export default async function BackupPage() {
  await requireRole("MANAGER");
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const backups = await listBackups();

  return (
    <div>
      <PageHeader title={dict.backup.title} description={dict.backup.subtitle} />
      <BackupManager backups={backups} dict={dict} locale={locale} />
    </div>
  );
}
