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

### Tích hợp xác thực Checkin

Đặt `CHECKIN_BASE_URL`, `CHECKIN_PARTNER_CODE` và `CHECKIN_PARTNER_TOKEN` trong `server/.env` hoặc secret manager. Dùng `TMT_PM` làm partner code và lưu token bên ngoài repository; không đưa token vào mã nguồn hay log. Khi khởi động, server tự thêm `partner_user_id` và `partner_status` cùng unique index nếu còn thiếu. Migration có thể chạy riêng bằng `cd server && npm run db:migrate:checkin`.

Với Docker Compose, backend nạp cấu hình từ `server/.env` qua `env_file`; sau khi cập nhật cấu hình cần tạo lại container bằng `docker compose up -d --force-recreate backend`. Không đặt token thật trong `.env.example`.

Login nhận `username`/`password` ở TomoHub. Admin TomoHub và tài khoản chưa liên kết Checkin dùng bcrypt/password nội bộ; nhân sự có `partner_user_id` được xác thực qua Checkin. Checkin cần hỗ trợ trường `username` trong request verify. Chỉ phản hồi `verified: true` và `status: ACTIVE` mới nhận JWT do TomoHub tự cấp; trạng thái khác sẽ vô hiệu hóa tài khoản nội bộ và bị từ chối.

```bash
cd server && npm run build && npm run checkin:sync
```

Lệnh trên lấy toàn bộ trang `/api/v1/internal/employees` (`page`/`limit`) và upsert theo email, đồng thời dùng `partner_user_id` để cập nhật nếu email thay đổi. Mỗi request danh sách tạo UUID v7 riêng ở `X-Client-Message-Id`; request auth verify không gửi header này. Tài khoản admin TomoHub được giữ nguyên và bỏ qua nếu email/partner ID khớp; nếu API có `isAccAdmin=1` thì bản ghi đó cũng bị bỏ qua. Bản ghi thiếu email hợp lệ được bỏ qua và chỉ ghi số lượng tổng hợp vào log. Nhân viên inactive, terminated và soft-deleted vẫn được đồng bộ, với trạng thái lưu ở `partner_status` và tài khoản không active nếu trạng thái khác `ACTIVE`. Tài khoản mới có mật khẩu ngẫu nhiên không dùng để login (đăng nhập xác thực qua Checkin).

Sau lần chạy thành công đầu tiên, checkpoint được lưu trong `checkin_sync_state`. Các lần sau gửi `updated_since` từ checkpoint trừ phần overlap để hạn chế bỏ sót thay đổi gần thời điểm chạy. Cấu hình `CHECKIN_EMPLOYEE_PAGE_SIZE` (mặc định 200) và `CHECKIN_EMPLOYEE_SYNC_OVERLAP_SECONDS` (mặc định 120). Phía Checkin cần trả tất cả trạng thái, hỗ trợ `page`, `limit`, `updated_since`, sắp thứ tự ổn định `(updated_at, id)`, và cung cấp danh sách qua `data` array hoặc `data.employees`/`data.items`/`data.records`/`data.content`; metadata phân trang có thể đặt ở `data.pagination` và nên có `hasNext`/`hasNextPage`/`totalPages`. Nếu không có metadata, TomoHub tiếp tục khi trang đủ `limit`. Các alias đang map gồm `id` → `userId`, `fullName` → `name`, `positionName` → `jobTitle`, `departmentName` → `department`, và `status`/`state`; trạng thái xóa mềm cần được biểu diễn bằng `isDeleted`, `deleted`, `deletedAt` hoặc status phù hợp.

Để tự chạy mỗi ngày lúc 02:00 theo giờ máy chủ, thêm cron trên host (đổi đường dẫn theo môi trường):

```cron
0 2 * * * cd /path/to/task-manager/server && npm run checkin:sync >> /var/log/tomohub-checkin-sync.log 2>&1
```

