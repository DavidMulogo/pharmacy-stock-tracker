"use client";

import { useMemo, useState } from "react";
import { formatDate, formatTZS } from "@/lib/format";
import type { Expense, ExpenseCategory } from "@/lib/types";

const expenseCategories: ExpenseCategory[] = ["Rent", "Salary", "Electricity", "Water", "Internet", "Transport", "Repairs", "Supplies", "Other"];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseError(data: { error?: unknown; message?: unknown }) {
  if (typeof data.error === "string") return data.error;
  if (data.error && typeof data.error === "object" && "message" in data.error && typeof data.error.message === "string") return data.error.message;
  if (typeof data.message === "string") return data.message;
  return "Unable to save expense.";
}

export function ExpensesClient({
  initialExpenses,
  initialMonth,
}: {
  initialExpenses: Expense[];
  initialMonth: string;
}) {
  const [expenses, setExpenses] = useState(initialExpenses);
  const [month, setMonth] = useState(initialMonth);
  const [expenseDate, setExpenseDate] = useState(todayIsoDate());
  const [category, setCategory] = useState<ExpenseCategory>("Rent");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const totalExpenses = useMemo(() => expenses.reduce((total, expense) => total + expense.amount, 0), [expenses]);
  const amountNumber = Number(amount);
  const formInvalid = !expenseDate || !category || amount.trim() === "" || !Number.isFinite(amountNumber) || amountNumber < 0;

  async function loadExpenses(nextMonth = month) {
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/expenses?month=${encodeURIComponent(nextMonth)}`, { credentials: "include" });
      const data = await response.json();

      if (!response.ok) {
        setMessageType("error");
        setMessage(parseError(data));
        return;
      }

      setExpenses(data.expenses as Expense[]);
    } catch {
      setMessageType("error");
      setMessage("Unable to load expenses. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function submitExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (formInvalid) {
      setMessageType("error");
      setMessage("Enter a valid date, category, and non-negative amount.");
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expense_date: expenseDate,
          category,
          description,
          amount: amountNumber,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessageType("error");
        setMessage(parseError(data));
        return;
      }

      setDescription("");
      setAmount("");
      setMessageType("success");
      setMessage("Expense saved.");
      await loadExpenses(month);
    } catch {
      setMessageType("error");
      setMessage("Unable to save expense. Check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">Expense Ledger</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">Track operating costs for profit reporting.</p>
          </div>
          <label className="block text-sm font-semibold">
            Filter month
            <input
              type="month"
              value={month}
              onChange={async (event) => {
                const nextMonth = event.target.value;
                setMonth(nextMonth);
                await loadExpenses(nextMonth);
              }}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600 sm:w-52"
            />
          </label>
        </div>
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950">
          <p className="text-xs font-bold uppercase text-emerald-700">Month expenses</p>
          <p className="mt-1 text-2xl font-black">{formatTZS(totalExpenses)}</p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">Add Expense</h2>
        <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_1fr_auto]" onSubmit={submitExpense}>
          <label className="block text-sm font-semibold">
            Date
            <input
              type="date"
              value={expenseDate}
              onChange={(event) => setExpenseDate(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
            />
          </label>
          <label className="block text-sm font-semibold">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-emerald-600"
            >
              {expenseCategories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Description
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
            />
          </label>
          <label className="block text-sm font-semibold">
            Amount
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
            />
          </label>
          <button
            type="submit"
            disabled={isSaving || formInvalid}
            className="self-end rounded-md bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </form>
        {message ? (
          <p className={`mt-3 rounded-md border px-3 py-2 text-sm font-bold ${messageType === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
            {message}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Expenses</h2>
          {isLoading ? <p className="text-sm font-bold text-slate-500">Loading...</p> : null}
        </div>
        <div className="mt-4 grid gap-2">
          {expenses.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-600">
              No expenses found for this month.
            </div>
          ) : (
            expenses.map((expense) => (
              <article key={expense.id} className="rounded-md border border-slate-200 px-3 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-bold">{expense.category}</p>
                    <p className="text-sm font-semibold text-slate-600">{expense.description || "No description"}</p>
                    <p className="mt-1 text-xs font-bold uppercase text-slate-500">{formatDate(expense.expense_date)}</p>
                  </div>
                  <p className="text-lg font-black text-slate-950">{formatTZS(expense.amount)}</p>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
