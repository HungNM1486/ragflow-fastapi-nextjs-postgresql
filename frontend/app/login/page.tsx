"use client";

import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import LoginIcon from "@mui/icons-material/Login";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Link from "next/link";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Stack spacing={2} component="form" onSubmit={onSubmit}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Đăng nhập
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Phiên cookie HttpOnly; dùng tài khoản admin từ backend (bootstrap hoặc đã tạo).
        </Typography>
        {error ? (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          fullWidth
        />
        <TextField
          label="Mật khẩu"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          fullWidth
        />
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button type="submit" variant="contained" disabled={busy} startIcon={<LoginIcon />}>
            Đăng nhập
          </Button>
          <Button component={Link} href="/" variant="text" startIcon={<HomeOutlinedIcon />}>
            Trang chủ
          </Button>
        </Box>
      </Stack>
    </Container>
  );
}
