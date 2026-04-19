import HomeView from "@/components/HomeView";

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
  return <HomeView healthLine={line} />;
}
