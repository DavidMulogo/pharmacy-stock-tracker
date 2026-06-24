import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type PharmacyInsert = Database["public"]["Tables"]["pharmacies"]["Insert"];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const pharmacyName = String(body.pharmacy_name || "").trim();
    const ownerName = String(body.owner_name || "").trim();
    const phone = String(body.phone || "").trim();

    if (!pharmacyName) {
      return NextResponse.json({ error: "Pharmacy name is required." }, { status: 400 });
    }

    if (!ownerName) {
      return NextResponse.json({ error: "Owner name is required." }, { status: 400 });
    }

    if (!phone) {
      return NextResponse.json({ error: "Phone is required." }, { status: 400 });
    }

    const payload: PharmacyInsert = {
      pharmacy_name: pharmacyName,
      owner_name: ownerName,
      phone,
    };
    const supabase = getSupabaseAdmin();
    const result = await supabase.from("pharmacies").insert(payload).select("*").single();

    if (result.error) throw result.error;

    revalidatePath("/");
    return NextResponse.json({ pharmacy: result.data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create pharmacy.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
