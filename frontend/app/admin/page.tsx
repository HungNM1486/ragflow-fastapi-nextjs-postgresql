"use client";

import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";

export default function AdminPage() {
  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <AdminPanelSettingsIcon color="primary" fontSize="large" />
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            Quản trị
          </Typography>
        </Stack>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="body1" sx={{ mb: 1.5 }}>
              Quản lý người dùng và cấu hình — sẽ nối API sau.
            </Typography>
            <Alert severity="info" variant="outlined">
              Trang này chỉ là khung giao diện (Material UI).
            </Alert>
          </CardContent>
        </Card>

        <Box>
          <Button
            component={Link}
            href="/"
            variant="contained"
            startIcon={<HomeOutlinedIcon />}
          >
            Về trang chủ
          </Button>
        </Box>
      </Stack>
    </Container>
  );
}
