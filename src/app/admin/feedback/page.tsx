import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminFeedbackClient } from "@/app/admin/feedback/admin-feedback-client";
import { authenticateAdminFromCookie } from "@/lib/admin-session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pilot Feedback | PharmaStock Admin" };

export default async function AdminFeedbackPage() {
  const admin = await authenticateAdminFromCookie();
  if (!admin) redirect("/admin");
  return <AdminFeedbackClient />;
}
