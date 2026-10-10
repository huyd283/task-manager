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

Để bật phân công task theo tài khoản user đã tồn tại, chạy migration bổ sung:

```bash
npm run db:migrate:task-assignees
```

Migration liên kết tên người phụ trách hiện có với user tương ứng nếu tìm thấy; tên task cũ được giữ lại nếu chưa khớp user. Chỉ user đang hoạt động xuất hiện trong danh sách chọn người phụ trách.

Để chuyển tên dự án tự do cũ thành dự án có thành viên và bắt buộc mỗi task thuộc một dự án, chạy:

```bash
npm run db:migrate:projects
```

Migration giữ lại task hiện tại, tạo một project cho mỗi tên dự án cũ và thêm assignee của task vào project tương ứng trước khi đặt `tasks.project_id` thành `NOT NULL`. Chạy migration users và task-assignees trước nếu database cũ chưa có các cột hồ sơ/assignee mới. Không dùng `npm run db:init` để nâng cấp dữ liệu hiện có.

Để bật đăng ký có xác minh email, cấu hình các biến `EMAIL_*` trong `server/.env` theo `server/.env.example`, sau đó tạo bảng OTP:

```bash
npm run db:migrate:registration-otp
```

Với Gmail, bật xác minh 2 bước và tạo Google App Password; đặt giá trị đó ở `EMAIL_PASS` (không dùng mật khẩu đăng nhập Gmail). Không commit file `server/.env` hoặc đưa App Password vào mã nguồn. Mã OTP được lưu dạng HMAC, hết hạn sau 5 phút, giới hạn 5 lần nhập sai và chỉ gửi lại sau 60 giây.

## 4. Khởi tạo database + seed mock data

Script này tạo database nếu chưa có, tạo bảng `users`, `projects`, `project_members`, `tasks` và nạp dữ liệu mẫu:

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
| POST   | `/api/auth/register/request-otp` | Tạo yêu cầu đăng ký và gửi OTP email |
| POST   | `/api/auth/register/resend-otp` | Gửi lại mã với `{ email }` sau cooldown |
| POST   | `/api/auth/register/verify-otp` | Xác minh `{ email, otp }` và tạo user |
| POST   | `/api/auth/login`    | Đăng nhập `{ email, password }`     |
| GET    | `/api/auth/me`       | Thông tin user hiện tại (cần token) |

Tài khoản chỉ được tạo sau OTP hợp lệ. Mã nhân viên mới có dạng `TMT-001`, `TMT-002`, ... dựa trên ID tăng dần của user.

### Task

| Method | Endpoint                        | Mô tả                                   |
| ------ | ------------------------------- | --------------------------------------- |
| GET    | `/api/tasks`                    | Danh sách theo quyền dự án (lọc `?status=&assignee=&projectId=`) |
| GET    | `/api/tasks/:id`                | Chi tiết một task                        |
| POST   | `/api/tasks`                    | Tạo task                                 |
| PUT    | `/api/tasks/:id`                | Cập nhật toàn bộ task                    |
| PATCH  | `/api/tasks/:id/status`         | Cập nhật trạng thái `{ status }`         |
| DELETE | `/api/tasks/:id`                | Xoá task                                 |
| GET    | `/api/tasks/stats/by-assignee`  | Thống kê báo cáo theo nhân sự            |

### Quản lý dự án

Mọi endpoint yêu cầu token. Thành viên chỉ thấy dự án/task thuộc dự án của mình; admin và Project Lead có thể quản lý toàn bộ dự án.

| Method | Endpoint | Mô tả |
| ------ | -------- | ----- |
| GET | `/api/projects` | Danh sách dự án có quyền xem |
| GET | `/api/projects/:id` | Chi tiết dự án có quyền xem |
| POST | `/api/projects` | Tạo dự án với `{ code, name, description, status, memberIds }` (admin/Project Lead) |
| PUT | `/api/projects/:id` | Cập nhật dự án và danh sách thành viên (admin/Project Lead) |
| DELETE | `/api/projects/:id` | Xóa dự án chưa có task (admin/Project Lead) |
| POST | `/api/projects/:id/members` | Thêm/cập nhật thành viên với `{ userId, roleInProject }` |
| DELETE | `/api/projects/:id/members/:userId` | Gỡ thành viên |

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
  id, taskCode, projectId, project, title, description,
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
