"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { PharmacyUser, PharmacyUserRole } from "@/lib/types";

type StaffForm = {
  id: string;
  full_name: string;
  username: string;
  role: PharmacyUserRole;
  password: string;
};

const emptyForm: StaffForm = {
  id: "",
  full_name: "",
  username: "",
  role: "TECHNICIAN",
  password: "",
};

const roleOptions: PharmacyUserRole[] = ["OWNER", "PHARMACIST", "TECHNICIAN"];

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-800">
      {label}
      <input
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-emerald-600"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PharmacyUserRole;
  onChange: (value: PharmacyUserRole) => void;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-800">
      {label}
      <select
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-emerald-600"
        onChange={(event) => onChange(event.target.value as PharmacyUserRole)}
        value={value}
      >
        {roleOptions.map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>
    </label>
  );
}

function roleBadge(role: PharmacyUserRole) {
  if (role === "OWNER") return "border-emerald-200 bg-emerald-100 text-emerald-800";
  if (role === "PHARMACIST") return "border-blue-200 bg-blue-100 text-blue-800";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

export function StaffManager({ currentUserId, initialStaff }: { currentUserId: string; initialStaff: PharmacyUser[] }) {
  const [staff, setStaff] = useState(initialStaff);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [resetUserId, setResetUserId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [isSaving, setIsSaving] = useState(false);

  const filteredStaff = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return staff;
    return staff.filter((user) =>
      [user.full_name, user.username, user.role].some((value) => value.toLowerCase().includes(text)),
    );
  }, [staff, query]);

  function setNotice(text: string, type: "success" | "error") {
    setMessage(text);
    setMessageType(type);
  }

  async function refreshStaff() {
    const response = await fetch("/api/staff");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load staff.");
    setStaff(result.staff || []);
  }

  async function saveStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/staff", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form.id ? { ...form, action: "update" } : form),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.error || "Unable to save staff user.");

      await refreshStaff();
      setForm(emptyForm);
      setNotice(form.id ? "Staff user updated." : "Staff user created.", "success");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save staff user.", "error");
    } finally {
      setIsSaving(false);
    }
  }

  async function staffAction(id: string, action: "deactivate" | "reactivate") {
    setIsSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.error || "Unable to update staff user.");

      await refreshStaff();
      setNotice(action === "deactivate" ? "Staff user deactivated." : "Staff user reactivated.", "success");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update staff user.", "error");
    } finally {
      setIsSaving(false);
    }
  }

  async function resetStaffPassword() {
    if (!resetUserId || !newPassword.trim()) {
      setNotice("Choose a staff user and enter a new password.", "error");
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: resetUserId, action: "reset-password", password: newPassword }),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.error || "Unable to reset password.");

      setResetUserId("");
      setNewPassword("");
      setNotice("Password reset successfully.", "success");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to reset password.", "error");
    } finally {
      setIsSaving(false);
    }
  }

  function editUser(user: PharmacyUser) {
    setForm({
      id: user.id,
      full_name: user.full_name,
      username: user.username,
      role: user.role,
      password: "",
    });
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">{form.id ? "Edit Staff" : "Add Staff"}</h2>
            <p className="text-sm font-medium text-slate-600">Owners can manage staff accounts for this pharmacy.</p>
          </div>
          {message ? <p className={`text-sm font-bold ${messageType === "success" ? "text-emerald-700" : "text-rose-700"}`}>{message}</p> : null}
        </div>
        <form className="mt-4 grid gap-3 lg:grid-cols-4" onSubmit={saveStaff}>
          <Input label="Full name" value={form.full_name} onChange={(value) => setForm({ ...form, full_name: value })} />
          <Input label="Username" value={form.username} onChange={(value) => setForm({ ...form, username: value })} />
          <Select label="Role" value={form.role} onChange={(value) => setForm({ ...form, role: value })} />
          {!form.id ? <Input label="Password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} type="password" /> : null}
          <div className="flex gap-2 self-end lg:col-span-4">
            <button className="rounded-md bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300" disabled={isSaving} type="submit">
              {isSaving ? "Saving..." : form.id ? "Save Staff" : "Add Staff"}
            </button>
            {form.id ? (
              <button className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800" onClick={() => setForm(emptyForm)} type="button">
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">Reset Password</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label className="block text-sm font-semibold text-slate-800">
            Staff user
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-emerald-600"
              onChange={(event) => setResetUserId(event.target.value)}
              value={resetUserId}
            >
              <option value="">Choose staff user</option>
              {staff.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.full_name} ({user.username})
                </option>
              ))}
            </select>
          </label>
          <Input label="New password" value={newPassword} onChange={setNewPassword} type="password" />
          <button className="self-end rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 disabled:bg-slate-100 disabled:text-slate-400" disabled={isSaving} onClick={resetStaffPassword} type="button">
            Reset
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold">Staff List</h2>
          <input
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-emerald-600 sm:max-w-xs"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search staff"
            value={query}
          />
        </div>
        <div className="mt-4 grid gap-3">
          {filteredStaff.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 p-6 text-center font-semibold text-slate-600">No staff found.</p>
          ) : null}
          {filteredStaff.map((user) => (
            <article key={user.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{user.full_name}</h3>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${roleBadge(user.role)}`}>{user.role}</span>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${user.active ? "border-emerald-200 bg-emerald-100 text-emerald-800" : "border-rose-200 bg-rose-100 text-rose-800"}`}>
                      {user.active ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-600">@{user.username}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Last login: {user.last_login_at || "Never"}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800" onClick={() => editUser(user)} type="button">
                    Edit
                  </button>
                  {user.active ? (
                    <button
                      className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800 disabled:opacity-50"
                      disabled={isSaving || user.id === currentUserId}
                      onClick={() => staffAction(user.id, "deactivate")}
                      type="button"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800" disabled={isSaving} onClick={() => staffAction(user.id, "reactivate")} type="button">
                      Reactivate
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
