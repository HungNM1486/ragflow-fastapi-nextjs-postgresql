"use client";

import { useCallback, useState } from "react";

/** Cùng origin → Next proxy `/api/v1/*` tới backend (tránh Failed to fetch tới :8000). */
const apiBase = "";

type Line = { role: "user" | "assistant" | "system"; text: string };

export default function ChatPage() {
  const [conversationUid, setConversationUid] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useStream, setUseStream] = useState(true);

  const newSession = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/api/v1/chat/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Web" }),
      });
      const j = (await r.json()) as { conversation_uid?: string; detail?: unknown };
      if (!r.ok) {
        throw new Error(
          typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j)
        );
      }
      if (!j.conversation_uid) throw new Error("Thiếu conversation_uid");
      setConversationUid(j.conversation_uid);
      setLines((prev) => [
        ...prev,
        {
          role: "system",
          text: `Phiên mới: conversation_uid = ${j.conversation_uid}`,
        },
      ]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const send = useCallback(async () => {
    if (!conversationUid) {
      setError("Bấm “Phiên chat mới” trước.");
      return;
    }
    const q = input.trim();
    if (!q) return;
    setInput("");
    setError(null);
    setBusy(true);
    setLines((prev) => [...prev, { role: "user", text: q }]);

    try {
      if (useStream) {
        const r = await fetch(`${apiBase}/api/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_uid: conversationUid,
            question: q,
            stream: true,
          }),
        });
        if (!r.ok) {
          const t = await r.text();
          throw new Error(t || r.statusText);
        }
        const reader = r.body?.getReader();
        if (!reader) throw new Error("Không đọc được stream");
        const dec = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
        }
        const parts = acc
          .split(/\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .filter((p) => p && p !== "[DONE]");
        let lastAnswer = "";
        for (const p of parts) {
          try {
            const o = JSON.parse(p) as {
              data?: { answer?: string };
            };
            const a = o.data && typeof o.data === "object" && "answer" in o.data;
            if (a && typeof o.data?.answer === "string") {
              lastAnswer = o.data.answer as string;
            }
          } catch {
            /* ignore */
          }
        }
        setLines((prev) => [
          ...prev,
          {
            role: "assistant",
            text: lastAnswer || "(Không tách được answer từ SSE — xem raw trong Network)",
          },
        ]);
      } else {
        const r = await fetch(`${apiBase}/api/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_uid: conversationUid,
            question: q,
            stream: false,
          }),
        });
        const j = (await r.json()) as { answer?: string; detail?: unknown };
        if (!r.ok) {
          throw new Error(
            typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j)
          );
        }
        setLines((prev) => [
          ...prev,
          { role: "assistant", text: j.answer ?? JSON.stringify(j) },
        ]);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [conversationUid, useStream]);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "1.5rem" }}>
      <h1>Chat</h1>
      <p style={{ color: "#555", fontSize: "0.9rem" }}>
        Luồng: trình duyệt → <code>/api/v1/…</code> (Next proxy) → FastAPI → RAGFlow. Cần{" "}
        <code>RAGFLOW_API_KEY</code> và <code>RAGFLOW_CHAT_ID</code> trong{" "}
        <code>docker/ragflow/upstream/.env</code>, rồi <code>docker compose up -d --build frontend</code>.
      </p>
      {error ? (
        <p style={{ color: "crimson", whiteSpace: "pre-wrap" }}>{error}</p>
      ) : null}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button type="button" onClick={newSession} disabled={busy}>
          Phiên chat mới
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <input
            type="checkbox"
            checked={useStream}
            onChange={(e) => setUseStream(e.target.checked)}
          />
          Stream (SSE)
        </label>
        <a href="/">Trang chủ</a>
      </div>
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: "0.75rem",
          minHeight: 200,
          marginBottom: "0.75rem",
          background: "#fafafa",
        }}
      >
        {lines.map((l, i) => (
          <div key={i} style={{ marginBottom: "0.6rem" }}>
            <strong>{l.role}:</strong>{" "}
            <span style={{ whiteSpace: "pre-wrap" }}>{l.text}</span>
          </div>
        ))}
      </div>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={3}
        style={{ width: "100%", boxSizing: "border-box" }}
        placeholder="Câu hỏi…"
        disabled={busy}
      />
      <button type="button" onClick={send} disabled={busy} style={{ marginTop: "0.5rem" }}>
        Gửi
      </button>
    </main>
  );
}
