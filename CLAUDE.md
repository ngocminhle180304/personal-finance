# CLAUDE.md — Brief cho Claude Code: deploy app quản lý tài chính cá nhân

> Đọc file này trước. Nhiệm vụ chính của bạn: **đưa repo này lên GitHub và bật GitHub Pages**. Phần backend (Apps Script) chỉ owner làm tay được, hướng dẫn ở mục 5.

## 1. Dự án là gì

App quản lý tài chính cá nhân của Hihi (dùng một mình). Dữ liệu nằm trong **Google Sheet**, **Google Apps Script** làm API, **một file `index.html`** (không build, không framework) chạy trên **GitHub Pages**.

Yêu cầu gốc: nhiều tài khoản (MB, Techcombank, tiền mặt…), sổ nợ hai chiều (ai nợ mình / mình nợ ai), ngân sách theo danh mục, chi phí định kỳ, dashboard (tổng tài sản, thu/chi theo tháng và năm).

**Quyết định đã chốt:** đã **bỏ** tích hợp giá vàng/bạc (kèm mục "vàng/bạc đang giữ"). Không thêm lại trừ khi owner yêu cầu.

## 2. Cấu trúc repo

```
index.html            # toàn bộ frontend (HTML+CSS+JS trong 1 file), Pages phục vụ file này ở gốc
manifest.webmanifest  # PWA manifest (tên app, icon, display standalone)
sw.js                 # service worker: offline cho app shell + Chart.js; KHÔNG cache request tới Apps Script
icons/                # icon PWA (192, 512, maskable 512, apple-touch-icon 180, favicon 32)
apps-script/Code.gs   # backend, owner dán vào Apps Script (KHÔNG chạy trên GitHub)
README.md             # hướng dẫn cho người dùng cuối (setup 4 bước, cách tính, xử lý sự cố)
CLAUDE.md             # file này
.gitignore
```

## 3. Kiến trúc & hợp đồng API

- Frontend gọi **một** endpoint: `POST <WEB_APP_URL>` với header `Content-Type: text/plain;charset=utf-8` (cố ý, để tránh CORS preflight của Apps Script) và body JSON `{ token, action, ...payload }`. Trả về `{ ok: true, data }` hoặc `{ ok: false, error }`.
- URL Web App + token do người dùng nhập ở tab **Cài đặt**, lưu trong `localStorage` của trình duyệt. **Không có secret nào nằm trong code.** Hằng `DEFAULT_API_URL` trong `index.html` để trống; chỉ điền nếu owner muốn (URL không phải secret, token thì tuyệt đối không).
- Actions: `ping`, `getAll`, `upsert {sheet,row}`, `delete {sheet,id}`, `runRecurring`.
- Token nằm ở Script Properties (`API_TOKEN`), sinh bởi hàm `setup()`.
- Sheets (hàng 1 là header, cột đầu luôn là `id`):
  - `Accounts`: id, name, type, initial_balance, currency, note, active
  - `Categories`: id, name, type(expense|income), icon
  - `Transactions`: id, date, type(expense|income|transfer), account_id, to_account_id, category, amount, note, recurring_id, created_at
  - `Debts`: id, date, person, direction(lend|borrow), amount, account_id, due_date, note
  - `DebtPayments`: id, debt_id, date, amount, account_id, note
  - `Budgets`: id, category, amount
  - `Recurring`: id, name, type, account_id, category, amount, frequency(monthly|weekly|yearly), day, start_date, end_date, last_run, active, note
- Cột ngày lưu dạng text `yyyy-MM-dd` (đã set number format `@`) để Sheets không tự đổi thành Date.
- Trigger hằng ngày `processRecurring` tạo giao dịch định kỳ, id dạng `r_<recurringId>_<yyyy-MM-dd>` nên idempotent.
- Số dư tài khoản **tính ở frontend** từ `initial_balance` + giao dịch + dòng tiền sổ nợ; tài sản ròng = tổng số dư + phải thu − phải trả.
- Frontend phụ thuộc duy nhất vào CDN: Chart.js 4.4.1 từ cdnjs (có guard `typeof Chart`, không có CDN thì các biểu đồ trống nhưng app vẫn chạy).

## 4. Việc bạn cần làm (deploy lên GitHub)

