import { NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity-log";
import { backupValidationMetadata, validatePharmaStockBackup } from "@/lib/backup";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";

async function requireOwner() {
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) {
    return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }
  if (session.role !== "OWNER") {
    return { response: NextResponse.json({ error: "Only pharmacy owners can validate backups." }, { status: 403 }) };
  }

  return { session };
}

export async function POST(request: Request) {
  const auth = await requireOwner();
  if (auth.response) return auth.response;

  try {
    const backup = await request.json();
    const validation = validatePharmaStockBackup(backup, auth.session.pharmacy);

    if (validation.valid) {
      await recordActivity(
        { pharmacyId: auth.session.pharmacy.id, userId: auth.session.user.id, name: auth.session.user.full_name, role: auth.session.role },
        {
          action: "BACKUP_VALIDATED",
          entityType: "backup",
          description: "Validated a pharmacy backup file.",
          metadata: backupValidationMetadata(validation),
        },
      );
    }

    return NextResponse.json({ validation }, { status: 200 });
  } catch (error) {
    console.error("Unable to validate backup:", error);
    return NextResponse.json({ error: "Upload a valid PharmaStock backup JSON file." }, { status: 400 });
  }
}
