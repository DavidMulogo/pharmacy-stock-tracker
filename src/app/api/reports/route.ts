import { NextResponse } from "next/server";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { canAccessReport, getReportData, isReportType } from "@/lib/reports";
import type { ExpiryStatus } from "@/lib/types";

const expiryStatuses: Array<ExpiryStatus | "ALL"> = ["ALL", "EXPIRED", "EXPIRING SOON", "OK"];

function defaultMonthRange() {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  return {
    from: start.toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  };
}

function dateParam(value: string | null, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function expiryStatusParam(value: string | null): ExpiryStatus | "ALL" {
  return expiryStatuses.includes(value as ExpiryStatus | "ALL") ? (value as ExpiryStatus | "ALL") : "ALL";
}

export async function GET(request: Request) {
  try {
    const session = await authenticatePharmacyFromSessionCookie();

    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const url = new URL(request.url);
    const reportType = url.searchParams.get("type") || "";

    if (!isReportType(reportType)) {
      return NextResponse.json({ error: "Choose a valid report." }, { status: 400 });
    }

    if (!canAccessReport(session.role, reportType)) {
      return NextResponse.json({ error: "You do not have permission to view this report." }, { status: 403 });
    }

    const defaults = defaultMonthRange();
    const filters = {
      from: dateParam(url.searchParams.get("from"), defaults.from),
      to: dateParam(url.searchParams.get("to"), defaults.to),
      expiryStatus: expiryStatusParam(url.searchParams.get("expiryStatus")),
    };
    const report = await getReportData(session.pharmacy.id, reportType, filters);

    return NextResponse.json({ report }, { status: 200 });
  } catch (error) {
    console.error("Unable to load report:", error);
    return NextResponse.json({ error: "Unable to load report." }, { status: 500 });
  }
}