Đảm bảo đã build bản deploy, `.env` được nạp trong môi trường cron và cấu hình URL HTTPS ở production. Mỗi nhân viên cần `userId` (hoặc `id`), `email`, `name`, tùy chọn `username` (hoặc `userName`), `status`/`state`, `isAccAdmin`, trạng thái soft-delete (`isDeleted`/`deleted`/`deletedAt`), `jobTitle`, `department`. Không trả password/token hoặc trường nhạy cảm trong payload nhân sự.

### Internal Partner Notifications

The endpoint `POST /api/v1/internal/notifications/send` is called by Checkin and authenticates `X-Partner-Code` and `X-Partner-Token` against TomoHub's partner configuration. It validates `userIds` exclusively against `users.partner_user_id`, deduplicates IDs, caps the input at 50, and rejects the whole request with HTTP 400 / `INVALID_NOTIFICATION_RECIPIENTS` unless every user is active, has `partner_status = 'ACTIVE'`, is not marked `is_acc_admin`, and is not a local admin. Valid requests are recorded per recipient in `notification_history` with status `RECORDED`; this partner route does not invoke FCM and does not require device tokens. Its response reports `accepted`/`recorded` counts; `sent` remains 0 because no device delivery is attempted.

Admins can manage notifications in the TomoHub web app at `/notifications`; the mirror status list is available at `/employees`. These screens use authenticated admin APIs and do not expose partner credentials to the browser. For sends, the browser calls TomoHub's `POST /api/admin/notifications/send`; the TomoHub backend then calls the Checkin server at `CHECKIN_BASE_URL/api/v1/internal/notifications/send` with partner headers and a fresh UUID v7 `X-Client-Message-Id`. The TomoHub admin API returns the `data` payload from Checkin.

The similarly named `POST /api/v1/internal/notifications/send` mounted in TomoHub is a separate inbound route for Checkin-to-TomoHub requests; it records validated requests locally without invoking FCM. The Admin flow sends outbound to the Checkin host. Checkin API responses are logged as redacted summaries; credentials and notification content are not logged. With PM2, inspect output using `pm2 logs <app-name> --lines 200` and search for `[Checkin response]`, `/api/v1/internal/notifications/send`, or the returned request ID.

Run the schema migration before deployment with `cd server && npm run db:migrate:notifications`; the server also applies it during startup. Configure Firebase Admin with `FIREBASE_SERVICE_ACCOUNT_JSON` from a secret manager, or provide Application Default Credentials, and optionally set `FIREBASE_PROJECT_ID`. Never commit service-account credentials.

The TomoHub inbound route stores per-recipient history, and internal partner requests are written to `internal_partner_audit`, including rejected requests. The Admin send now delegates delivery to the Checkin API and does not use TomoHub FCM tokens.

The backend schedules two jobs in `Asia/Ho_Chi_Minh`: task/due-date/new-assignment reminders at 09:00 and reminders for assigned users with no task history/comment/attachment activity that day at 09:30. Both skip Sundays and the last two Saturdays of each month. “Due soon” means due today or tomorrow; overdue tasks have a due date before today. Jobs use MySQL advisory locks to avoid duplicate execution across PM2 workers and call the existing `sendNotificationToCheckin` service; Checkin handles device delivery and no TomoHub FCM tokens are required for these jobs. Per-recipient attempts are stored in `notification_history` with source `CRON_DAILY` or `CRON_INACTIVITY`; failures to contact Checkin are stored with status `FAILED`.

Example request body:

```json
{
  "userIds": [123, 124],
  "title": "Thông báo từ hệ thống công việc",
  "body": "Bạn có công việc cần xử lý.",
  "data": {
    "type": "GENERAL_NOTIFICATION",
    "screen": "HOME",
    "taskId": "TASK-0073"
  }
}
```

Để nâng cấp workflow, mức ưu tiên, lịch sử thao tác và bảng lưu tệp đính kèm trên database đang có dữ liệu, chạy:

```bash
npm run db:migrate:task-workflow
```

