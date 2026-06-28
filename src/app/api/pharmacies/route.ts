import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type PharmacyInsert = Database["public"]["Tables"]["pharmacies"]["Insert"];
type PharmacyAccessInsert = Database["public"]["Tables"]["pharmacy_access"]["Insert"];

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Pharmacy creation is only available in development admin mode." }, { status: 403 });
    }

    const body = await request.json();
    const pharmacyName = String(body.pharmacy_name || "").trim();
    const ownerName = String(body.owner_name || "").trim();
    const phone = String(body.phone || "").trim();
    const pharmacyCode = String(body.pharmacy_code || "").trim();
    const password = String(body.password || "");

    if (!pharmacyName) {
      return NextResponse.json({ error: "Pharmacy name is required." }, { status: 400 });
    }

    if (!ownerName) {
      return NextResponse.json({ error: "Owner name is required." }, { status: 400 });
    }

    if (!phone) {
      return NextResponse.json({ error: "Phone is required." }, { status: 400 });
    }

    if (!pharmacyCode) {
      return NextResponse.json({ error: "Pharmacy code is required." }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ error: "Pharmacy password is required." }, { status: 400 });
    }

    const payload: PharmacyInsert = {
      pharmacy_name: pharmacyName,
      owner_name: ownerName,
      phone,
    };
    const supabase = getSupabaseAdmin();
    const result = await supabase.from("pharmacies").insert(payload).select("*").single();

    if (result.error) throw result.error;

    const accessPayload: PharmacyAccessInsert = {
      pharmacy_id: result.data.id,
      pharmacy_code: pharmacyCode,
      password,
    };
    const accessResult = await supabase.from("pharmacy_access").insert(accessPayload).select("id").single();

    if (accessResult.error) throw accessResult.error;

    revalidatePath("/");
    return NextResponse.json({ pharmacy: result.data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create pharmacy.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
