import { redirect } from "next/navigation";
import { getSession, isSessionValid } from "@/lib/session";
import { QaDashboard } from "@/components/QaDashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const s = await getSession();
  if (!isSessionValid(s)) {
    redirect("/login");
  }
  return <QaDashboard />;
}
