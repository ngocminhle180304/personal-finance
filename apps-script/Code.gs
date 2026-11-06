/**
 * QUẢN LÝ TÀI CHÍNH CÁ NHÂN - Backend (Google Apps Script)
 * Gắn vào Google Sheet: Extensions → Apps Script → dán file này.
 * Chạy hàm setup() 1 lần, sau đó Deploy → Web app.
 */

const SHEETS = {
  Accounts:     ['id', 'name', 'type', 'initial_balance', 'currency', 'note', 'active'],
  Categories:   ['id', 'name', 'type', 'icon'],
  Transactions: ['id', 'date', 'type', 'account_id', 'to_account_id', 'category', 'amount', 'note', 'recurring_id', 'created_at'],
  Debts:        ['id', 'date', 'person', 'direction', 'amount', 'account_id', 'due_date', 'note'],
  DebtPayments: ['id', 'debt_id', 'date', 'amount', 'account_id', 'note'],
  Budgets:      ['id', 'category', 'amount'],
  Recurring:    ['id', 'name', 'type', 'account_id', 'category', 'amount', 'frequency', 'day', 'start_date', 'end_date', 'last_run', 'active', 'note']
};

const DATA_SHEETS = ['Accounts', 'Categories', 'Transactions', 'Debts', 'DebtPayments', 'Budgets', 'Recurring'];

const DEFAULT_CATEGORIES = [
  ['Ăn uống', 'expense'], ['Di chuyển', 'expense'], ['Nhà ở', 'expense'], ['Hóa đơn & tiện ích', 'expense'],
  ['Mua sắm', 'expense'], ['Sức khỏe', 'expense'], ['Giáo dục', 'expense'], ['Giải trí', 'expense'],
  ['Du lịch', 'expense'], ['Quà tặng', 'expense'], ['Chi khác', 'expense'],
  ['Lương', 'income'], ['Thưởng', 'income'], ['Đầu tư', 'income'], ['Thu khác', 'income']
];

/* ====================== SETUP ====================== */

/** Chạy 1 lần từ editor: tạo sheet, token, trigger. Xem token ở View → Logs / Executions. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    const headers = SHEETS[name];
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#e6f4f1');
      sh.setFrozenRows(1);
    }
    // cột ngày lưu dạng text để Sheets không tự đổi sang Date
    headers.forEach(function (h, i) {
      if (isDateCol_(h)) sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    });
  });

  const cat = ss.getSheetByName('Categories');
  if (cat.getLastRow() < 2) {
    const rows = DEFAULT_CATEGORIES.map(function (c, i) { return ['c' + (i + 1), c[0], c[1], '']; });
    cat.getRange(2, 1, rows.length, 4).setValues(rows);
  }

  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('API_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    props.setProperty('API_TOKEN', token);
  }

  // Trigger: chạy chi phí định kỳ mỗi ngày (đồng thời dọn trigger logPrices của bản cũ nếu có)
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const fn = t.getHandlerFunction();
    if (fn === 'processRecurring' || fn === 'logPrices') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processRecurring').timeBased().everyDays(1).atHour(1).create();

  Logger.log('=== SETUP XONG ===');
  Logger.log('API TOKEN của bạn (dán vào app): ' + token);
  return token;
}

/** Nếu quên token: chạy hàm này rồi xem log. */
function showToken() {
  Logger.log('API TOKEN: ' + PropertiesService.getScriptProperties().getProperty('API_TOKEN'));
}

/* ====================== WEB APP ====================== */

function doGet() {
  return json_({ ok: true, data: 'API đang chạy. Dùng POST với token để truy cập dữ liệu.' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const token = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    if (!token || body.token !== token) return json_({ ok: false, error: 'Sai token (Unauthorized)' });

    let data;
    switch (body.action) {
      case 'ping':          data = 'pong'; break;
      case 'getAll':        data = getAll_(); break;
      case 'upsert':        data = withLock_(function () { return upsert_(body.sheet, body.row); }); break;
      case 'delete':        data = withLock_(function () { return remove_(body.sheet, body.id); }); break;
      case 'runRecurring':  data = withLock_(function () { return processRecurring(); }); break;
      default: throw new Error('Action không hợp lệ: ' + body.action);
    }
    return json_({ ok: true, data: data });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ====================== DATA ====================== */

function isDateCol_(h) {
  return h === 'date' || h === 'last_run' || /_date$/.test(h);
}

function sheet_(name) {
  if (!SHEETS[name]) throw new Error('Sheet không hợp lệ: ' + name);
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Chưa có sheet ' + name + ' - hãy chạy setup()');
  return sh;
}

function cell_(v, header) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), isDateCol_(header) ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ss");
  }
  return v;
}

function readSheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const headers = SHEETS[name];
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues();
  const out = [];
  values.forEach(function (r) {
    if (r[0] === '' || r[0] === null) return;
    const o = {};
    headers.forEach(function (h, i) { o[h] = cell_(r[i], h); });
    out.push(o);
  });
  return out;
}

function getAll_() {
  const out = {};
  DATA_SHEETS.forEach(function (n) { out[n] = readSheet_(n); });
  return out;
}

function upsert_(name, row) {
  const sh = sheet_(name);
  const headers = SHEETS[name];
  if (!row || !row.id) throw new Error('Thiếu id');
  const arr = headers.map(function (h) { return row[h] === undefined || row[h] === null ? '' : row[h]; });

  const last = sh.getLastRow();
  let rowIdx = -1;
  if (last >= 2) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(row.id)) { rowIdx = i + 2; break; }
    }
  }
  if (rowIdx === -1) rowIdx = Math.max(last, 1) + 1;

  headers.forEach(function (h, i) {
    if (isDateCol_(h)) sh.getRange(rowIdx, i + 1).setNumberFormat('@');
  });
  sh.getRange(rowIdx, 1, 1, headers.length).setValues([arr]);
  return row;
}

function remove_(name, id) {
  const sh = sheet_(name);
  const last = sh.getLastRow();
  if (last >= 2) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === String(id)) { sh.deleteRow(i + 2); break; }
    }
  }
  // xóa khoản nợ → xóa luôn các lần trả của khoản đó
  if (name === 'Debts') {
    const ps = sheet_('DebtPayments');
    const pl = ps.getLastRow();
    if (pl >= 2) {
      const vals = ps.getRange(2, 1, pl - 1, 2).getValues();
      for (let j = vals.length - 1; j >= 0; j--) {
        if (String(vals[j][1]) === String(id)) ps.deleteRow(j + 2);
      }
    }
  }
  return { id: id };
}

/* ====================== CHI PHÍ ĐỊNH KỲ ====================== */

function parseDate_(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
function fmtDate_(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
function daysInMonth_(y, m) { return new Date(y, m + 1, 0).getDate(); }

function occurrences_(r, today) {
  const out = [];
  const start = parseDate_(r.start_date);
  if (!start) return out;
  const end = parseDate_(r.end_date);
  const last = parseDate_(r.last_run);
  const day = Number(r.day) || start.getDate();
  const push = function (d) {
    if (d < start || d > today) return;
    if (end && d > end) return;
    if (last && d <= last) return;
    out.push(fmtDate_(d));
  };

  if (r.frequency === 'weekly') {
    const cur = new Date(start);
    let guard = 0;
    while (cur <= today && guard++ < 600) { push(new Date(cur)); cur.setDate(cur.getDate() + 7); }
  } else if (r.frequency === 'yearly') {
    for (let y = start.getFullYear(); y <= today.getFullYear(); y++) {
      const mo = start.getMonth();
      push(new Date(y, mo, Math.min(start.getDate(), daysInMonth_(y, mo))));
    }
  } else { // monthly
    let y = start.getFullYear(), m = start.getMonth(), guard = 0;
    while ((y < today.getFullYear() || (y === today.getFullYear() && m <= today.getMonth())) && guard++ < 1200) {
      push(new Date(y, m, Math.min(day, daysInMonth_(y, m))));
      m++; if (m > 11) { m = 0; y++; }
    }
  }
  return out;
}

/** Tạo giao dịch cho các khoản định kỳ đã đến hạn. Idempotent (không tạo trùng). */
function processRecurring() {
  const tz = Session.getScriptTimeZone();
  const today = parseDate_(Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'));
  const recs = readSheet_('Recurring').filter(function (r) { return Number(r.active) !== 0; });
  const existing = {};
  readSheet_('Transactions').forEach(function (t) { existing[t.id] = true; });

  let created = 0;
  recs.forEach(function (r) {
    const dates = occurrences_(r, today);
    let lastDone = r.last_run || '';
    dates.forEach(function (d) {
      const id = 'r_' + r.id + '_' + d;
      if (!existing[id]) {
        upsert_('Transactions', {
          id: id, date: d, type: r.type, account_id: r.account_id, to_account_id: '',
          category: r.category, amount: Number(r.amount) || 0,
          note: '[Định kỳ] ' + r.name, recurring_id: r.id,
          created_at: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss")
        });
        existing[id] = true;
        created++;
      }
      if (d > lastDone) lastDone = d;
    });
    if (lastDone && lastDone !== r.last_run) {
      r.last_run = lastDone;
      upsert_('Recurring', r);
    }
  });
  return { created: created };
}
