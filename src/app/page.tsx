import { getDashboardData, getPharmacies } from "@/lib/data";
import { PharmacyApp } from "@/app/pharmacy-app";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { getOnboardingSummary } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export default async function Home() {
  const isDebugMode = process.env.NODE_ENV !== "production";
  const session = await authenticatePharmacyFromSessionCookie();
  const debugPharmacies = isDebugMode ? await getPharmacies() : [];
  const pharmacies = session ? [session.pharmacy, ...debugPharmacies.filter((pharmacy) => pharmacy.id !== session.pharmacy.id)] : debugPharmacies;
  const initialPharmacyId = session?.pharmacy.id || (isDebugMode ? pharmacies[0]?.id || "" : "");
  const [data, onboarding] = await Promise.all([
    getDashboardData(initialPharmacyId, { includeFinancials: session?.role !== "TECHNICIAN" }),
    session?.role === "OWNER" ? getOnboardingSummary(session.pharmacy.id) : Promise.resolve(null),
  ]);

  return (
    <PharmacyApp
      initialData={data}
      initialPharmacies={pharmacies}
      initialPharmacyId={initialPharmacyId}
      initialUser={session?.user || null}
      initialOnboarding={onboarding}
      isDebugMode={isDebugMode}
    />
  );
}
