import { getDashboardData, getPharmacies } from "@/lib/data";
import { PharmacyApp } from "@/app/pharmacy-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const isDebugMode = process.env.NODE_ENV !== "production";
  const pharmacies = isDebugMode ? await getPharmacies() : [];
  const initialPharmacyId = isDebugMode ? pharmacies[0]?.id || "" : "";
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
