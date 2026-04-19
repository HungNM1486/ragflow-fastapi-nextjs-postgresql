export const dynamic = "force-dynamic";

async function backendHealth(): Promise<string> {
  const base = process.env.INTERNAL_API_URL ?? "http://localhost:8000";
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/health`, {
      cache: "no-store",
    });
    if (!r.ok) return `backend: HTTP ${r.status}`;
    const j = (await r.json()) as { status?: string };
    return `backend: ${j.status ?? "ok"}`;
  } catch (e) {
    return `backend: ${String(e)}`;
  }
}

export default async function Home() {
  const line = await backendHealth();
  return (
    <main>
      <h1>RAGFlow Legal</h1>
      <p>{line}</p>
      <p>
        <a href="/chat">/chat</a> — hội thoại (backend → RAGFlow)
      </p>
      <p>
        <a href="/admin">/admin</a> — quản lý người dùng (skeleton)
      </p>
      <p>
        RAGFlow UI (host): cổng theo <code>docker/ragflow/upstream/.env</code>{" "}
        (mặc định <code>18080</code>).
      </p>
    </main>
  );
}