Migration đổi task `IN_REVIEW` cũ thành `DEV_DONE`, thêm `TESTING`, `TEST_FAIL` và mức ưu tiên mặc định `MEDIUM`; dữ liệu task hiện có được giữ nguyên. Migration cũng tạo quan hệ nhiều-nhiều người phụ trách task và chuyển người phụ trách hiện tại sang quan hệ mới, thêm `completed_at` để ghi timestamp tự động khi task vào `DONE`, và các cột soft-delete (`deleted_at`, `deleted_by_user_id`). Xóa task chỉ dành cho Admin và không xóa cứng lịch sử. Chuyển sang `IN_PROGRESS` yêu cầu có cả ngày bắt đầu và hạn chót; Backlog hỗ trợ tìm kiếm/cuộn, Sprint ẩn task `DONE`, và workflow cho phép chuyển `TESTING` thẳng sang `DONE` để bỏ qua Review. Hãy chạy migration trước khi triển khai backend/frontend mới. Tệp đính kèm hỗ trợ ảnh dưới 5 MB; PDF và text tối đa 8 MB mỗi tệp.
Với database từ phiên bản cũ, hãy chạy sau các migration `users`, `task-assignees` và `projects` nếu những phần đó chưa được nâng cấp.
Backend cũng tự kiểm tra và áp dụng migration này trước khi mở cổng nhận request. Tài khoản database chạy ứng dụng cần quyền `ALTER` và `CREATE`; nếu muốn tách migration khỏi lúc khởi động, hãy chạy lệnh migration trong bước deploy trước khi khởi động backend.

Để nâng cấp giờ dự tính/giờ thực tế, bình luận, subtask, sprint và Golive, chạy:

```bash
npm run db:migrate:task-features
```

Migration thêm `tasks.estimated_time DECIMAL(8,2)` (đơn vị giờ), `logged_hours`, `golive_date`, `acceptance_notes`, `sprint_id`; tạo `task_comments`, `task_subtasks`, `sprints`; thêm `users.username` và cấu hình `projects.require_logged_time`. `estimated_date` vẫn là ngày dự kiến trên lịch, không phải estimate effort. Vì phiên bản cũ không lưu estimate effort thành số giờ có thể quy đổi an toàn, dữ liệu mới được đặt `NULL` thay vì tự suy đoán/nhân ngày thành giờ. Migration chạy tự động khi server khởi động; deploy có thể chạy lệnh tường minh trước đó. Cần chạy sau migration workflow/projects/users trên database cũ.

## 4. Khởi tạo database + seed mock data

Script này tạo database nếu chưa có, tạo bảng ứng dụng (gồm `users`, `projects`, `project_members`, `tasks`, `task_history`, `task_attachments`) và nạp dữ liệu mẫu:

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

Backend hỗ trợ cả hai dạng đường dẫn: `/api/...` và `...` không có tiền tố `/api` (ví dụ `POST /api/auth/login` hoặc `POST /auth/login`).

Tất cả endpoint của Task yêu cầu header `Authorization: Bearer <token>`.

### Auth

| Method | Endpoint             | Mô tả                        |
| ------ | -------------------- | ---------------------------- |
| POST   | `/api/auth/register/request-otp` | Tạo yêu cầu đăng ký và gửi OTP email |
| POST   | `/api/auth/register/resend-otp` | Gửi lại mã với `{ email }` sau cooldown |
| POST   | `/api/auth/register/verify-otp` | Xác minh `{ email, otp }` và tạo user |
| POST   | `/api/auth/login`    | Đăng nhập `{ username, password }`  |
| GET    | `/api/auth/me`       | Thông tin user hiện tại (cần token) |

Tài khoản chỉ được tạo sau OTP hợp lệ. Mã nhân viên mới có dạng `TMT-001`, `TMT-002`, ... dựa trên ID tăng dần của user.

### Task

