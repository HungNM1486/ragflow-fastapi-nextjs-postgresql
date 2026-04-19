"use client";

import ChatIcon from "@mui/icons-material/Chat";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";

type Props = { healthLine: string };

export default function HomeView({ healthLine }: Props) {
  const ok = healthLine.toLowerCase().includes("ok");
  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
            RAGFlow Legal
          </Typography>
          <Chip
            label={healthLine}
            color={ok ? "success" : "warning"}
            size="small"
            sx={{
              fontWeight: 500,
              maxWidth: "100%",
              height: "auto",
              py: 0.5,
              "& .MuiChip-label": { whiteSpace: "normal" },
            }}
          />
        </Box>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Trình duyệt → Next <code>/api/v1</code> → FastAPI → RAGFlow. Cấu hình{" "}
              <code>RAGFLOW_API_KEY</code>, <code>RAGFLOW_CHAT_ID</code> trong{" "}
              <code>docker/ragflow/upstream/.env</code>.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              RAGFlow UI trên host: cổng theo <code>.env</code> (thường <code>18080</code>).
            </Typography>
          </CardContent>
          <CardActions sx={{ px: 2, pb: 2, flexWrap: "wrap", gap: 1 }}>
            <Button
              component={Link}
              href="/chat"
              variant="contained"
              startIcon={<ChatIcon />}
            >
              Chat
            </Button>
            <Button
              component={Link}
              href="/admin"
              variant="outlined"
              startIcon={<AdminPanelSettingsIcon />}
            >
              Admin
            </Button>
          </CardActions>
        </Card>
      </Stack>
    </Container>
  );
}
