import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { getSupabaseAdmin } from "@/lib/supabase";

function parseReorderLevel(value: unknown) {
  if (value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error("Reorder level must be a whole number zero or greater.");
  }
  return number;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await authenticatePharmacyFromSessionCookie();
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const reorderLevel = parseReorderLevel(body.reorder_level);
    const supabase = getSupabaseAdmin();

    const existing = await supabase
      .from("products")
      .select("id")
      .eq("id", id)
      .eq("pharmacy_id", session.pharmacy.id)
      .maybeSingle();

    if (existing.error) throw existing.error;
    if (!existing.data) return NextResponse.json({ error: "Product not found for this pharmacy." }, { status: 404 });

    const result = await supabase
      .from("products")
      .update({ reorder_level: reorderLevel })
      .eq("id", id)
      .eq("pharmacy_id", session.pharmacy.id)
      .select("id, reorder_level")
      .single();

    if (result.error) throw result.error;

    revalidatePath("/");
    revalidatePath(`/products/${id}`);
    revalidatePath("/reports");
    revalidatePath("/notifications");

    return NextResponse.json({ product: result.data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update reorder level.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
