import { redirect } from "next/navigation";

/**
 * Legacy Companies List Route
 * Redirects to /company (new unified company settings page)
 */
export default function CompaniesPage() {
  redirect("/company");
}
