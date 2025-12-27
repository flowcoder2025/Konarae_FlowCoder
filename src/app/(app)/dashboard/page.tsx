import { redirect } from "next/navigation";

/**
 * Legacy Dashboard Route
 * Redirects to /home (new home page)
 */
export default function DashboardPage() {
  redirect("/home");
}
