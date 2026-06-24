import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/data";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const pharmacyId = url.searchParams.get("pharmacy_id") || "";

    if (!pharmacyId) {
      return NextResponse.json({ error: "Select a pharmacy before loading data." }, { status: 400 });
    }

    const data = await getDashboardData(pharmacyId);
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load pharmacy data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
