# Yêu cầu dự án — Chatbot pháp lý (dev)

Tài liệu ghi nhận kiến trúc và ràng buộc đã thống nhất cho bản phát triển (dev). Cập nhật khi phạm vi thay đổi.

---

## 1. Mục tiêu

- Ứng dụng chatbot hỏi đáp pháp lý, **RAGFlow** làm lõi xử lý RAG, quản lý văn bản và luồng trả lời.
- Triển khai bằng **Docker**: các dịch vụ nội bộ giao tiếp trên mạng riêng; chỉ **frontend** tiếp xúc Internet.

---

## 2. Thành phần hệ thống

| Thành phần | Vai trò |
|------------|---------|
| **RAGFlow** | Quản lý tài liệu, pipeline RAG, nhận câu hỏi từ backend, trả câu trả lời (kèm citation). UI quản lý tài liệu dùng giao diện sẵn có của RAGFlow. |
| **Backend (FastAPI)** | Proxy giữa FE và RAGFlow; xác thực người dùng; lưu trữ nghiệp vụ (Postgres + Alembic). Không thay thế logic RAG của RAGFlow. |
| **Database (PostgreSQL)** | Dữ liệu backend: người dùng, phiên, hội thoại (chi tiết), ánh xạ `conversation_id` với RAGFlow, v.v. |
| **Frontend (Next.js)** | Giao diện chatbot, thông tin cá nhân. Đường dẫn **`/admin`**: quản lý người dùng (phạm vi admin hiện tại). |
| **Ollama (self-host, trên host)** | **Không** chạy Ollama trong container Docker của dự án; cài đặt và chạy Ollama trực tiếp trên máy chủ (mặc định API `http://127.0.0.1:11434`). LLM: `gemma4:e2b` (`ollama pull gemma4:e2b` / `ollama run gemma4:e2b`). RAGFlow cấu hình trỏ tới Ollama trên host (từ container dùng `host.docker.internal` + `extra_hosts`, xem mục 8 / `docker/.env.llm`). |

---

## 3. Luồng chat

1. Người dùng gửi tin qua FE → **FastAPI**.
2. FastAPI chuyển tiếp yêu cầu tới **RAGFlow** (proxy / orchestration mỏng, không nhân đôi xử lý RAG).
3. **RAGFlow** xử lý toàn bộ (retrieval, gọi LLM, định dạng phản hồi có citation).
4. RAGFlow trả kết quả → FastAPI → FE.

**Đồng bộ `conversation_id`:** Một định danh phiên hội thoại thống nhất giữa **backend (Postgres / API)** và **RAGFlow** (cùng giá trị hoặc ánh xạ 1–1 rõ ràng, không tách hai chuẩn khác nhau cho cùng một cuộc hội thoại).

---

## 4. Định danh API cho frontend

- Mọi thực thể exposed qua API (ngoài khóa nội bộ `id` nếu có) cần có **`uid`** (định danh công khai, ổn định, an toàn khi lộ trên client) để FE chỉ làm việc với `uid`, không phụ thuộc vào id số nội bộ.

---

## 5. Citation

- **Bắt buộc:** Mỗi câu trả lời phải có **citation** (theo khả năng RAGFlow đã hỗ trợ). Backend/FE không làm suy giảm yêu cầu này ở bản dev.

---

## 6. Xác thực và phiên

- Đăng nhập: **email + mật khẩu**.
- Quản lý phiên: **session cookie** (HttpOnly, Secure trong môi trường TLS, SameSite phù hợp). Không mô tả chi tiết triển khai tại đây; ràng buộc là cookie session, không JWT-only cho phiên nếu không có quyết định khác.

---

## 7. Admin

- **`/admin`:** Chỉ **quản lý người dùng** trên site (CRUD / khóa tài khoản / vai trò tối thiểu nếu có — chi tiết schema do thiết kế API bổ sung).
- **Không** xây UI quản lý tài liệu trong FE admin; dùng UI RAGFlow cho knowledge base.

---

## 8. Mạng và bảo mật tầng triển khai

- Giao tiếp **nội bộ** giữa: FE (server-side) hoặc gateway ↔ FastAPI ↔ RAGFlow ↔ Postgres; **Ollama chạy trên host** nên RAGFlow (trong Docker) gọi API Ollama qua **`http://host.docker.internal:11434`** (hoặc IP bridge của host), với Compose Linux cần `extra_hosts: ["host.docker.internal:host-gateway"]` trên dịch vụ gọi Ollama.
- Chỉ **FE (hoặc reverse proxy phía FE)** bind ra ngoài Internet; các dịch vụ còn lại không public trực tiếp. Ollama trên host chỉ lắng nghe **localhost** nếu có thể, để không lộ API ra mạng ngoài.

---

## 9. Lưu trữ hội thoại

- **Lưu toàn bộ** nội dung hội thoại, **mức chi tiết cao** (tin nhắn, metadata hữu ích cho debug/audit dev: thời điểm, vai trò user/assistant, tham chiếu `conversation_id` / `uid`, payload citation nếu backend nhận được từ RAGFlow).
- Dev vẫn nên thiết kế schema để sau này có thể bổ sung retention/GDPR; **chưa** bắt buộc trong phạm vi dev hiện tại.

---

## 10. Nguyên tắc phát triển thư viện (backend & FE)

- **Ưu tiên tối đa** dùng thư viện có sẵn, bảo trì tốt (ORM/migration, auth session, HTTP client, validation, UI component, v.v.).
- **Chủ động** khai báo và cài đặt dependency qua package manager chuẩn (ví dụ `requirements.txt` / `pyproject.toml`, `package.json`); hạn chế tự viết lại phần đã có thư viện ổn định.

---

## 11. Ngoài phạm vi bản dev (ghi nhận, chưa làm)

- Miễn trừ trách nhiệm pháp lý, tuyên bố phạm vi tư vấn.
- Khóa bộ luật / khu vực pháp lý cụ thể trên UI.
- Các yêu cầu tuân thủ sản xuất khác (nếu có) sẽ bổ sung sau.

---

## 12. Ghi chú triển khai

- **Hạ tầng Docker:** file gốc `compose.yaml` gộp RAGFlow (file vendor trong `docker/ragflow/upstream/`, nguồn infiniflow/ragflow), Postgres ứng dụng (`postgres_app`), `backend` (FastAPI), `frontend` (Next.js). Khởi chạy: `docker compose --env-file docker/ragflow/upstream/.env up -d`. Biến môi trường RAGFlow + port: chỉnh tại `docker/ragflow/upstream/.env` (đồng bộ với `env_file` của các service upstream).
- Chỉ **frontend** publish cổng host mặc định `127.0.0.1:3000` (`APP_FE_PORT`). RAGFlow web/API dùng các cổng trong `.env` upstream (ví dụ UI `18080`, API host `19380`).
- **Ollama trên host** — tham chiếu model tại `docker/.env.llm`; cấu hình LLM trong UI RAGFlow.
- Alembic: mọi thay đổi schema Postgres (backend) qua migration trong `backend/alembic/`.

---

*Tài liệu này là nguồn tham chiếu yêu cầu; chi tiết API và schema nên được bổ sung trong các tài liệu kỹ thuật riêng khi triển khai.*
