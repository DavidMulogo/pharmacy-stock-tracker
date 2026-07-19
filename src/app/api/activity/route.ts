import { NextResponse } from "next/server";
import { getActivityLogs } from "@/lib/activity-log";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import type { ActivityLogAction } from "@/lib/types";

const activityActions: ActivityLogAction[] = ["LOGIN", "LOGOUT", "SALE_CREATED", "STOCK_ADDED", "PRODUCTS_IMPORTED", "STOCK_IMPORTED", "EXPENSE_CREATED", "SETTINGS_UPDATED", "STAFF_CREATED", "STAFF_UPDATED", "STAFF_DEACTIVATED", "STAFF_REACTIVATED", "STAFF_PASSWORD_RESET", "REPORT_EXPORTED"];

function activityAction(value: string | null): ActivityLogAction | undefined {
  return activityActions.includes(value as ActivityLogAction) ? (value as ActivityLogAction) : undefined;
}

export async function GET(request: Request) {
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.role !== "OWNER") {
    return NextResponse.json({ error: "Only pharmacy owners can view activity logs." }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const logs = await getActivityLogs(session.pharmacy.id, {
      action: activityAction(url.searchParams.get("action")),
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      limit: 500,
    });
    return NextResponse.json({ logs }, { status: 200 });
  } catch (error) {
    console.error("Unable to load activity logs:", error);
    return NextResponse.json({ error: "Unable to load activity logs." }, { status: 500 });
  }
}
