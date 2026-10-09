# Task Manager

Web quản lý công việc với **Express + MySQL** (backend) và **React + Vite + TailwindCSS** (frontend), chạy đồng thời bằng `concurrently`.

```
task-manager/
├── package.json        # scripts gốc, dùng concurrently chạy cả FE + BE
├── server/             # Express + TypeScript + MySQL (mysql2)
└── client/             # React + Vite + TypeScript + TailwindCSS
```

## 1. Yêu cầu

- Node.js >= 18
- MySQL >= 8 đang chạy (local hoặc Docker)

## 2. Cài đặt

```bash
# Tại thư mục gốc – cài cho cả root, server và client
npm run install:all
```

## 3. Cấu hình database

Thông tin kết nối nằm trong [server/.env](server/.env). Sửa cho khớp với MySQL của bạn:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=task_manager
JWT_SECRET=change-this-super-secret-key-in-production
```

> `server/.env` đã được tạo sẵn với giá trị mặc định để chạy local ngay. Trên môi trường thật hãy đổi `JWT_SECRET`.

### Nâng cấp database hiện có

Để bật quản lý nhân sự trên database đã có dữ liệu, chạy migration an toàn sau khi cấu hình kết nối:

```bash
npm run db:migrate:users
```

Migration bổ sung mã nhân viên, chức danh, phòng ban và trạng thái tài khoản; không xóa dữ liệu users hoặc tasks. User hiện có được backfill hồ sơ và kích hoạt một lần; các trạng thái tài khoản được thay đổi sau đó sẽ được giữ nguyên khi chạy lại migration. Không dùng `npm run db:init` để nâng cấp database hiện có vì lệnh đó tạo lại dữ liệu mẫu.

## 4. Khởi tạo database + seed mock data

Script này tạo database nếu chưa có, tạo bảng `users` + `tasks` và nạp dữ liệu mẫu:

```bash
npm run db:init
```

Sau khi chạy, bạn có 4 tài khoản mẫu (mật khẩu chung: `password123`):

| Email                   | Vai trò |
| ----------------------- | ------- |
| an@taskmanager.dev      | admin   |
| binh@taskmanager.dev    | member  |
| cuong@taskmanager.dev   | member  |
| dung@taskmanager.dev    | member  |

## 5. Chạy ứng dụng (FE + BE cùng lúc)

```bash
npm run dev
```

- Backend: http://localhost:4000
- Frontend: http://localhost:5173 (đã proxy `/api` sang backend)

---

## API

Tất cả endpoint của Task yêu cầu header `Authorization: Bearer <token>`.

### Auth

| Method | Endpoint             | Mô tả                        |
| ------ | -------------------- | ---------------------------- |
| POST   | `/api/auth/register` | Đăng ký `{ name, email, password }` |
| POST   | `/api/auth/login`    | Đăng nhập `{ email, password }`     |
| GET    | `/api/auth/me`       | Thông tin user hiện tại (cần token) |

### Task

| Method | Endpoint                        | Mô tả                                   |
| ------ | ------------------------------- | --------------------------------------- |
| GET    | `/api/tasks`                    | Danh sách (lọc `?status=&assignee=&project=`) |
| GET    | `/api/tasks/:id`                | Chi tiết một task                        |
| POST   | `/api/tasks`                    | Tạo task                                 |
| PUT    | `/api/tasks/:id`                | Cập nhật toàn bộ task                    |
| PATCH  | `/api/tasks/:id/status`         | Cập nhật trạng thái `{ status }`         |
| DELETE | `/api/tasks/:id`                | Xoá task                                 |
| GET    | `/api/tasks/stats/by-assignee`  | Thống kê báo cáo theo nhân sự            |

### Quản lý nhân sự

Các endpoint dưới đây yêu cầu token của tài khoản `admin`. Tài khoản bị tạm khóa không thể đăng nhập hoặc tiếp tục gọi API bằng token cũ.

| Method | Endpoint | Mô tả |
| ------ | -------- | ----- |
| GET | `/api/users` | Danh sách nhân sự |
| POST | `/api/users` | Tạo hồ sơ và tài khoản với `{ name, email, password, jobTitle, department }` |
| PUT | `/api/users/:id` | Cập nhật `{ name, email, jobTitle, department }` |
| PATCH | `/api/users/:id/status` | Kích hoạt/khóa với `{ isActive }` |
| DELETE | `/api/users/:id` | Xóa nhân sự; không thể xóa tài khoản hiện tại hoặc admin cuối cùng |

Chức danh công việc (`Project Lead`, `Developer`, `Tester`, `Designer`) độc lập với quyền hệ thống (`admin`, `member`).

### Trạng thái (status)

`TODO` · `IN_PROGRESS` · `IN_REVIEW` · `DONE` · `PENDING`

### Model Task

```ts
{
  id, taskCode, project, title, description,
  status, assignee,
  startDate, estimatedDate, dueDate, actualDate,
  createdAt, updatedAt
}
```

## Scripts hữu ích

| Lệnh (tại root)        | Tác dụng                                  |
| ---------------------- | ----------------------------------------- |
| `npm run dev`          | Chạy backend + frontend cùng lúc          |
| `npm run db:init`      | Tạo bảng + seed mock data                 |
| `npm run db:migrate:users` | Nâng cấp bảng users mà không xóa dữ liệu |
| `npm run build`        | Build cả server và client                 |
| `npm run install:all`  | Cài dependencies cho root + server + client |
# task-manager
