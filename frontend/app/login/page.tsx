"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { LogIn, ArrowLeft, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const apiBase = "";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const j = (await r.json().catch(() => ({}))) as { detail?: unknown };
      if (!r.ok) {
        const msg =
          typeof j.detail === "string"
            ? j.detail
            : Array.isArray(j.detail)
              ? JSON.stringify(j.detail)
              : r.statusText;
        throw new Error(msg);
      }
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col items-center justify-center p-6">
      {/* Back to Home */}
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="absolute top-8 left-8"
      >
        <Link href="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors text-sm font-medium">
          <ArrowLeft className="w-4 h-4" />
          Quay lại trang chủ
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" } as any}
        className="w-full max-w-md"
      >
        <div className="bg-white p-8 md:p-10 rounded-3xl border border-zinc-200 shadow-sm space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Đăng nhập</h1>
            <p className="text-zinc-500 text-sm leading-relaxed">
              Truy cập vào hệ thống quản trị RAGFlow Legal.
            </p>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-4 rounded-xl bg-red-50 border border-red-100 flex items-start gap-3 text-red-700 text-sm"
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </motion.div>
          )}

          <form onSubmit={onSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-700 ml-1">Email</label>
                <Input 
                  type="email" 
                  placeholder="name@example.com"
                  autoComplete="username"
                  className="rounded-xl border-zinc-200 h-12 focus:ring-zinc-900" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between ml-1">
                  <label className="text-sm font-semibold text-zinc-700">Mật khẩu</label>
                </div>
                <Input 
                  type="password" 
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="rounded-xl border-zinc-200 h-12 focus:ring-zinc-900" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 transition-all font-semibold"
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Tiếp tục
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-zinc-400">
            Cookie session HttpOnly đảm bảo an toàn cho phiên đăng nhập của bạn.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
