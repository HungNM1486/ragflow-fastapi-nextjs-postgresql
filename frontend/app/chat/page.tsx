"use client";

import AddCommentOutlinedIcon from "@mui/icons-material/AddCommentOutlined";
import DeleteIcon from "@mui/icons-material/Delete";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import SendIcon from "@mui/icons-material/Send";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import SettingsSuggestOutlinedIcon from "@mui/icons-material/SettingsSuggestOutlined";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useCallback, useEffect, useState, type MouseEvent } from "react";

/** Cùng origin → Next proxy `/api/v1/*` tới backend. */
const apiBase = "";

const creds: RequestInit = { credentials: "include" };

function defaultConversationTitle(): string {
  const d = new Date();
  return `Hội thoại mới · ${d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** Rút gọn câu hỏi đầu tiên làm tiêu đề hội thoại (giới hạn độ dài theo BE). */
function titleFromFirstQuestion(q: string, maxLen = 72): string {
  const collapsed = q.replace(/\s+/g, " ").trim();
  const firstLine =
    collapsed
      .split("\n")
      .map((s) => s.trim())
      .find((line) => line.length > 0) ?? "";
  const base = firstLine.length > 0 ? firstLine : "Hội thoại";
  if (base.length <= maxLen) return base;
  return `${base.slice(0, Math.max(1, maxLen - 1))}…`;
}

async function patchConversationTitleApi(uid: string, title: string): Promise<void> {
  const r = await fetch(`${apiBase}/api/v1/chat/conversations/${uid}`, {
    ...creds,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || r.statusText);
  }
}

type CitationEntry = {
  id: number;
  title?: string;
  snippet?: string;
};

type Line = {
  role: "user" | "assistant" | "system";
  text: string;
  citations?: CitationEntry[];
};

type ConversationItem = {
  uid: string;
  title: string;
  ragflow_chat_id: string;
  created_at: string;
  last_active_at: string;
};

type ParsedDelta = { piece: string | null; data: Record<string, unknown> | null };
type CitationPopoverState = {
  anchorEl: HTMLElement;
  citation: CitationEntry;
};

function parseCitationIdsFromAnswer(answer: string): number[] {
  const out = new Set<number>();
  const re = /\[?ID:(\d+)\]?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer)) !== null) {
    const id = Number(m[1]);
    if (Number.isFinite(id)) out.add(id);
  }
  return Array.from(out).sort((a, b) => a - b);
}

function normalizeCitations(rawData: unknown, answer: string): CitationEntry[] {
  const map = new Map<number, CitationEntry>();
  const idsFromAnswer = parseCitationIdsFromAnswer(answer);
  for (const id of idsFromAnswer) map.set(id, { id });

  if (!rawData || typeof rawData !== "object") {
    return Array.from(map.values()).sort((a, b) => a.id - b.id);
  }
  const data = rawData as { reference?: unknown };
  const ref = data.reference;
  if (!ref || typeof ref !== "object") {
    return Array.from(map.values()).sort((a, b) => a.id - b.id);
  }
  const chunks = (ref as { chunks?: unknown }).chunks;
  if (!Array.isArray(chunks)) {
    return Array.from(map.values()).sort((a, b) => a.id - b.id);
  }

  const titleFromChunk = (x: Record<string, unknown>): string | undefined => {
    const titleCandidates = [
      x.docnm_kwd,
      x.document_name,
      x.doc_name,
      x.docnm,
      x.dataset_name,
      x.document,
    ];
    return titleCandidates.find((v) => typeof v === "string") as string | undefined;
  };
  const snippetFromChunk = (x: Record<string, unknown>): string | undefined => {
    const snippetCandidates = [x.content, x.chunk, x.text];
    return snippetCandidates.find((v) => typeof v === "string") as string | undefined;
  };

  // RAGFlow thường đánh [ID:n] theo thứ tự chunks (0-based), không phải chunk.id.
  // Ưu tiên map trực tiếp n -> chunks[n], fallback về (n-1) để tương thích dữ liệu cũ.
  for (const entry of map.values()) {
    const candidateIndexes = [entry.id, entry.id - 1];
    const idx = candidateIndexes.find((x) => x >= 0 && x < chunks.length);
    const raw = typeof idx === "number" ? chunks[idx] : null;
    if (!raw || typeof raw !== "object") continue;
    const x = raw as Record<string, unknown>;
    map.set(entry.id, {
      id: entry.id,
      title: entry.title ?? titleFromChunk(x),
      snippet: entry.snippet ?? snippetFromChunk(x),
    });
  }

  for (const c of chunks) {
    if (!c || typeof c !== "object") continue;
    const x = c as Record<string, unknown>;
    const maybeId =
      typeof x.id === "number"
        ? x.id
        : typeof x.id === "string"
          ? Number(x.id)
          : typeof x.index === "number"
            ? x.index
            : typeof x.chunk_id === "number"
              ? x.chunk_id
              : NaN;
    if (!Number.isFinite(maybeId)) continue;
    const id = Number(maybeId);
    const prev = map.get(id) ?? { id };
    const title = titleFromChunk(x);
    const snippet = snippetFromChunk(x);
    map.set(id, {
      id,
      title: prev.title ?? title,
      snippet: prev.snippet ?? snippet,
    });
  }
  return Array.from(map.values()).sort((a, b) => a.id - b.id);
}

function citationContent(c?: CitationEntry): string {
  const content = c?.snippet?.trim();
  return content && content.length > 0 ? content : "Không có nội dung trích dẫn.";
}

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
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [conversationUid, setConversationUid] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useStream, setUseStream] = useState(true);
  const [citationPopover, setCitationPopover] = useState<CitationPopoverState | null>(null);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameUid, setRenameUid] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteUid, setDeleteUid] = useState<string | null>(null);
  const [deleteTitle, setDeleteTitle] = useState("");

  const loadConversations = useCallback(async (): Promise<ConversationItem[]> => {
    const r = await fetch(`${apiBase}/api/v1/chat/conversations`, { ...creds });
    const j = (await r.json()) as ConversationItem[] | { detail?: unknown };
    if (!r.ok) {
      throw new Error(
        typeof (j as { detail?: unknown }).detail === "string"
          ? (j as { detail?: string }).detail
          : JSON.stringify((j as { detail?: unknown }).detail ?? j)
      );
    }
    const items = Array.isArray(j) ? j : [];
    setConversations(items);
    return items;
  }, []);

  const loadConversationMessages = useCallback(async (uid: string) => {
    const r = await fetch(`${apiBase}/api/v1/chat/conversations/${uid}/messages`, { ...creds });
    const j = (await r.json()) as
      | { role: "user" | "assistant" | "system"; content: string | null }[]
      | { detail?: unknown };
    if (!r.ok) {
      throw new Error(
        typeof (j as { detail?: unknown }).detail === "string"
          ? (j as { detail?: string }).detail
          : JSON.stringify((j as { detail?: unknown }).detail ?? j)
      );
    }
    const rows = Array.isArray(j) ? j : [];
    setConversationUid(uid);
    setLines(
      rows.map((m) => ({
        role: m.role,
        text: m.content ?? "",
      }))
    );
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setError(null);
        const items = await loadConversations();
        if (items.length > 0) {
          await loadConversationMessages(items[0].uid);
        }
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [loadConversations, loadConversationMessages]);

  const newSession = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/api/v1/chat/sessions`, {
        ...creds,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: defaultConversationTitle() }),
      });
      const j = (await r.json()) as { conversation_uid?: string; detail?: unknown };
      if (!r.ok) {
        throw new Error(
          typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j)
        );
      }
      if (!j.conversation_uid) throw new Error("Thiếu conversation_uid");
      setConversationUid(j.conversation_uid);
      setLines([]);
      await loadConversations();
      await loadConversationMessages(j.conversation_uid);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [loadConversations, loadConversationMessages]);

  const send = useCallback(async () => {
    if (!conversationUid) {
      setError('Bấm "Phiên chat mới" trước.');
      return;
    }
    const q = input.trim();
    if (!q) return;
    const isFirstTurn = !lines.some((l) => l.role === "user");
    setInput("");
    setError(null);
    setBusy(true);
    setLines((prev) => [
      ...prev,
      { role: "user", text: q },
      { role: "assistant", text: "" },
    ]);

    const patchLastAssistant = (text: string, citations?: CitationEntry[]) => {
      setLines((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role !== "assistant") return prev;
        next[next.length - 1] = { role: "assistant", text, citations };
        return next;
      });
    };

    /** RAGFlow: nhiều event `answer` là delta; event cuối thường `answer: ""`, `final: true`. */
    const parseDelta = (rawJson: string): ParsedDelta => {
      try {
        const o = JSON.parse(rawJson) as { data?: unknown };
        const d = o.data;
        if (d === true) return { piece: null, data: null };
        if (!d || typeof d !== "object" || d === null || !("answer" in d)) {
          return { piece: null, data: null };
        }
        const b = d as { answer?: unknown; final?: unknown };
        const answer = typeof b.answer === "string" ? b.answer : "";
        if (!answer && b.final === true) {
          return { piece: null, data: d as Record<string, unknown> };
        }
        return {
          piece: answer || null,
          data: d as Record<string, unknown>,
        };
      } catch {
        return { piece: null, data: null };
      }
    };

    try {
      if (useStream) {
        const r = await fetch(`${apiBase}/api/v1/chat/completions`, {
          ...creds,
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
        let latestCitationData: unknown = null;
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
            const { piece, data } = parseDelta(payload);
            if (data) latestCitationData = data;
            if (piece) {
              acc += piece;
            }
            if (acc && data) {
              patchLastAssistant(acc, normalizeCitations(latestCitationData, acc));
            } else if (piece) {
              patchLastAssistant(acc, normalizeCitations(latestCitationData, acc));
            }
          }
        }
        lineBuf += dec.decode();
        const tail = lineBuf.trim();
        if (tail.startsWith("data:")) {
          const payload = tail.slice(5).trim();
          if (payload && payload !== "[DONE]") {
            const { piece, data } = parseDelta(payload);
            if (data) latestCitationData = data;
            if (piece) {
              acc += piece;
            }
            if (acc) {
              patchLastAssistant(acc, normalizeCitations(latestCitationData, acc));
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
        if (isFirstTurn) {
          try {
            await patchConversationTitleApi(conversationUid, titleFromFirstQuestion(q));
          } catch {
            /* Không chặn chat nếu đổi tên thất bại */
          }
        }
        await loadConversations();
      } else {
        const r = await fetch(`${apiBase}/api/v1/chat/completions`, {
          ...creds,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_uid: conversationUid,
            question: q,
            stream: false,
          }),
        });
        const j = (await r.json()) as {
          answer?: string;
          detail?: unknown;
          ragflow?: { data?: unknown };
        };
        if (!r.ok) {
          throw new Error(
            typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j)
          );
        }
        const answer = j.answer ?? JSON.stringify(j);
        patchLastAssistant(answer, normalizeCitations(j.ragflow?.data, answer));
        if (isFirstTurn) {
          try {
            await patchConversationTitleApi(conversationUid, titleFromFirstQuestion(q));
          } catch {
            /* Không chặn chat nếu đổi tên thất bại */
          }
        }
        await loadConversations();
      }
    } catch (e) {
      setError(String(e));
      patchLastAssistant(`(Lỗi) ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [conversationUid, useStream, input, lines, loadConversations]);

  const openCitationPopover = useCallback(
    (event: MouseEvent<HTMLElement>, citation: CitationEntry | undefined, id: number) => {
      const fallback: CitationEntry = citation ?? { id };
      setCitationPopover({ anchorEl: event.currentTarget, citation: fallback });
    },
    []
  );

  const closeCitationPopover = useCallback(() => {
    setCitationPopover(null);
  }, []);

  const openRenameDialog = (c: ConversationItem) => {
    setRenameUid(c.uid);
    setRenameDraft(c.title);
    setRenameOpen(true);
  };

  const closeRenameDialog = () => {
    setRenameOpen(false);
    setRenameUid(null);
    setRenameDraft("");
  };

  const submitRename = async () => {
    if (!renameUid) return;
    const title = renameDraft.trim();
    if (!title) return;
    setError(null);
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/api/v1/chat/conversations/${renameUid}`, {
        ...creds,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const j = (await r.json()) as ConversationItem | { detail?: unknown };
      if (!r.ok) {
        throw new Error(
          typeof (j as { detail?: unknown }).detail === "string"
            ? (j as { detail?: string }).detail
            : JSON.stringify((j as { detail?: unknown }).detail ?? j)
        );
      }
      closeRenameDialog();
      await loadConversations();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const openDeleteDialog = (c: ConversationItem) => {
    setDeleteUid(c.uid);
    setDeleteTitle(c.title);
    setDeleteOpen(true);
  };

  const closeDeleteDialog = () => {
    setDeleteOpen(false);
    setDeleteUid(null);
    setDeleteTitle("");
  };

  const confirmDeleteConversation = async () => {
    if (!deleteUid) return;
    setError(null);
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/api/v1/chat/conversations/${deleteUid}`, {
        ...creds,
        method: "DELETE",
      });
      const j = (await r.json()) as { status?: string; detail?: unknown };
      if (!r.ok) {
        throw new Error(
          typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j)
        );
      }
      const wasCurrent = conversationUid === deleteUid;
      closeDeleteDialog();
      const items = await loadConversations();
      if (wasCurrent) {
        if (items.length > 0) {
          await loadConversationMessages(items[0].uid);
        } else {
          setConversationUid(null);
          setLines([]);
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
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

        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <Paper
            variant="outlined"
            sx={{ width: { xs: "100%", md: 300 }, maxHeight: "min(55vh, 480px)", overflow: "auto", p: 1 }}
          >
            <Typography variant="subtitle2" sx={{ px: 1, py: 0.5 }}>
              Cuộc hội thoại
            </Typography>
            <Stack spacing={0.5}>
              {conversations.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 1 }}>
                  Chưa có cuộc hội thoại nào.
                </Typography>
              ) : (
                conversations.map((c) => (
                  <Box
                    key={c.uid}
                    sx={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 0.25,
                      pr: 0.5,
                    }}
                  >
                    <Button
                      variant={conversationUid === c.uid ? "contained" : "text"}
                      size="small"
                      onClick={() => void loadConversationMessages(c.uid)}
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        justifyContent: "flex-start",
                        textTransform: "none",
                      }}
                    >
                      {c.title}
                    </Button>
                    <Tooltip title="Đổi tên">
                      <IconButton
                        size="small"
                        aria-label="Đổi tên hội thoại"
                        onClick={(e) => {
                          e.stopPropagation();
                          openRenameDialog(c);
                        }}
                        disabled={busy}
                      >
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Xóa">
                      <IconButton
                        size="small"
                        aria-label="Xóa hội thoại"
                        color="error"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteDialog(c);
                        }}
                        disabled={busy}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ))
              )}
            </Stack>
          </Paper>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              flex: 1,
              minHeight: 280,
              maxHeight: "min(55vh, 480px)",
              overflow: "auto",
              bgcolor: "action.hover",
            }}
          >
            {lines.length === 0 ? (
              <Typography color="text.secondary" align="center" sx={{ py: 6 }}>
                Bấm &quot;Phiên chat mới&quot; hoặc chọn hội thoại bên trái.
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
                        {l.role === "assistant" && busy && !l.text
                          ? "…"
                          : (() => {
                              if (l.role !== "assistant") return l.text;
                              const txt = l.text;
                              const citationById = new Map((l.citations ?? []).map((c) => [c.id, c]));
                              const parts = txt.split(/(\[?ID:\d+\]?)/g);
                              return parts.map((part, idx) => {
                                const m = part.match(/^\[?ID:(\d+)\]?$/);
                                if (!m) return <span key={`${idx}-${part}`}>{part}</span>;
                                const id = Number(m[1]);
                                const citation = citationById.get(id);
                                return (
                                  <Tooltip
                                    key={`${idx}-${part}`}
                                    title={citationContent(citation)}
                                    arrow
                                    enterTouchDelay={0}
                                  >
                                    <Chip
                                      component="span"
                                      size="small"
                                      clickable
                                      label={`Nguồn ${id}`}
                                      onClick={(e) => openCitationPopover(e, citation, id)}
                                      sx={{ mx: 0.25, my: 0.25, verticalAlign: "middle" }}
                                    />
                                  </Tooltip>
                                );
                              });
                            })()}
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
        </Stack>

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
      <Popover
        open={Boolean(citationPopover)}
        anchorEl={citationPopover?.anchorEl ?? null}
        onClose={closeCitationPopover}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        <Box sx={{ p: 1.5, maxWidth: 420 }}>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {citationContent(citationPopover?.citation)}
          </Typography>
        </Box>
      </Popover>

      <Dialog open={renameOpen} onClose={() => !busy && closeRenameDialog()} fullWidth maxWidth="sm">
        <DialogTitle>Đổi tên hội thoại</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Tên hiển thị"
            fullWidth
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitRename();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRenameDialog} disabled={busy}>
            Hủy
          </Button>
          <Button variant="contained" onClick={() => void submitRename()} disabled={busy || !renameDraft.trim()}>
            Lưu
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => !busy && closeDeleteDialog()}>
        <DialogTitle>Xóa hội thoại</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Xóa &quot;{deleteTitle}&quot;? Thao tác này không thể hoàn tác.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteDialog} disabled={busy}>
            Hủy
          </Button>
          <Button color="error" variant="contained" onClick={() => void confirmDeleteConversation()} disabled={busy}>
            Xóa
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
