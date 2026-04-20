"use client";

import React, { useCallback, useEffect, useState, type MouseEvent, useRef } from "react";
import Link from "next/link";
import { 
  MessageSquarePlus, 
  Send, 
  Home, 
  User, 
  Bot, 
  Settings2, 
  Trash2, 
  Edit3, 
  Plus, 
  MoreVertical,
  X,
  Check,
  Loader2,
  AlertCircle,
  Menu,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

/** Types & Helpers (kept from original) */
const apiBase = "";
const creds: RequestInit = { credentials: "include" };

type CitationEntry = { 
  id: number; 
  title?: string; 
  snippet?: string; 
  doc_id?: string;
  page_num?: string | number;
  similarity?: number;
};
type Line = { role: "user" | "assistant" | "system"; text: string; citations?: CitationEntry[]; };
type ConversationItem = { uid: string; title: string; ragflow_chat_id: string; created_at: string; last_active_at: string; };
type ParsedDelta = { piece: string | null; data: Record<string, unknown> | null };

function defaultConversationTitle(): string {
  const d = new Date();
  return `Hội thoại mới · ${d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
}

function titleFromFirstQuestion(q: string, maxLen = 72): string {
  const collapsed = q.replace(/\s+/g, " ").trim();
  const firstLine = collapsed.split("\n").find((line) => line.trim().length > 0) ?? "Hội thoại";
  if (firstLine.length <= maxLen) return firstLine;
  return `${firstLine.slice(0, Math.max(1, maxLen - 1))}…`;
}

async function patchConversationTitleApi(uid: string, title: string): Promise<void> {
  const r = await fetch(`${apiBase}/api/v1/chat/conversations/${uid}`, {
    ...creds,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!r.ok) throw new Error(await r.text() || r.statusText);
}

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

function normalizeCitations(rawData: any, answer: string): CitationEntry[] {
  const map = new Map<number, CitationEntry>();
  const idsFromAnswer = parseCitationIdsFromAnswer(answer);
  for (const id of idsFromAnswer) map.set(id, { id });
  
  if (!rawData || typeof rawData !== "object") return Array.from(map.values()).sort((a, b) => a.id - b.id);

  // Handle both { data: { reference: ... } } and { reference: ... }
  const chunks = rawData.reference?.chunks || rawData.data?.reference?.chunks;
  if (!Array.isArray(chunks)) return Array.from(map.values()).sort((a, b) => a.id - b.id);

  const getTitle = (x: any) => x.docnm_kwd || x.document_name || x.doc_name || x.docnm || x.dataset_name || x.document || "Tài liệu không tên";
  const getSnippet = (x: any) => x.content_with_weight || x.content || x.chunk || x.text;

  for (const entry of map.values()) {
    const idx = [entry.id - 1, entry.id].find(i => i >= 0 && i < chunks.length);
    const x = typeof idx === 'number' ? chunks[idx] : null;
    if (x) {
      map.set(entry.id, { 
        id: entry.id, 
        title: getTitle(x), 
        snippet: getSnippet(x),
        page_num: x.img_id || x.page_num || x.page_no,
        similarity: x.similarity
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.id - b.id);
}

/** 
 * Simple Inline Citation Component with Tooltip (hover) and Modal (click)
 */
function Citation({ citation }: { citation: CitationEntry }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  return (
    <span className="relative inline-block group/cite">
      <button 
        type="button"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={(e) => { e.stopPropagation(); setIsModalOpen(true); setIsHovered(false); }}
        className={cn(
          "inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all border shadow-sm",
          isHovered || isModalOpen
            ? "bg-zinc-900 border-zinc-900 text-white" 
            : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
        )}
      >
        nguồn {citation.id}
      </button>

      {/* Tooltip on Hover */}
      <AnimatePresence>
        {isHovered && !isModalOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 md:w-80 z-[60] pointer-events-none"
          >
            <div className="bg-white border border-zinc-200 shadow-xl rounded-xl p-4 overflow-hidden pointer-events-auto">
              <p className="text-[12px] text-zinc-600 leading-relaxed font-normal line-clamp-6">
                {citation.snippet || "Không có nội dung trích dẫn."}
              </p>
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-0.5 w-3 h-3 bg-white border-r border-b border-zinc-200 rotate-45" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isModalOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-md z-[100] cursor-pointer"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed inset-0 m-auto w-[95%] max-w-2xl h-fit max-h-[80vh] z-[110] bg-white border border-zinc-200 shadow-2xl rounded-[32px] overflow-hidden flex flex-col pointer-events-auto"
            >
              <div className="p-8 md:p-16 overflow-y-auto overflow-x-hidden scrollbar-thin">
                <p className="text-[16px] md:text-[18px] text-zinc-900 leading-relaxed font-normal whitespace-pre-wrap">
                  {citation.snippet || "Không có nội dung trích dẫn."}
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </span>
  );
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [conversationUid, setConversationUid] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useStream, setUseStream] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [renameUid, setRenameUid] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [lines]);

  const loadConversations = useCallback(async (): Promise<ConversationItem[]> => {
    const r = await fetch(`${apiBase}/api/v1/chat/conversations`, { ...creds });
    const j = await r.json();
    if (!r.ok) throw new Error(j.detail || "Error loading conversations");
    const items = Array.isArray(j) ? j : [];
    setConversations(items);
    return items;
  }, []);

  const loadConversationMessages = useCallback(async (uid: string) => {
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/api/v1/chat/conversations/${uid}/messages`, { ...creds });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail || "Error loading messages");
      setConversationUid(uid);
      setLines((j as any[]).map(m => {
        const text = m.content ?? "";
        return { 
          role: m.role, 
          text: text,
          citations: m.raw_payload ? normalizeCitations(m.raw_payload, text) : undefined
        };
      }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    loadConversations().then(items => {
      if (items.length > 0) loadConversationMessages(items[0].uid);
    }).catch(e => setError(String(e)));
  }, [loadConversations, loadConversationMessages]);

  const newSession = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/api/v1/chat/sessions`, {
        ...creds,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: defaultConversationTitle() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail || "Error creating session");
      setConversationUid(j.conversation_uid);
      setLines([]);
      await loadConversations();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteConversation = async (uid: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa cuộc hội thoại này?")) return;
    try {
      const r = await fetch(`${apiBase}/api/v1/chat/conversations/${uid}`, { ...creds, method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");
      const items = await loadConversations();
      if (conversationUid === uid) {
        if (items.length > 0) loadConversationMessages(items[0].uid);
        else { setConversationUid(null); setLines([]); }
      }
    } catch (e) { setError(String(e)); }
  };

  const renameConversation = async (uid: string, title: string) => {
    try {
      await patchConversationTitleApi(uid, title);
      setRenameUid(null);
      await loadConversations();
    } catch (e) { setError(String(e)); }
  };

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!conversationUid || !input.trim() || busy) return;
    const q = input.trim();
    const isFirstTurn = !lines.some(l => l.role === "user");
    setInput("");
    setError(null);
    setBusy(true);
    setLines(prev => [...prev, { role: "user", text: q }, { role: "assistant", text: "" }]);

    const patchLastAssistant = (text: string, citations?: CitationEntry[]) => {
      setLines(prev => {
        const next = [...prev];
        if (next[next.length - 1]?.role === "assistant") {
          next[next.length - 1] = { role: "assistant", text, citations };
        }
        return next;
      });
    };

    const parseDelta = (raw: string): ParsedDelta => {
      try {
        const o = JSON.parse(raw);
        if (o.data === true) return { piece: null, data: null };
        const d = o.data || {};
        return { piece: d.answer || null, data: d };
      } catch { return { piece: null, data: null }; }
    };

    try {
      const r = await fetch(`${apiBase}/api/v1/chat/completions`, {
        ...creds,
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: useStream ? "text/event-stream" : "application/json" },
        body: JSON.stringify({ conversation_uid: conversationUid, question: q, stream: useStream }),
      });
      if (!r.ok) throw new Error(await r.text() || "Fetch error");

      if (useStream) {
        const reader = r.body?.getReader();
        if (!reader) throw new Error("No reader");
        const dec = new TextDecoder();
        let acc = "";
        let lastData: any = null;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value);
          const parts = chunk.split("\n");
          for (const p of parts) {
            if (!p.trim().startsWith("data:")) continue;
            const payload = p.trim().slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            const { piece, data } = parseDelta(payload);
            if (data) lastData = data;
            if (piece) acc += piece;
            patchLastAssistant(acc, normalizeCitations(lastData, acc));
          }
        }
      } else {
        const j = await r.json();
        const ans = j.answer || "";
        patchLastAssistant(ans, normalizeCitations(j.ragflow?.data, ans));
      }

      if (isFirstTurn) await patchConversationTitleApi(conversationUid, titleFromFirstQuestion(q)).catch(() => {});
      await loadConversations();
    } catch (e) {
      setError(String(e));
      patchLastAssistant(`(Lỗi) ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen bg-white overflow-hidden text-zinc-900">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="flex-shrink-0 bg-zinc-50 border-r border-zinc-200 flex flex-col"
          >
            <div className="p-4 flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-tight text-zinc-400 uppercase px-2">Hội thoại</h2>
              <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)} className="md:hidden">
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="px-3 pb-4">
              <Button 
                onClick={newSession} 
                disabled={busy} 
                className="w-full justify-start gap-2 bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-100 shadow-sm rounded-xl h-11"
              >
                <Plus className="w-4 h-4" />
                Phiên chat mới
              </Button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 space-y-1 scrollbar-thin">
              {conversations.map((c) => (
                <div key={c.uid} className="relative group">
                  {renameUid === c.uid ? (
                    <div className="flex items-center gap-1 p-1">
                      <Input 
                        value={renameDraft} 
                        onChange={e => setRenameDraft(e.target.value)}
                        className="h-8 text-xs rounded-lg"
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" onClick={() => renameConversation(c.uid, renameDraft)}>
                        <Check className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-400" onClick={() => setRenameUid(null)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => loadConversationMessages(c.uid)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadConversationMessages(c.uid); } }}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center gap-3 group/item cursor-pointer",
                        conversationUid === c.uid ? "bg-white border border-zinc-200 shadow-sm text-zinc-900 font-medium" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                      )}
                    >
                      <MessageSquarePlus className={cn("w-4 h-4 shrink-0", conversationUid === c.uid ? "text-zinc-900" : "text-zinc-400")} />
                      <span className="truncate flex-1">{c.title}</span>
                      <div className="hidden group-hover/item:flex items-center gap-1">
                        <button onClick={(e) => { e.stopPropagation(); setRenameUid(c.uid); setRenameDraft(c.title); }} className="p-1 hover:bg-zinc-200 rounded-md transition-colors">
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deleteConversation(c.uid); }} className="p-1 hover:bg-red-100 text-red-500 rounded-md transition-colors" type="button">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </nav>

            <div className="p-4 border-t border-zinc-200 space-y-2">
              <Link href="/" className="flex items-center gap-3 px-3 py-2 text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
                <Home className="w-4 h-4" />
                Trang chủ
              </Link>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative bg-white">
        {/* Header */}
        <header className="h-16 flex-shrink-0 border-b border-zinc-100 flex items-center justify-between px-6 bg-white/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-4">
            {!isSidebarOpen && (
              <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)}>
                <Menu className="w-5 h-5 text-zinc-500" />
              </Button>
            )}
            <div>
              <h1 className="text-base font-bold tracking-tight">
                {conversations.find(c => c.uid === conversationUid)?.title || "Phiên chat mới"}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
             <div className="flex items-center gap-2 bg-zinc-100 p-1 rounded-lg">
                <button 
                  onClick={() => setUseStream(true)}
                  className={cn("px-3 py-1 text-[10px] font-bold rounded-md transition-all", useStream ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}
                >
                  STREAM
                </button>
                <button 
                  onClick={() => setUseStream(false)}
                  className={cn("px-3 py-1 text-[10px] font-bold rounded-md transition-all", !useStream ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}
                >
                  STATIC
                </button>
             </div>
          </div>
        </header>

        {/* Message Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-12 space-y-8 scroll-smooth scrollbar-thin">
          {lines.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 max-w-sm mx-auto">
              <div className="w-16 h-16 bg-zinc-50 border border-zinc-100 rounded-3xl flex items-center justify-center shadow-sm">
                <Bot className="w-8 h-8 text-zinc-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold">Bắt đầu thảo luận</h3>
                <p className="text-sm text-zinc-500 leading-relaxed"> Đặt câu hỏi về các văn bản pháp luật, hệ thống sẽ phân tích và phản hồi kèm trích dẫn nguồn.</p>
              </div>
              {!conversationUid && (
                <Button onClick={newSession} className="bg-zinc-900 text-white hover:bg-zinc-800 rounded-xl h-11 px-8">
                  Bắt đầu ngay
                </Button>
              )}
            </div>
          ) : (
            lines.map((l, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={i} 
                className={cn(
                  "flex group gap-4 transition-all max-w-4xl mx-auto",
                  l.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div className={cn(
                  "w-8 h-8 shrink-0 rounded-xl flex items-center justify-center border shadow-sm",
                  l.role === "user" ? "bg-white border-zinc-200 text-zinc-900" : "bg-zinc-900 border-zinc-900 text-white"
                )}>
                  {l.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                <div className={cn(
                  "flex flex-col gap-2 min-w-0 max-w-[85%]",
                  l.role === "user" ? "items-end" : "items-start"
                )}>
                  <div className={cn(
                    "px-5 py-3.5 rounded-2xl text-[15px] leading-relaxed shadow-sm transition-all whitespace-pre-wrap break-words",
                    l.role === "user" 
                      ? "bg-zinc-900 text-white" 
                      : "bg-white border border-zinc-200 text-zinc-900"
                  )}>
                    {l.role === "assistant" && busy && !l.text ? (
                      <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                    ) : (
                      (() => {
                        if (l.role !== "assistant") return l.text;
                        const citationMap = new Map((l.citations ?? []).map(c => [c.id, c]));
                        const parts = l.text.split(/(\[?ID:\d+\]?)/g);
                        return parts.map((part, idx) => {
                          const m = part.match(/^\[?ID:(\d+)\]?$/);
                          if (!m) return part;
                          const id = Number(m[1]);
                          const citation = citationMap.get(id);
                          if (!citation) return part;
                          return <Citation key={idx} citation={citation} />;
                        });
                      })()
                    )}
                  </div>
                  {l.role === "assistant" && l.citations && l.citations.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {l.citations.slice(0, 3).map(c => (
                        <div key={c.id} className="text-[11px] font-medium text-zinc-400 flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {c.title || `Nguồn ${c.id}`}
                        </div>
                      ))}
                      {l.citations.length > 3 && (
                        <div className="text-[11px] font-medium text-zinc-400">+{l.citations.length - 3} more</div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>



        {/* Input Area */}
        <div className="p-6 md:p-12 pt-0 sticky bottom-0 bg-white">
          <div className="max-w-4xl mx-auto relative group">
            {error && (
              <div className="absolute -top-16 left-0 right-0 p-4 rounded-xl bg-red-50 border border-red-100 flex items-center gap-3 text-red-700 text-sm shadow-sm">
                <AlertCircle className="w-4 h-4" />
                {error}
                <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-red-200 rounded-md"><X className="w-3 h-3" /></button>
              </div>
            )}
            
            <form onSubmit={send} className="relative">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Nhập câu hỏi của bạn tại đây..."
                className="w-full bg-zinc-50 border border-zinc-200 focus:border-zinc-300 focus:ring-0 focus:bg-white p-5 pr-20 rounded-2xl md:rounded-3xl text-[15px] resize-none h-[64px] min-h-[64px] transition-all scrollbar-none"
                disabled={busy}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <Button 
                  type="submit" 
                  disabled={busy || !input.trim()}
                  size="icon" 
                  className={cn(
                    "w-10 h-10 rounded-xl md:rounded-2xl transition-all shadow-sm",
                    input.trim() ? "bg-zinc-900 text-white hover:scale-105" : "bg-zinc-100 text-zinc-300 pointer-events-none"
                  )}
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
