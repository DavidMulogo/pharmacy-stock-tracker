import { NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity-log";
import { buildPharmacyBackup, getPharmacyBackupFilename } from "@/lib/backup";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";

async function requireOwner() {
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) {
    return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }
  if (session.role !== "OWNER") {
    return { response: NextResponse.json({ error: "Only pharmacy owners can export backups." }, { status: 403 }) };
  }

  return { session };
}

export async function POST() {
  const auth = await requireOwner();
  if (auth.response) return auth.response;

  try {
    const backup = await buildPharmacyBackup(auth.session.pharmacy);
    const filename = await getPharmacyBackupFilename(auth.session.pharmacy.id, auth.session.pharmacy.pharmacy_name);

    await recordActivity(
      { pharmacyId: auth.session.pharmacy.id, userId: auth.session.user.id, name: auth.session.user.full_name, role: auth.session.role },
      {
        action: "BACKUP_EXPORTED",
        entityType: "backup",
        description: "Exported a pharmacy backup.",
        metadata: {
          filename,
          schema_version: backup.schema_version,
          record_counts: backup.record_counts,
          checksum: backup.checksum,
        },
      },
    );

    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Unable to export backup:", error);
    return NextResponse.json({ error: "Unable to export backup." }, { status: 500 });
  }
}
