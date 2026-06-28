import { getDashboardData, getPharmacies } from "@/lib/data";
import { PharmacyApp } from "@/app/pharmacy-app";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const isDebugMode = process.env.NODE_ENV !== "production";
  const session = await authenticatePharmacyFromSessionCookie();
  const debugPharmacies = isDebugMode ? await getPharmacies() : [];
  const pharmacies = session ? [session.pharmacy, ...debugPharmacies.filter((pharmacy) => pharmacy.id !== session.pharmacy.id)] : debugPharmacies;
  const initialPharmacyId = session?.pharmacy.id || (isDebugMode ? pharmacies[0]?.id || "" : "");
  const data = await getDashboardData(initialPharmacyId);

  return (
    <PharmacyApp
      initialData={data}
      initialPharmacies={pharmacies}
      initialPharmacyId={initialPharmacyId}
      isDebugMode={isDebugMode}
    />
  );
}