| Method | Endpoint                        | Mô tả                                   |
| ------ | ------------------------------- | --------------------------------------- |
| GET    | `/api/tasks`                    | Danh sách theo quyền dự án; lọc `status`, `assigneeId`, `projectId`, `priority`, `dueFrom`, `dueTo` |
| GET    | `/api/tasks/:id`                | Chi tiết một task                        |
| POST   | `/api/tasks`                    | Tạo task                                 |
| PUT    | `/api/tasks/:id`                | Cập nhật toàn bộ task                    |
| PATCH  | `/api/tasks/:id/status`         | Cập nhật trạng thái `{ status }`         |
| GET    | `/api/tasks/:id/history`        | Lịch sử thao tác và người thay đổi       |
| GET    | `/api/tasks/:id/attachments`    | Danh sách ảnh/tệp đính kèm               |
| POST   | `/api/tasks/:id/attachments`    | Tải tệp lên bằng `{ fileName, mimeType, dataBase64 }`; backend đối chiếu MIME type/phần mở rộng |
| GET    | `/api/tasks/:id/attachments/:attachmentId/download` | Tải tệp đính kèm với tên file UTF-8 |
| DELETE | `/api/tasks/:id/attachments/:attachmentId` | Xóa tệp đính kèm của task |
| DELETE | `/api/tasks/:id`                | Xoá task                                 |
| GET    | `/api/tasks/stats/by-assignee`  | Thống kê báo cáo theo nhân sự            |
| GET    | `/api/tasks/export`              | CSV; lọc `projectId`, `sprintId`, `from`, `to`, `assigneeId` |
| GET/POST | `/api/tasks/:id/comments`      | Danh sách/tạo comment Markdown; POST `{ body }` |
| PUT/DELETE | `/api/tasks/:id/comments/:commentId` | Sửa/xóa comment do chính user tạo |
| GET/POST | `/api/tasks/:id/subtasks`      | Danh sách/tạo subtask |
| PATCH/DELETE | `/api/tasks/:id/subtasks/:subtaskId` | Cập nhật `{ title, status, assigneeId, estimatedHours }` / xóa |

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
| GET | `/api/projects/:projectId/members/options` | Thành viên active của đúng dự án, dùng cho filter/assign |
| PATCH | `/api/projects/:id/settings` | `{ requireLoggedTime: boolean }` (admin/Project Lead) |
| GET/POST | `/api/projects/:projectId/sprints` | Danh sách/tạo Sprint `{ name, startDate, endDate, goal }` |
| PATCH | `/api/projects/:projectId/sprints/:sprintId/status` | `{ status: "ACTIVE" \| "COMPLETED" }`; đóng sprint đưa task chưa Golive về backlog |
| POST/DELETE | `/api/projects/:projectId/sprints/:sprintId/tasks[/:taskId]` | Thêm task vào sprint bằng `{ taskId }` / chuyển về backlog |

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

`TODO` → `IN_PROGRESS` → `DEV_DONE` → `TESTING` → `REVIEW` → `DONE` → `GOLIVE`

Các nhánh lỗi/hoãn: `TESTING → TEST_FAIL → IN_PROGRESS`, `TODO/IN_PROGRESS → PENDING → TODO/IN_PROGRESS`. Server từ chối các bước nhảy trạng thái; không cho vào `REVIEW`/`DONE` khi còn subtask chưa xong. Khi project bật `require_logged_time`, phải có logged hours hoặc acceptance notes trước `DONE`/`GOLIVE`. Chỉ `GOLIVE` được tính là hoàn thành 100%.

Chỉ task ở trạng thái `TODO` mới được đổi `startDate` và `dueDate`; server kiểm tra trong transaction để không thể bỏ qua quy tắc qua API. Ngày bắt đầu và ngày dự kiến hoàn thành trên danh sách dùng định dạng `DD/MM/YYYY`.

### Model Task

```ts
{
  id, taskCode, projectId, project, title, description,
  status, priority, assignee,
  startDate, estimatedDate, dueDate, actualDate,
  estimatedHours, loggedHours, goliveDate, sprintId, subtaskProgress,
  createdAt, updatedAt
}
```

### Cập nhật UI cho 8 tính năng

