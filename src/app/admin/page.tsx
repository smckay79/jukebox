import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import AdminDashboard from "@/components/AdminDashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/");

  return <AdminDashboard />;
}
