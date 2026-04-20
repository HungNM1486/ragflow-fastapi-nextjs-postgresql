"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { 
  Home, 
  LogOut, 
  UserPlus, 
  Users, 
  Trash2, 
  Shield, 
  User as UserIcon, 
  Settings, 
  Search,
  CheckCircle2,
  XCircle,
  MoreVertical,
  ChevronDown,
  AlertTriangle,
  Loader2,
  LogIn
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const apiBase = "";

type UserRow = {
  uid: string;
  email: string;
  role: string;
  is_active: boolean;
};

async function apiJson<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const r = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string>),
    },
  });
  const data = (await r.json().catch(() => ({}))) as T;
  return { ok: r.ok, status: r.status, data };
}

function formatApiError(data: unknown): string {
  if (data && typeof data === "object" && "detail" in data) {
    const d = (data as { detail: unknown }).detail;
    if (typeof d === "string") return d;
  }
  return JSON.stringify(data);
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async () => {
    setError(null);
    const { ok, status, data } = await apiJson<UserRow[]>("/api/v1/admin/users");
    if (status === 401) {
      setUsers(null);
      setError("unauthorized");
      return;
    }
    if (!ok) {
      setError(formatApiError(data));
      setUsers([]);
      return;
    }
    setUsers(data as UserRow[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function logout() {
    setBusy(true);
    await fetch(`${apiBase}/api/v1/auth/logout`, { method: "POST", credentials: "include" });
    setBusy(false);
    await load();
  }

  async function createUser() {
    if (!newEmail || !newPassword) return;
    setBusy(true);
    setError(null);
    const { ok, data } = await apiJson<UserRow>("/api/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: newEmail.trim(), password: newPassword, role: newRole }),
    });
    setBusy(false);
    if (!ok) { setError(formatApiError(data)); return; }
    setCreateOpen(false);
    setNewEmail(""); setNewPassword(""); setNewRole("user");
    await load();
  }

  async function patchUser(uid: string, patch: Partial<Pick<UserRow, "is_active" | "role">>) {
    setBusy(true);
    const { ok, data } = await apiJson<UserRow>(`/api/v1/admin/users/${uid}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setBusy(false);
    if (!ok) { setError(formatApiError(data)); return; }
    await load();
  }

  async function deleteUser(uid: string) {
    if (!window.confirm("Bạn có chắc chắn muốn xóa người dùng này?")) return;
    setBusy(true);
    const { ok, data } = await apiJson<{ status?: string }>(`/api/v1/admin/users/${uid}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!ok) { setError(formatApiError(data)); return; }
    await load();
  }

  const filteredUsers = users?.filter(u => 
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-zinc-50/50 flex flex-col">
      {/* Top Navbar */}
      <nav className="h-16 bg-white border-b border-zinc-200 sticky top-0 z-30 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-base font-bold tracking-tight">Admin Console</h1>
        </div>

        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors flex items-center gap-2">
            <Home className="w-4 h-4" />
            Trang chủ
          </Link>
          {users && (
            <button 
              onClick={logout}
              disabled={busy}
              className="text-sm font-medium text-red-500 hover:text-red-600 transition-colors flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Đăng xuất
            </button>
          )}
        </div>
      </nav>

      <main className="flex-1 container mx-auto px-6 py-10 max-w-6xl">
        {error === "unauthorized" ? (
          <div className="bg-white p-12 rounded-3xl border border-zinc-200 shadow-sm text-center space-y-6 max-w-md mx-auto">
             <div className="w-16 h-16 bg-zinc-50 rounded-2xl flex items-center justify-center mx-auto border border-zinc-100">
               <Shield className="w-8 h-8 text-zinc-300" />
             </div>
             <div className="space-y-2">
               <h2 className="text-xl font-bold">Quyền truy cập bị hạn chế</h2>
               <p className="text-sm text-zinc-500 leading-relaxed">Bạn cần đăng nhập bằng tài khoản Administrator để truy cập trang này.</p>
             </div>
             <Link href="/login" className="inline-block w-full">
               <Button className="w-full bg-zinc-900 text-white hover:bg-zinc-800 h-11 rounded-xl">
                 <LogIn className="mr-2 w-4 h-4" />
                 Đăng nhập ngay
               </Button>
             </Link>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-2xl font-bold tracking-tight">Quản lý người dùng</h2>
                <p className="text-sm text-zinc-500">Xem, chỉnh sửa và quản trị quyền truy cập hệ thống.</p>
              </div>
              <Button 
                onClick={() => setCreateOpen(true)}
                className="bg-zinc-900 text-white hover:bg-zinc-800 h-11 px-6 rounded-xl shadow-sm"
              >
                <UserPlus className="mr-2 w-4 h-4" />
                Thêm người dùng
              </Button>
            </div>

            {error && (
               <div className="p-4 rounded-xl bg-red-50 border border-red-100 flex items-center gap-3 text-red-700 text-sm">
                 <AlertTriangle className="w-4 h-4 shrink-0" />
                 {error}
               </div>
            )}

            {/* Content Card */}
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-zinc-100 bg-zinc-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <Input 
                    placeholder="Tìm kiếm người dùng..." 
                    className="pl-10 h-10 rounded-xl border-zinc-200 bg-white"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-widest px-2">
                  <Users className="w-4 h-4" />
                  Tổng số: {users?.length || 0}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/50">
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Người dùng</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Vai trò</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Trạng thái</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {users === null ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-20 text-center text-zinc-400">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                          Đang tải dữ liệu...
                        </td>
                      </tr>
                    ) : filteredUsers?.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-20 text-center text-zinc-400">
                          Không tìm thấy người dùng nào.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers?.map((u) => (
                        <tr key={u.uid} className="hover:bg-zinc-50/50 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-500 font-bold text-xs uppercase">
                                {u.email.substring(0, 2)}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold text-zinc-900">{u.email}</span>
                                <span className="text-[10px] text-zinc-400 font-medium font-mono uppercase tracking-tighter">UID: {u.uid.substring(0, 8)}...</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <select 
                              value={u.role}
                              onChange={e => patchUser(u.uid, { role: e.target.value as any })}
                              disabled={busy}
                              className="text-sm bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all outline-none"
                            >
                              <option value="user">User</option>
                              <option value="admin">Administrator</option>
                            </select>
                          </td>
                          <td className="px-6 py-4">
                            <button 
                              onClick={() => patchUser(u.uid, { is_active: !u.is_active })}
                              disabled={busy}
                              className={cn(
                                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all border",
                                u.is_active 
                                  ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
                                  : "bg-red-50 border-red-100 text-red-700"
                              )}
                            >
                              <span className={cn("w-1.5 h-1.5 rounded-full", u.is_active ? "bg-emerald-600" : "bg-red-600")} />
                              {u.is_active ? "Active" : "Inactive"}
                            </button>
                          </td>
                          <td className="px-6 py-4 text-right">
                             <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => deleteUser(u.uid)}
                                  disabled={busy}
                                  className="h-8 w-8 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                             </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Create User Slide-over / Modal */}
      <AnimatePresence>
        {createOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCreateOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-0 m-auto w-full max-w-md h-fit bg-white rounded-3xl shadow-2xl border border-zinc-200 z-[60] overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                 <h3 className="text-xl font-bold tracking-tight">Thêm thành viên</h3>
                 <button onClick={() => setCreateOpen(false)} className="p-2 hover:bg-zinc-100 rounded-xl transition-colors"><XCircle className="w-5 h-5 text-zinc-400" /></button>
              </div>
              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Email Address</label>
                    <Input 
                      placeholder="name@example.com" 
                      value={newEmail} 
                      onChange={e => setNewEmail(e.target.value)}
                      className="h-12 rounded-xl border-zinc-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Password</label>
                    <Input 
                      type="password" 
                      placeholder="Min 8 characters" 
                      value={newPassword} 
                      onChange={e => setNewPassword(e.target.value)}
                      className="h-12 rounded-xl border-zinc-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Role</label>
                    <div className="flex gap-2 p-1 bg-zinc-100 rounded-xl">
                      <button 
                        onClick={() => setNewRole("user")}
                        className={cn("flex-1 py-2 text-xs font-bold rounded-lg transition-all", newRole === "user" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}
                      >
                        USER
                      </button>
                      <button 
                        onClick={() => setNewRole("admin")}
                        className={cn("flex-1 py-2 text-xs font-bold rounded-lg transition-all", newRole === "admin" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}
                      >
                        ADMIN
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="pt-4 flex gap-3">
                  <Button variant="outline" onClick={() => setCreateOpen(false)} className="flex-1 h-12 rounded-xl border-zinc-200 font-semibold">Hủy</Button>
                  <Button 
                    onClick={createUser} 
                    disabled={busy || !newEmail || !newPassword}
                    className="flex-1 h-12 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 font-semibold shadow-md transition-all active:scale-95"
                  >
                    {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : "Xác nhận tạo"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
