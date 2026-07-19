import { getDashboardData, getPharmacies } from "@/lib/data";
import { PharmacyApp } from "@/app/pharmacy-app";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { getOnboardingSummary } from "@/lib/onboarding";
import { getNotificationCounts, syncNotificationsForPharmacy } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export default async function Home() {
  const isDebugMode = process.env.NODE_ENV !== "production";
  const session = await authenticatePharmacyFromSessionCookie();
  const debugPharmacies = isDebugMode ? await getPharmacies() : [];
  const pharmacies = session ? [session.pharmacy, ...debugPharmacies.filter((pharmacy) => pharmacy.id !== session.pharmacy.id)] : debugPharmacies;
  const initialPharmacyId = session?.pharmacy.id || (isDebugMode ? pharmacies[0]?.id || "" : "");
  if (session) await syncNotificationsForPharmacy(session.pharmacy);
  const [data, onboarding, notificationCounts] = await Promise.all([
    getDashboardData(initialPharmacyId, { includeFinancials: session?.role !== "TECHNICIAN" }),
    session?.role === "OWNER" ? getOnboardingSummary(session.pharmacy.id) : Promise.resolve(null),
    session ? getNotificationCounts(session.pharmacy.id, session.role) : Promise.resolve(null),
  ]);

  return (
    <PharmacyApp
      initialData={data}
      initialPharmacies={pharmacies}
      initialPharmacyId={initialPharmacyId}
      initialUser={session?.user || null}
      initialOnboarding={onboarding}
      initialNotificationCounts={notificationCounts}
      isDebugMode={isDebugMode}
    />
  );
}
