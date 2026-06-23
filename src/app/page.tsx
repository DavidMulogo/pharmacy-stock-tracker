import { getDashboardData } from "@/lib/data";
import { PharmacyApp } from "@/app/pharmacy-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getDashboardData();
  return <PharmacyApp initialData={data} />;
}
