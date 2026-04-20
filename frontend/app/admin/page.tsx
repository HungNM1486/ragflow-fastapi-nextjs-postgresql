"use client";

import AddIcon from "@mui/icons-material/Add";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Container from "@mui/material/Container";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import Link from "next/link";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useState } from "react";

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

  useEffect(() => {
    void load();
  }, [load]);

  async function logout() {
    setBusy(true);
    await fetch(`${apiBase}/api/v1/auth/logout`, { method: "POST", credentials: "include" });
    setBusy(false);
    await load();
  }

  async function createUser() {
    setBusy(true);
    setError(null);
    const { ok, data } = await apiJson<UserRow>("/api/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      }),
    });
    setBusy(false);
    if (!ok) {
      setError(formatApiError(data));
      return;
    }
    setCreateOpen(false);
    setNewEmail("");
    setNewPassword("");
    setNewRole("user");
    await load();
  }

  async function patchUser(uid: string, patch: Partial<Pick<UserRow, "is_active" | "role">>) {
    setBusy(true);
    const { ok, data } = await apiJson<UserRow>(`/api/v1/admin/users/${uid}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setBusy(false);
    if (!ok) {
      setError(formatApiError(data));
      return;
    }
    await load();
  }

  async function deleteUser(uid: string) {
    if (!window.confirm("Xóa người dùng này?")) return;
    setBusy(true);
    const { ok, data } = await apiJson<{ status?: string }>(`/api/v1/admin/users/${uid}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!ok) {
      setError(formatApiError(data));
      return;
    }
    await load();
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
          <AdminPanelSettingsIcon color="primary" fontSize="large" />
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700, flex: 1 }}>
            Quản trị người dùng
          </Typography>
          <Button component={Link} href="/" variant="text" size="small" startIcon={<HomeOutlinedIcon />}>
            Trang chủ
          </Button>
          {users ? (
            <Button
              variant="outlined"
              size="small"
              startIcon={<LogoutIcon />}
              onClick={() => void logout()}
              disabled={busy}
            >
              Đăng xuất
            </Button>
          ) : null}
        </Stack>

        {error === "unauthorized" ? (
          <Alert severity="warning" action={
            <Button component={Link} href="/login" color="inherit" size="small" startIcon={<LoginIcon />}>
              Đăng nhập
            </Button>
          }>
            Bạn cần đăng nhập bằng tài khoản admin.
          </Alert>
        ) : error ? (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}

        {users ? (
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Danh sách ({users.length})
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setCreateOpen(true)}
                  disabled={busy}
                >
                  Thêm người dùng
                </Button>
              </Stack>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Email</TableCell>
                    <TableCell>Vai trò</TableCell>
                    <TableCell align="center">Kích hoạt</TableCell>
                    <TableCell align="right">Thao tác</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.uid}>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <FormControl size="small" sx={{ minWidth: 110 }}>
                          <InputLabel id={`role-${u.uid}`}>Vai trò</InputLabel>
                          <Select
                            labelId={`role-${u.uid}`}
                            label="Vai trò"
                            value={u.role}
                            disabled={busy}
                            onChange={(e) =>
                              void patchUser(u.uid, { role: e.target.value as "admin" | "user" })
                            }
                          >
                            <MenuItem value="user">user</MenuItem>
                            <MenuItem value="admin">admin</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell align="center">
                        <FormControlLabel
                          control={
                            <Switch
                              checked={u.is_active}
                              disabled={busy}
                              onChange={(e) => void patchUser(u.uid, { is_active: e.target.checked })}
                            />
                          }
                          label=""
                          sx={{ m: 0 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          color="error"
                          size="small"
                          startIcon={<DeleteOutlineOutlinedIcon />}
                          disabled={busy}
                          onClick={() => void deleteUser(u.uid)}
                        >
                          Xóa
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : error !== "unauthorized" ? (
          <Typography color="text.secondary">Đang tải…</Typography>
        ) : null}
      </Stack>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Thêm người dùng</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="Mật khẩu (≥ 8 ký tự)"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              fullWidth
              required
            />
            <FormControl fullWidth>
              <InputLabel>Vai trò</InputLabel>
              <Select
                value={newRole}
                label="Vai trò"
                onChange={(e) => setNewRole(e.target.value as "user" | "admin")}
              >
                <MenuItem value="user">user</MenuItem>
                <MenuItem value="admin">admin</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Hủy</Button>
          <Button variant="contained" onClick={() => void createUser()} disabled={busy}>
            Tạo
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
