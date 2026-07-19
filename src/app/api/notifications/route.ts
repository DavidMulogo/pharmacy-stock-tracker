import { NextResponse } from "next/server";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import {
  getNotificationCounts,
  getNotificationsForPharmacy,
  markAllNotificationsRead,
  markNotificationRead,
  syncNotificationsForPharmacy,
} from "@/lib/notifications";
import type { NotificationFilter } from "@/lib/types";

const filters: NotificationFilter[] = ["all", "unread", "inventory", "expiry", "subscription", "resolved"];

function getFilter(value: string | null): NotificationFilter {
  return filters.includes(value as NotificationFilter) ? (value as NotificationFilter) : "all";
}

export async function GET(request: Request) {
  try {
    const session = await authenticatePharmacyFromSessionCookie();
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    await syncNotificationsForPharmacy(session.pharmacy);
    const filter = getFilter(new URL(request.url).searchParams.get("filter"));
    const [notifications, counts] = await Promise.all([
      getNotificationsForPharmacy(session.pharmacy.id, session.role, filter),
      getNotificationCounts(session.pharmacy.id, session.role),
    ]);

    return NextResponse.json({ notifications, counts }, { status: 200 });
  } catch (error) {
    console.error("Unable to load notifications:", error);
    return NextResponse.json({ error: "Unable to load notifications." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await authenticatePharmacyFromSessionCookie();
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const body = await request.json();
    const action = String(body.action || "").trim();

    if (action === "refresh") {
      await syncNotificationsForPharmacy(session.pharmacy);
    } else if (action === "mark_read") {
      const id = String(body.id || "").trim();
      if (!id) return NextResponse.json({ error: "Notification id is required." }, { status: 400 });
      const updated = await markNotificationRead(session.pharmacy.id, session.role, id);
      if (!updated) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    } else if (action === "mark_all_read") {
      await markAllNotificationsRead(session.pharmacy.id, session.role);
    } else {
      return NextResponse.json({ error: "Unsupported notification action." }, { status: 400 });
    }

    const [notifications, counts] = await Promise.all([
      getNotificationsForPharmacy(session.pharmacy.id, session.role, getFilter(String(body.filter || "all"))),
      getNotificationCounts(session.pharmacy.id, session.role),
    ]);
    return NextResponse.json({ notifications, counts }, { status: 200 });
  } catch (error) {
    console.error("Unable to update notifications:", error);
    return NextResponse.json({ error: "Unable to update notifications." }, { status: 500 });
  }
}
