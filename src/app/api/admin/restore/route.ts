import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/admin-session";
import {
  backupForRpc,
  buildAdminRestorePreview,
  getAdminRestoreTarget,
  logAdminRestoreActivity,
  parseRestoreRpcResult,
  requestTooLarge,
} from "@/lib/admin-restore";
import { getSupabaseAdmin } from "@/lib/supabase";

function text(value: unknown) {
  return String(value || "").trim();
}

function responseMessage(error: unknown) {
  const candidate = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown } | null | undefined;
  return candidate?.message ? String(candidate.message) : error instanceof Error ? error.message : "Unable to restore backup.";
}

export async function POST(request: Request) {
  const admin = await requireAdminSession("api/admin/restore POST");
  if (admin instanceof NextResponse) return admin;

  if (requestTooLarge(request)) {
    return NextResponse.json({ error: "Backup upload is too large. Maximum size is 10 MB." }, { status: 413 });
  }

  let targetPharmacy: Awaited<ReturnType<typeof getAdminRestoreTarget>> | null = null;
  let backupChecksum: string | null = null;

  try {
    const body = await request.json();
    const mode = text(body.mode);
    const pharmacyId = text(body.pharmacy_id);
    const confirmation = text(body.confirmation);
    const backup = body.backup;

    if (mode !== "dry-run" && mode !== "restore") {
      return NextResponse.json({ error: "Choose dry-run or restore mode." }, { status: 400 });
    }
    if (!pharmacyId) {
      return NextResponse.json({ error: "Select a target pharmacy." }, { status: 400 });
    }

    targetPharmacy = await getAdminRestoreTarget(pharmacyId);
    if (!targetPharmacy) {
      await logAdminRestoreActivity({
        admin,
        targetPharmacy: null,
        backupChecksum: null,
        success: false,
        errorMessage: "Target pharmacy was not found.",
      });
      return NextResponse.json({ error: "Target pharmacy was not found." }, { status: 404 });
    }

    const preview = await buildAdminRestorePreview(targetPharmacy.pharmacy, targetPharmacy.confirmationLabel, backup);
    backupChecksum = preview.checksum;

    if (mode === "dry-run") {
      return NextResponse.json({ preview }, { status: 200 });
    }

    if (!preview.can_restore) {
      await logAdminRestoreActivity({
        admin,
        targetPharmacy: targetPharmacy.pharmacy,
        backupChecksum,
        restoredCounts: {},
        skippedCounts: preview.skipped_counts,
        success: false,
        errorMessage: preview.validation.errors.join(" "),
      });
      return NextResponse.json({ error: "Backup validation failed.", preview }, { status: 400 });
    }

    if (confirmation !== targetPharmacy.confirmationLabel) {
      await logAdminRestoreActivity({
        admin,
        targetPharmacy: targetPharmacy.pharmacy,
        backupChecksum,
        restoredCounts: {},
        skippedCounts: preview.skipped_counts,
        success: false,
        errorMessage: "Restore confirmation did not match.",
      });
      return NextResponse.json({ error: "Type the pharmacy code or pharmacy name exactly to restore." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const restoreResult = await supabase.rpc("restore_pharmastock_backup_v1", {
      p_target_pharmacy_id: targetPharmacy.pharmacy.id,
      p_backup: backupForRpc(backup),
      p_fail_after: null,
    });

    if (restoreResult.error) throw restoreResult.error;

    const restored = parseRestoreRpcResult(restoreResult.data);
    await logAdminRestoreActivity({
      admin,
      targetPharmacy: targetPharmacy.pharmacy,
      backupChecksum,
      restoredCounts: restored.restored_counts,
      skippedCounts: restored.skipped_counts,
      success: true,
    });

    revalidatePath("/admin");
    revalidatePath("/");
    revalidatePath("/reports");
    revalidatePath("/backup");

    return NextResponse.json({ restored, message: "Backup restored without overwriting existing records." }, { status: 200 });
  } catch (error) {
    console.error("Admin backup restore failed:", error);
    const errorMessage = responseMessage(error);

    try {
      await logAdminRestoreActivity({
        admin,
        targetPharmacy: targetPharmacy?.pharmacy || null,
        backupChecksum,
        success: false,
        errorMessage,
      });
    } catch (logError) {
      console.error("Admin restore failure audit log failed:", logError);
    }

    return NextResponse.json({ error: "Unable to restore backup." }, { status: 500 });
  }
}
