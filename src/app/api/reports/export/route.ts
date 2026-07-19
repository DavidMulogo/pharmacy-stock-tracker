import { NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity-log";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { canAccessReport, isReportType } from "@/lib/reports";

function text(value: unknown) {
  return String(value || "").trim();
}

export async function POST(request: Request) {
  try {
    const session = await authenticatePharmacyFromSessionCookie();

    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await request.json();
    const reportType = text(body.type);

    if (!isReportType(reportType)) {
      return NextResponse.json({ error: "Choose a valid report to export." }, { status: 400 });
    }

    if (!canAccessReport(session.role, reportType)) {
      return NextResponse.json({ error: "You do not have permission to export this report." }, { status: 403 });
    }

    await recordActivity(
      { pharmacyId: session.pharmacy.id, userId: session.user.id, name: session.user.full_name, role: session.role },
      {
        action: "REPORT_EXPORTED",
        entityType: "report",
        entityId: reportType,
        description: `Exported the ${reportType} report.`,
        metadata: {
          report_type: reportType,
          filters: body.filters || {},
        },
      },
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("Unable to log report export:", error);
    return NextResponse.json({ error: "Unable to export report." }, { status: 500 });
  }
}
