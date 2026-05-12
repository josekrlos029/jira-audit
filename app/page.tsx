import { redirect } from "next/navigation";
import { getSession, isSessionValid } from "@/lib/session";
import { Dashboard } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const s = await getSession();
  if (!isSessionValid(s)) {
    redirect("/login");
  }
  const projectKey = process.env.NEXT_PUBLIC_JIRA_PROJECT_KEY ?? "ADR";
  const projectName = process.env.NEXT_PUBLIC_JIRA_PROJECT_NAME ?? "Armi Delivery Remo";

  return (
    <Dashboard
      projectKey={projectKey}
      projectName={projectName}
      site={s.site ?? ""}
      currentUser={s.user ?? null}
    />
  );
}
