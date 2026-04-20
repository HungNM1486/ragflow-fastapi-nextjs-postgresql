# Yêu cầu dự án — Chatbot pháp lý (dev)

Tài liệu ghi nhận kiến trúc và ràng buộc đã thống nhất cho bản phát triển (dev). Cập nhật khi phạm vi thay đổi.

---

## 1. Mục tiêu

- Ứng dụng chatbot hỏi đáp pháp lý, **RAGFlow** làm lõi xử lý RAG, quản lý văn bản và luồng trả lời.
- Triển khai bằng **Docker** cho **RAGFlow** và **PostgreSQL ứng dụng** (cùng mạng bridge `ragflow` với các dependency RAGFlow). **Backend (FastAPI)** và **frontend (Next.js)** có thể chạy **trên host** khi phát triển (reload nhanh), hoặc chạy trong Docker khi cần môi trường gần prod (profile `app-docker`).

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

- **`/admin`:** **Quản lý người dùng** (danh sách, tạo, đổi vai trò `admin`/`user`, bật/tắt kích hoạt, xóa). Cần đăng nhập admin qua **`/login`** (cookie phiên HttpOnly qua proxy Next `/api/v1/*`).
- API backend: `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`; quản trị: `GET/POST/PATCH/DELETE /api/v1/admin/users` (chỉ `role=admin`). Định danh công khai: **`uid`** (UUID).
- **Bootstrap admin (dev):** nếu bảng `users` rỗng, backend có thể tạo một admin từ biến **`BOOTSTRAP_ADMIN_EMAIL`** / **`BOOTSTRAP_ADMIN_PASSWORD`** trong `backend/.env` (xem `backend/.env.example`). Mật khẩu tối thiểu **8 ký tự** (bcrypt).
- **Không** xây UI quản lý tài liệu trong FE admin; dùng UI RAGFlow cho knowledge base.

---

## 8. Mạng và bảo mật tầng triển khai

- **Trong Docker:** RAGFlow, MySQL/MinIO/Redis/… (theo upstream), **Postgres ứng dụng** (`postgres_app`) giao tiếp trên mạng nội bộ Compose. **Ollama chạy trên host** nên RAGFlow (trong Docker) gọi API Ollama qua **`http://host.docker.internal:11434`** (hoặc IP bridge của host); trên Linux Compose cần `extra_hosts: ["host.docker.internal:host-gateway"]` trên dịch vụ gọi Ollama (đã có trên `ragflow-cpu` / backend trong Docker).
- **Dev — BE/FE trên host:** Postgres ứng dụng được **publish ra loopback** (`127.0.0.1:${POSTGRES_APP_HOST_PORT:-5433}`) để FastAPI trên host kết nối; RAGFlow API đã map cổng trên host qua biến `SVR_HTTP_PORT` trong `docker/ragflow/upstream/.env` (backend trên host đặt `RAGFLOW_BASE_URL=http://127.0.0.1:<cổng đó>`). Phạm vi dev: chấp nhận bind **localhost** cho Postgres/API app, **chưa** yêu cầu hardening hạ tầng mức production.
- **Production / mặc định bảo mật:** Chỉ **FE (hoặc reverse proxy phía FE)** nên tiếp xúc Internet; các dịch vụ còn lại không public trực tiếp. Ollama trên host nên chỉ lắng nghe **localhost** nếu có thể.

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

- **File `compose.yaml` (gốc repo):** `include` stack RAGFlow từ `docker/ragflow/upstream/docker-compose.yml`; thêm **`postgres_app`** (Postgres riêng cho FastAPI). **`backend`** và **`frontend`** thuộc profile **`app-docker`** — chỉ khởi động khi bật profile đó (full stack trong container).
- **Chế độ dev khuyến nghị (reload nhanh):** chỉ chạy hạ tầng + DB trong Docker; BE và FE trên host.
  1. `docker compose --env-file docker/ragflow/upstream/.env up -d` — **không** thêm `--profile app-docker` (RAGFlow vẫn theo `COMPOSE_PROFILES` trong `.env` upstream, thường `elasticsearch,cpu`).
  2. Postgres app lắng nghe trên host **`127.0.0.1:${POSTGRES_APP_HOST_PORT:-5433}`** (tránh đụng Postgres local cổng 5432 nếu có).
  3. Backend: trong thư mục `backend/`, tạo `.env` từ **`backend/.env.example`**, điền `RAGFLOW_API_KEY` / `RAGFLOW_CHAT_ID` (cùng giá trị như trong `docker/ragflow/upstream/.env`), chỉnh `DATABASE_URL` / `RAGFLOW_BASE_URL` nếu cổng khác mặc định. Chạy API (ví dụ): `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`.
  4. Frontend: trong `frontend/`, `npm install` nếu cần; **`npm run dev`** — route proxy `/api/v1/*` dùng `INTERNAL_API_URL` (mặc định trong code: `http://127.0.0.1:8000`). Mở `http://127.0.0.1:3000`.
- **Full stack trong Docker (như trước):** phải bật **`app-docker`** **cùng lúc** với profile RAGFlow (doc engine + `cpu`/`gpu`). Không chạy chỉ `docker compose … --profile app-docker` vì biến `--profile` trên CLI có thể **ghi đè** `COMPOSE_PROFILES` trong `.env` và làm thiếu `ragflow-cpu` / ES. Cách an toàn:  
  `COMPOSE_PROFILES=elasticsearch,cpu,app-docker docker compose --env-file docker/ragflow/upstream/.env up -d`  
  (thay `elasticsearch,cpu` bằng đúng cặp `DOC_ENGINE`,`DEVICE` trong `.env` nếu khác), **hoặc** sửa trong `docker/ragflow/upstream/.env` dòng `COMPOSE_PROFILES=…` thành kết thúc bằng `,app-docker`. Khi đó **frontend** publish `127.0.0.1:${APP_FE_PORT:-3000}`, **backend** publish `127.0.0.1:${APP_BACKEND_PORT:-8000}`.
- Biến môi trường RAGFlow và cổng public: **`docker/ragflow/upstream/.env`** (ví dụ UI web `SVR_WEB_HTTP_PORT`, API `SVR_HTTP_PORT`).
- **Ollama trên host** — tham chiếu model tại `docker/.env.llm`; cấu hình LLM trong UI RAGFlow.
- Alembic: mọi thay đổi schema Postgres (backend) qua migration trong `backend/alembic/` (migration `20260420_0003`: bảng `users`, `sessions`).
- **Kiểm thử auth/admin:** trong `backend/`, tạo venv (`python3 -m venv .venv`), cài `requirements.txt`, `alembic upgrade head`, chạy **`pytest`** — cần Postgres app đạt (mặc định `DATABASE_URL` trỏ `127.0.0.1:5433`); nếu không có DB, các test tích hợp được bỏ qua (`conftest`).

---

*Tài liệu này là nguồn tham chiếu yêu cầu; chi tiết API và schema nên được bổ sung trong các tài liệu kỹ thuật riêng khi triển khai.*