1. **Estimate theo giờ:** Task modal nhập `estimatedHours` dạng số thập phân, `loggedHours` và acceptance notes; danh sách/Dashboard/Báo cáo hiển thị giờ. `estimatedDate` vẫn là ngày lịch.
2. **Comment/Subtask:** Chi tiết task có tab Comment (Markdown an toàn, timestamp, chèn `@username`) và Subtask (assignee, trạng thái, giờ, tiến độ %). Nội dung comment được render thành text/React nodes, không chèn HTML tùy ý.
3. **Filter theo thành viên:** Chọn dự án trước; danh sách thành viên trong Task/Urgent và bộ lọc assignee chỉ gọi `/projects/:projectId/members/options`, không tải user toàn hệ thống. Kết hợp với trạng thái, ưu tiên, hạn chót.
4. **Sprint:** `/sprints` cung cấp tạo Sprint, chọn task từ Backlog, Start/Complete. Việc đưa task vào sprint dùng thao tác chọn thay cho drag-drop; đóng sprint chuyển task chưa Golive về Backlog.
5. **Workflow:** Dropdown chỉ hiện trạng thái hiện tại và bước hợp lệ kế tiếp; API cũng kiểm tra transition để ngăn client bỏ qua quy tắc.
6. **Golive:** Badge tím riêng; ngày Golive được ghi nhận khi chuyển `DONE → GOLIVE`; Dashboard và báo cáo chỉ đếm Golive là hoàn tất.
7. **Export:** Màn hình Báo cáo hỗ trợ tải CSV UTF-8 theo project/sprint/ngày/nhân sự. CSV được escape và chặn chuỗi mở đầu công thức bảng tính.
8. **Gán thành viên:** Modal task lọc user active đã thuộc dự án bằng tìm tên/email/username và phòng ban; backend vẫn xác thực assignee thuộc project.

### Select tìm kiếm dùng chung

Các danh sách dự án, thành viên, sprint và trạng thái dài dùng `client/src/components/common/SearchableSelect.tsx`. Component hỗ trợ tìm kiếm khi mở (auto-focus), so khớp không phân biệt hoa/thường và dấu tiếng Việt, điều hướng bằng ↑/↓ + Enter, Escape, xóa lựa chọn/nội dung tìm kiếm, trạng thái không có kết quả và danh sách cuộn. Tạo `options` dạng `{ value, label, keywords? }`, truyền `value`, `onChange` và `ariaLabel`; giữ native `<select>` cho nhóm tùy chọn ngắn, cố định như phạm vi 3 lựa chọn hoặc mức ưu tiên 4 lựa chọn.

### Kanban và Task Detail

Kanban dùng `client/src/components/KanbanBoard.tsx`; card hiển thị mã task, dự án, ưu tiên, assignee, deadline, estimate và phần trăm subtask, hỗ trợ tìm nhanh/lọc assignee/priority/project cùng drag-drop có chỉ báo vùng thả. Modal `client/src/components/TaskModal.tsx` dùng layout nội dung + sidebar thuộc tính; nội dung được chia thành tab Chi tiết, Bình luận, Subtask, Lịch sử và Tệp đính kèm. Estimate, logged time, ngày bắt đầu, deadline, trạng thái, ưu tiên và assignee được thao tác từ sidebar; chỉ cho đổi ngày khi task ở To Do. Thay đổi metadata cần nhấn Lưu thay đổi. Mô tả là văn bản Markdown nhẹ, có nút chèn cấu trúc bold/code/checklist; tệp được xem trước, tải xuống hoặc xóa. Tệp hỗ trợ ảnh, PDF, văn bản và Word `.docx` (giới hạn và phân quyền giữ nguyên).

## Scripts hữu ích

| Lệnh (tại root)        | Tác dụng                                  |
| ---------------------- | ----------------------------------------- |
| `npm run dev`          | Chạy backend + frontend cùng lúc          |
| `npm run db:init`      | Tạo bảng + seed mock data                 |
| `npm run db:migrate:users` | Nâng cấp bảng users mà không xóa dữ liệu |
| `npm run db:migrate:task-workflow` | Nâng cấp workflow, priority, soft-delete, completion timestamp, lịch sử và tệp task |
| `npm run build`        | Build cả server và client                 |
| `npm run install:all`  | Cài dependencies cho root + server + client |
# task-manager
