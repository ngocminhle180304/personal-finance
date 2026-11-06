# App quản lý tài chính cá nhân (Google Sheet + Apps Script + GitHub Pages)

```
Trình duyệt (GitHub Pages: index.html)
        │  fetch POST (kèm token)
        ▼
Google Apps Script Web App (Code.gs)  ──►  Google Sheet (database của bạn)
```

## Bước 1 — Tạo Google Sheet + backend

1. Tạo 1 Google Sheet mới (đặt tên tùy ý, vd. `Tai chinh ca nhan`).
2. Menu **Extensions → Apps Script**. Xóa code mẫu, dán toàn bộ nội dung `Code.gs`, bấm Save.
3. **Project Settings (⚙) → Time zone** chọn `(GMT+07:00) Asia/Ho_Chi_Minh`. Việc này quan trọng để chi phí định kỳ chạy đúng ngày.
4. Chọn hàm `setup` ở thanh trên → **Run**. Cấp quyền khi Google hỏi (Advanced → Go to ... (unsafe) → Allow; đây là script của chính bạn).
5. Mở **Executions** (hoặc View → Logs) để xem dòng `API TOKEN của bạn ...` và copy token. Quên token thì chạy hàm `showToken`.
   `setup()` đã tự tạo các sheet, danh mục mặc định, và trigger chạy chi phí định kỳ mỗi ngày.

## Bước 2 — Deploy Web App

1. **Deploy → New deployment → loại Web app**.
2. *Execute as*: **Me**. *Who has access*: **Anyone**.
3. Deploy, copy **Web app URL** (kết thúc bằng `/exec`).

> Mỗi lần sửa `Code.gs` về sau: **Deploy → Manage deployments → ✎ → Version: New version → Deploy**. URL giữ nguyên.

## Bước 3 — Đưa giao diện lên GitHub Pages

1. Tạo repo GitHub mới (vd. `tai-chinh`), upload `index.html`, `manifest.webmanifest`, `sw.js` và thư mục `icons/` lên nhánh `main`.
2. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**.
3. Sau ~1 phút truy cập `https://<username>.github.io/tai-chinh/`.

## Bước 4 — Kết nối

Mở trang → tab **Cài đặt** → dán **URL Web App** và **Token** → *Lưu & kiểm tra*. Cấu hình lưu trên thiết bị đó (mỗi điện thoại/máy tính nhập 1 lần).

## Bước 5 — Cài app lên điện thoại (PWA)

App là PWA: cài lên màn hình chính, mở toàn màn hình như app thật, không cần App Store / Google Play.

- **iPhone / iPad**: mở link bằng **Safari** → nút **Chia sẻ** → **Thêm vào MH chính** → Thêm.
- **Android**: mở bằng **Chrome** → menu **⋮** → **Cài đặt ứng dụng** (hoặc bấm nút *Cài đặt* trong tab Cài đặt của app).

> iPhone: app cài từ màn hình chính có bộ nhớ riêng, tách khỏi Safari, nên phải **nhập URL + token lại một lần** bên trong app.

Trên điện thoại, các tab nằm ở thanh dưới đáy (Ngân sách, Định kỳ, Cài đặt nằm trong mục **Thêm**). Khi mất mạng app vẫn mở được và hiển thị dữ liệu lần đồng bộ gần nhất, nhưng không thêm/sửa được; có mạng lại thì app tự đồng bộ.

Thứ tự bắt đầu gợi ý: tạo **Tài khoản** (MB, Tech, Tiền mặt...) với số dư hiện tại → thêm giao dịch bằng nút `+`.

## Nếu bạn đã deploy bản có giá vàng/bạc trước đó

1. Dán đè `Code.gs` mới vào Apps Script, Save.
2. Chạy lại hàm `setup()` một lần: hàm này xóa trigger `logPrices` cũ (nếu không xóa, trigger đó sẽ báo lỗi mỗi giờ vì hàm không còn nữa). Token giữ nguyên.
3. **Deploy → Manage deployments → ✎ → New version → Deploy**.
4. Upload `index.html` mới lên GitHub.
5. Các sheet `Holdings` và `PriceHistory` cũ trong Google Sheet không còn được dùng, bạn có thể xóa tay nếu muốn.

## Cách tính

- **Số dư tài khoản** = số dư ban đầu + thu − chi ± chuyển khoản ± dòng tiền từ sổ nợ (nếu có chọn tài khoản).
- **Tài sản ròng** = tổng số dư tài khoản + phải thu − phải trả.
- **Chuyển khoản giữa tài khoản** không tính vào thu/chi.
- **Ngân sách**: hạn mức theo danh mục, tính trên chi tiêu của tháng đang chọn; cam khi ≥ 80%, đỏ khi vượt.
- **Định kỳ**: monthly / weekly / yearly; tháng không có ngày 31 thì lùi về ngày cuối tháng. Giao dịch tạo ra có ghi chú `[Định kỳ]`, không bao giờ tạo trùng.

## Bảo mật

- Web App phải để *Anyone* thì GitHub Pages mới gọi được, nên **token là lớp bảo vệ duy nhất**: không commit token lên GitHub, không chia sẻ URL + token. Muốn đổi token: Project Settings → Script properties → sửa `API_TOKEN` rồi nhập lại token trên các thiết bị.
- Repo có thể để public vì trong code không có token hay dữ liệu.
- Dữ liệu nằm hoàn toàn trong Google Sheet của bạn; tab Cài đặt có nút tải bản sao lưu JSON.

## Xử lý sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| `Sai token (Unauthorized)` | Token sai/thừa khoảng trắng; chạy `showToken()` lấy lại. |
| Báo lỗi mạng / không tải được | Kiểm tra Web App đã deploy *Anyone*, URL kết thúc `/exec`; sau khi sửa code nhớ tạo *New version*. |
| `Chưa có sheet ...` | Chạy `setup()`. |
| App trên điện thoại không thấy bản mới | Đóng hẳn app rồi mở lại (cần có mạng). App luôn lấy bản mới khi có mạng, chỉ dùng bản lưu khi offline. |
| Chi phí định kỳ không tự chạy | Kiểm tra Triggers (⏰) có `processRecurring`; hoặc bấm **Chạy ngay** ở tab Định kỳ. |
