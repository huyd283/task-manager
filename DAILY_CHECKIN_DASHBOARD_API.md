# Daily Check-in Dashboard API

Tài liệu tích hợp dành cho hệ thống Checkin gọi TomoHub để lấy thống kê Daily Check-in. API chỉ trả JSON, không tạo file Excel/CSV.

## Thông tin endpoint

- **Method:** `GET`
- **URL local:** `http://localhost:4000/api/v1/external/daily-checkin/dashboard`
- **URL production:** `https://<TOMOHUB_HOST>/api/v1/external/daily-checkin/dashboard`
- **Content-Type response:** `application/json`
- **Authentication:** partner credentials đã cấu hình cho tích hợp Checkin–TomoHub. API không dùng JWT/session và không dùng API key riêng.

## Xác thực

Gửi hai header sau trong mỗi request:

| Header | Giá trị |
|---|---|
| `X-Partner-Code` | Giá trị `CHECKIN_PARTNER_CODE` |
| `X-Partner-Token` | Giá trị `CHECKIN_PARTNER_TOKEN` |

TomoHub đối chiếu hai giá trị nhận được với cấu hình trong `server/.env`. Không gửi token qua URL, không commit vào source control/Postman collection chia sẻ, và chỉ chuyển credential thật qua secret manager hoặc kênh bảo mật đã thống nhất.

## Test bằng Postman

1. Tạo request mới, chọn **GET**.
2. Dán URL:
   `http://localhost:4000/api/v1/external/daily-checkin/dashboard`
3. Mở tab **Headers**, thêm:
   - `X-Partner-Code` = `{{checkin_partner_code}}`
   - `X-Partner-Token` = `{{checkin_partner_token}}`
4. Tạo hai biến trong Postman Environment với tên tương ứng. Chỉ nhập giá trị credential thật trong environment riêng tư/local; không export hoặc chia sẻ giá trị secret.
5. Tuỳ chọn thêm filters ở tab **Params**.
6. Nhấn **Send**. Khi xác thực và request hợp lệ, Postman nhận `200 OK` và JSON.

Request kiểm tra cho một ngày:

```http
GET http://localhost:4000/api/v1/external/daily-checkin/dashboard?date=2026-11-25
X-Partner-Code: <CHECKIN_PARTNER_CODE>
X-Partner-Token: <CHECKIN_PARTNER_TOKEN>
```

Request lấy dữ liệu theo khoảng ngày:

```http
GET http://localhost:4000/api/v1/external/daily-checkin/dashboard?fromDate=2026-11-24&toDate=2026-11-25&status=Pending
X-Partner-Code: <CHECKIN_PARTNER_CODE>
X-Partner-Token: <CHECKIN_PARTNER_TOKEN>
```

## Query parameters

| Parameter | Bắt buộc | Ý nghĩa |
|---|---:|---|
| `date` | Không | Một ngày `YYYY-MM-DD`. Dùng riêng, không kết hợp với `fromDate`/`toDate`. |
| `fromDate` | Theo cặp | Ngày đầu khoảng, định dạng `YYYY-MM-DD`. Phải truyền cùng `toDate`. |
| `toDate` | Theo cặp | Ngày cuối khoảng, bao gồm cả ngày này. Khoảng tối đa 31 ngày. |
| `userId` | Không | Lọc theo user ID số nguyên dương. |
| `departmentId` | Không | Lọc chính xác theo chuỗi `users.department` hiện có trong TomoHub (không phải ID số). |
| `teamId` | Không | ID project; lọc nhân sự có membership trong project (`project_members`). |
| `status` | Không | `Submitted`, `Pending`, hoặc `hasBlocker`. Phân biệt chữ hoa/thường. |
| `format` | Không | Chỉ chấp nhận `json`; có thể bỏ qua vì JSON là response mặc định. |

Nếu bỏ cả `date`, `fromDate` và `toDate`, API dùng ngày hiện tại theo MySQL `CURDATE()`.

Ý nghĩa trạng thái:

- `Submitted`: check-in tồn tại và đã hoàn tất (`is_complete = 1`).
- `Pending`: chưa có check-in hoặc check-in chưa hoàn tất.
- `hasBlocker`: trạng thái blocker là `BLOCKED`.

Danh sách chỉ bao gồm user đang active; tài khoản admin và account admin bị loại trừ. Tối đa 20.000 bản ghi được trả về cho một request.

## Response thành công

Response có cấu trúc:

```json
{
  "data": {
    "fromDate": "2026-11-25",
    "toDate": "2026-11-25",
    "filters": {
      "fromDate": "2026-11-25",
      "toDate": "2026-11-25",
      "userId": null,
      "departmentId": null,
      "teamId": null,
      "status": null
    },
    "summary": {
      "recordCount": 1,
      "submittedCount": 1,
      "pendingCount": 0,
      "blockerCount": 0,
      "completionRate": 100
    },
    "records": [
      {
        "date": "2026-11-25",
        "submissionStatus": "Submitted",
        "user": {
          "userId": 123,
          "name": "Nguyen Van A",
          "employeeCode": "TMT-123",
          "jobTitle": "Developer",
          "department": "Phát triển Phần mềm"
        },
        "checkin": {
          "submissionStatus": "Submitted",
          "isComplete": true,
          "reviewConfirmed": true,
          "planConfirmed": true,
          "blockerStatus": "NONE",
          "blockerDescription": null,
          "blockerImpact": null,
          "completedAt": "2026-11-25 09:00:00",
          "savedAt": "2026-11-25 09:00:00"
        },
        "reviewedTasks": [
          {
            "id": 456,
            "taskCode": "TASK-456",
            "title": "Example task",
            "status": "IN_PROGRESS",
            "projectName": "Example project"
          }
        ],
        "plannedTasks": [],
        "hasBlocker": false
      }
    ]
  }
}
```

`records` có một dòng cho mỗi nhân sự trong từng ngày được hỏi. Khi chưa có check-in, `checkin` là `null`, `submissionStatus` là `Pending`; `reviewedTasks` và `plannedTasks` vẫn là mảng (có thể rỗng). Summary được tính trên tập record sau khi áp dụng filters.

## Lỗi có thể gặp

| HTTP status | Ý nghĩa |
|---:|---|
| `400 Bad Request` | Ngày/ID/status/format không hợp lệ; thiếu một trong `fromDate` và `toDate`; hoặc khoảng ngày lớn hơn 31 ngày. |
| `401 Unauthorized` | Thiếu hoặc sai `X-Partner-Code` / `X-Partner-Token`. |
| `413 Payload Too Large` | Kết quả vượt 20.000 bản ghi; thu hẹp khoảng ngày hoặc thêm filter. |
| `500 Internal Server Error` | Lỗi xử lý phía server; liên hệ vận hành TomoHub kèm thời điểm request. |

Mỗi request được gán UUID `requestId` phía server để đối chiếu log. Request ID, thời điểm, IP, path và HTTP status được ghi audit; credential không được ghi vào log.