1. **Hỏi owner trước khi tạo gì trên GitHub:** tên repo (mặc định gợi ý `tai-chinh`), tài khoản/org, visibility. Gợi ý **public**: GitHub Pages trên repo private cần gói trả phí, và repo này không chứa secret hay dữ liệu cá nhân nên public an toàn.
2. Trước khi commit, chạy kiểm tra an toàn:
   - `grep -rnE "AKfycb[A-Za-z0-9_-]{20,}|[0-9a-f]{40}" .` — phải **không in ra gì** (không có ID deployment Apps Script hay token 40 ký tự hex). Placeholder `https://script.google.com/macros/s/.../exec` trong ô nhập URL của `index.html` và chuỗi `API_TOKEN` (tên property) trong `Code.gs` là bình thường, không phải secret.
   - `node --check` cho phần `<script>` cuối của `index.html` (trích bằng script) và cho `apps-script/Code.gs` (copy sang `.js` rồi check).
3. `git init -b main`, commit (message tiếng Anh hoặc Việt đều được), tạo repo bằng `gh repo create <owner>/<name> --public --source=. --remote=origin --push`.
4. Bật Pages từ nhánh main, thư mục gốc:
   `gh api -X POST repos/<owner>/<name>/pages -f "source[branch]=main" -f "source[path]=/"`
   (nếu trả 409 vì Pages đã bật thì dùng `-X PUT`).
5. Đợi build (`gh api repos/<owner>/<name>/pages/builds/latest` tới khi `status: built`), rồi `curl -sI https://<owner>.github.io/<name>/` phải trả `200`. Báo URL cho owner.
6. Không đổi cấu trúc file, không thêm build step/framework, không đưa token/URL deployment vào repo.

## 5. Phần owner phải tự làm (bạn không tự động hóa được)

Backend cần quyền Google của owner. Hướng dẫn chi tiết ở `README.md` (Bước 1, 2, 4): tạo Google Sheet → dán `apps-script/Code.gs` vào Apps Script → đặt time zone Asia/Ho_Chi_Minh → chạy `setup()` → copy token → Deploy Web App (Execute as *Me*, access *Anyone*) → dán URL + token vào tab Cài đặt của trang Pages.

Sau khi deploy xong, nhắc owner các việc đó, đừng cố làm thay. Chỉ dùng `clasp` nếu owner chủ động yêu cầu (cần họ đăng nhập Google).

## 6. Trạng thái kiểm thử (trung thực)

- Đã làm: `node --check` pass cho cả hai file; unit-test logic ngày định kỳ (ngày 31 lùi cuối tháng, weekly, yearly 29/2, end_date, last_run); smoke test trên Chromium với API giả (7 tab render, thêm giao dịch, số dư và tài sản ròng đúng, không lỗi console).
- **Chưa làm:** chưa chạy trên Google Sheet và Apps Script thật, chưa test trên GitHub Pages thật, chưa test trên điện thoại. Lần deploy đầu có thể lộ lỗi nhỏ về quyền Google hoặc `LockService`/trigger; nếu owner báo lỗi thì ưu tiên đọc tab **Executions** trong Apps Script.

## 7. Khi sửa code sau này

- Sửa `apps-script/Code.gs` xong owner phải: dán lại vào Apps Script → *Deploy → Manage deployments → ✎ → New version* (URL giữ nguyên). Nhắc điều này mỗi khi bạn đổi backend.
- Đổi cột trong `SHEETS` ở `Code.gs` thì phải xem lại sheet đã tạo, vì `setup()` chỉ ghi header khi sheet trống.
- Giữ frontend ở 1 file, escape mọi chuỗi người dùng bằng `esc()` khi nhét vào HTML.
- App là PWA, ưu tiên mobile: dưới 700px dùng thanh tab dưới đáy (`#bnav`, mục *Thêm* chứa Ngân sách/Định kỳ/Cài đặt), từ 700px trở lên dùng tab trên cùng. Ô nhập trên mobile phải ≥ 16px để iOS không tự zoom. Nhớ tính `env(safe-area-inset-*)` cho phần tử cố định.
- `sw.js`: trang tải theo kiểu network-first nên sửa `index.html` thì không cần làm gì. Sửa icon/manifest hoặc đổi phiên bản Chart.js thì phải tăng `CACHE` (vd. `taichinh-v2`) và cập nhật hằng `CDN`.
