import { redirect } from "next/navigation";
import { NotificationsClient } from "@/app/notifications/notifications-client";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { getNotificationCounts, getNotificationsForPharmacy, syncNotificationsForPharmacy } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) redirect("/");

  await syncNotificationsForPharmacy(session.pharmacy);
  const [notifications, counts] = await Promise.all([
    getNotificationsForPharmacy(session.pharmacy.id, session.role, "all"),
    getNotificationCounts(session.pharmacy.id, session.role),
  ]);

  return (
    <NotificationsClient
      initialCounts={counts}
      initialNotifications={notifications}
      pharmacyName={session.pharmacy.pharmacy_name}
      role={session.role}
    />
  );
}
