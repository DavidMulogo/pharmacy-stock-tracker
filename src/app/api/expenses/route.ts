import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getExpensesForPharmacy } from "@/lib/data";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { ExpenseCategory } from "@/lib/types";

type ExpenseInsert = Database["public"]["Tables"]["expenses"]["Insert"];

const expenseCategories: ExpenseCategory[] = ["Rent", "Salary", "Electricity", "Water", "Internet", "Transport", "Repairs", "Supplies", "Other"];

function text(value: unknown) {
  return String(value || "").trim();
}

function isExpenseCategory(value: string): value is ExpenseCategory {
  return expenseCategories.includes(value as ExpenseCategory);
}

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function requireExpenseAccess() {
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) {
    return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }
  if (session.role === "TECHNICIAN") {
    return { response: NextResponse.json({ error: "Technicians cannot view or add expenses." }, { status: 403 }) };
  }
  return { session };
}

export async function GET(request: Request) {
  const auth = await requireExpenseAccess();
  if (auth.response) return auth.response;

  try {
    const url = new URL(request.url);
    const month = text(url.searchParams.get("month"));
    const expenses = await getExpensesForPharmacy(auth.session.pharmacy.id, month);

    return NextResponse.json({ expenses }, { status: 200 });
  } catch (error) {
    console.error("Unable to load expenses:", error);
    return NextResponse.json({ error: "Unable to load expenses." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireExpenseAccess();
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const expenseDate = text(body.expense_date);
    const category = text(body.category);
    const description = text(body.description);
    const amount = Number(body.amount);

    if (!isValidIsoDate(expenseDate)) {
      return NextResponse.json({ error: "Enter a valid expense date." }, { status: 400 });
    }

    if (!isExpenseCategory(category)) {
      return NextResponse.json({ error: "Choose a valid expense category." }, { status: 400 });
    }

    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "Expense amount cannot be negative." }, { status: 400 });
    }

    const payload: ExpenseInsert = {
      pharmacy_id: auth.session.pharmacy.id,
      expense_date: expenseDate,
      category,
      description,
      amount,
      created_by: auth.session.user.id,
    };
    const supabase = getSupabaseAdmin();
    const result = await supabase.from("expenses").insert(payload).select("*").single();

    if (result.error) throw result.error;

    revalidatePath("/");
    revalidatePath("/expenses");
    return NextResponse.json({ expense: result.data }, { status: 201 });
  } catch (error) {
    console.error("Unable to add expense:", error);
    return NextResponse.json({ error: "Unable to add expense." }, { status: 500 });
  }
}
