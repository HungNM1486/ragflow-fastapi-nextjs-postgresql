"use client";

import AddCommentOutlinedIcon from "@mui/icons-material/AddCommentOutlined";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import SendIcon from "@mui/icons-material/Send";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import SettingsSuggestOutlinedIcon from "@mui/icons-material/SettingsSuggestOutlined";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useCallback, useState } from "react";

/** Cùng origin → Next proxy `/api/v1/*` tới backend. */
const apiBase = "";

type Line = { role: "user" | "assistant" | "system"; text: string };

function roleIcon(role: Line["role"]) {
  switch (role) {
    case "user":
      return <PersonOutlinedIcon fontSize="small" />;
    case "assistant":
      return <SmartToyOutlinedIcon fontSize="small" />;
    default:
      return <SettingsSuggestOutlinedIcon fontSize="small" />;
  }
}

function roleAvatarSx(role: Line["role"]) {
  if (role === "user")
    return { bgcolor: "primary.main", color: "primary.contrastText" } as const;
  if (role === "assistant")
    return { bgcolor: "secondary.main", color: "secondary.contrastText" } as const;
  return { bgcolor: "grey.600", color: "grey.100" } as const;
}

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
          text: `Phiên mới — conversation_uid = ${j.conversation_uid}`,
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
      setError('Bấm "Phiên chat mới" trước.');
      return;
    }
    const q = input.trim();
    if (!q) return;
    setInput("");
    setError(null);
    setBusy(true);
    setLines((prev) => [
      ...prev,
      { role: "user", text: q },
      { role: "assistant", text: "" },
    ]);

    const patchLastAssistant = (text: string) => {
      setLines((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role !== "assistant") return prev;
        next[next.length - 1] = { role: "assistant", text };
        return next;
      });
    };

    /** RAGFlow: nhiều event `answer` là delta; event cuối thường `answer: ""`, `final: true`. */
    const parseDelta = (rawJson: string): string | null => {
      try {
        const o = JSON.parse(rawJson) as { data?: unknown };
        const d = o.data;
        if (d === true) return null;
        if (!d || typeof d !== "object" || d === null || !("answer" in d)) return null;
        const b = d as { answer?: unknown; final?: unknown };
        if (typeof b.answer !== "string") return null;
        if (!b.answer && b.final === true) return null;
        return b.answer || null;
      } catch {
        return null;
      }
    };

    try {
      if (useStream) {
        const r = await fetch(`${apiBase}/api/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
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
        let lineBuf = "";
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          lineBuf += dec.decode(value, { stream: true });
          const parts = lineBuf.split("\n");
          lineBuf = parts.pop() ?? "";
          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            const piece = parseDelta(payload);
            if (piece) {
              acc += piece;
              patchLastAssistant(acc);
            }
          }
        }
        lineBuf += dec.decode();
        const tail = lineBuf.trim();
        if (tail.startsWith("data:")) {
          const payload = tail.slice(5).trim();
          if (payload && payload !== "[DONE]") {
            const piece = parseDelta(payload);
            if (piece) {
              acc += piece;
              patchLastAssistant(acc);
            }
          }
        }
        setLines((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant" && last.text === "") {
            next[next.length - 1] = {
              role: "assistant",
              text: "(Không nhận được nội dung — kiểm tra RAGFlow / Network)",
            };
          }
          return next;
        });
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
        patchLastAssistant(j.answer ?? JSON.stringify(j));
      }
    } catch (e) {
      setError(String(e));
      patchLastAssistant(`(Lỗi) ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [conversationUid, useStream]);

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
        >
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            Chat
          </Typography>
          <Button
            component={Link}
            href="/"
            variant="text"
            size="small"
            startIcon={<HomeOutlinedIcon />}
          >
            Trang chủ
          </Button>
        </Stack>

        <Typography variant="body2" color="text.secondary">
          Luồng: trình duyệt → <code>/api/v1/…</code> (Next) → FastAPI → RAGFlow.
        </Typography>

        {error ? (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}

        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
          <Button
            variant="contained"
            startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <AddCommentOutlinedIcon />}
            onClick={newSession}
            disabled={busy}
          >
            Phiên chat mới
          </Button>
          <FormControlLabel
            control={
              <Switch
                checked={useStream}
                onChange={(e) => setUseStream(e.target.checked)}
                disabled={busy}
              />
            }
            label="Stream (SSE)"
          />
        </Stack>

        <Paper
          variant="outlined"
          sx={{
            p: 2,
            minHeight: 280,
            maxHeight: "min(55vh, 480px)",
            overflow: "auto",
            bgcolor: "action.hover",
          }}
        >
          {lines.length === 0 ? (
            <Typography color="text.secondary" align="center" sx={{ py: 6 }}>
              Bấm &quot;Phiên chat mới&quot; rồi nhập câu hỏi pháp lý.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              {lines.map((l, i) => (
                <Stack
                  key={i}
                  direction="row"
                  spacing={1}
                  sx={{
                    alignItems: "flex-start",
                    justifyContent: l.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  {l.role !== "user" ? (
                    <Avatar sx={{ width: 32, height: 32, ...roleAvatarSx(l.role) }}>
                      {roleIcon(l.role)}
                    </Avatar>
                  ) : null}
                  <Paper
                    elevation={0}
                    sx={{
                      px: 1.5,
                      py: 1,
                      maxWidth: "85%",
                      bgcolor:
                        l.role === "user"
                          ? "primary.main"
                          : l.role === "assistant"
                            ? "background.paper"
                            : "grey.200",
                      color: l.role === "user" ? "primary.contrastText" : "text.primary",
                      borderRadius: 2,
                    }}
                  >
                    <Typography variant="caption" sx={{ display: "block", opacity: 0.85, mb: 0.25 }}>
                      {l.role}
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {l.role === "assistant" && busy && !l.text ? "…" : l.text}
                    </Typography>
                  </Paper>
                  {l.role === "user" ? (
                    <Avatar sx={{ width: 32, height: 32, ...roleAvatarSx("user") }}>
                      {roleIcon(l.role)}
                    </Avatar>
                  ) : null}
                </Stack>
              ))}
            </Stack>
          )}
        </Paper>

        <TextField
          fullWidth
          multiline
          minRows={3}
          placeholder="Câu hỏi…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void send();
            }
          }}
          helperText="Ctrl+Enter để gửi"
        />
        <Button
          variant="contained"
          size="large"
          startIcon={<SendIcon />}
          onClick={() => void send()}
          disabled={busy}
        >
          Gửi
        </Button>
      </Stack>
    </Container>
  );
}
