import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/data";
import { syncNotificationsForPharmacy } from "@/lib/notifications";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";

export async function GET() {
  try {
    const session = await authenticatePharmacyFromSessionCookie();

    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    await syncNotificationsForPharmacy(session.pharmacy);
    const data = await getDashboardData(session.pharmacy.id, { includeFinancials: session.role !== "TECHNICIAN" });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load pharmacy data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
