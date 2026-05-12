import Link from "next/link";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const project = process.env.NEXT_PUBLIC_JIRA_PROJECT_NAME ?? "Armi Delivery Remo";
  const projectKey = process.env.NEXT_PUBLIC_JIRA_PROJECT_KEY ?? "ADR";

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white border border-line rounded-2xl shadow-card p-8 max-w-md w-full">
        <div className="text-3xl mb-1">📋</div>
        <h1 className="text-lg font-semibold mb-1">Sprint {projectKey} · {project}</h1>
        <p className="text-ink-soft text-sm mb-6">
          Conecta tu cuenta de Atlassian para ver el tablero del sprint en vivo.
        </p>

        {searchParams?.error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-bad-soft border border-bad/20 text-bad text-sm">
            {searchParams.error}
          </div>
        )}

        <Link
          href="/api/auth/login"
          className="inline-flex items-center justify-center gap-2 w-full bg-brand hover:bg-brand-hover text-white font-medium rounded-lg px-4 py-2.5 text-sm"
        >
          <span>🔗</span> Conectar con Atlassian
        </Link>

        <p className="text-xs text-ink-soft mt-5">
          Se te pedirá autorizar los permisos <code>read:jira-work</code>,{" "}
          <code>read:jira-user</code> y <code>offline_access</code>. Tu sesión se guarda
          en una cookie cifrada (no enviamos credenciales a ningún tercero).
        </p>
      </div>
    </main>
  );
}
