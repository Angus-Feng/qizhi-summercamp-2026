/**
 * 启智归塾2026夏令营 - 报名后端服务
 *
 * 功能：
 *   POST /api/register     - 提交报名数据
 *   GET  /api/registrations - 查看报名列表
 *   GET  /api/export        - 导出CSV
 */

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

// ── 初始化 ──────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 生产环境托管前端静态文件
app.use(express.static(path.join(__dirname)));

// ── 数据库 ──────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'registrations.db'));

// 启用WAL模式提升并发性能
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS registrations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_name     TEXT    NOT NULL,
    phone           TEXT    NOT NULL,
    wechat          TEXT    NOT NULL,
    child_name      TEXT    NOT NULL,
    child_gender    TEXT    NOT NULL,
    child_age       INTEGER NOT NULL,
    product         TEXT    NOT NULL,
    parent_accompany TEXT   NOT NULL DEFAULT 'no',
    accompany_days  INTEGER DEFAULT 0,
    child_grade     TEXT    DEFAULT '',
    has_special_needs TEXT  DEFAULT 'no',
    special_needs_detail TEXT DEFAULT '',
    referrer        TEXT    DEFAULT '',
    source          TEXT    DEFAULT '',
    qa1             TEXT    DEFAULT '',
    qa2             TEXT    DEFAULT '',
    notes           TEXT    DEFAULT '',
    early_bird      INTEGER DEFAULT 0,
    group_discount  INTEGER DEFAULT 0,
    returning_student INTEGER DEFAULT 0,
    live_order      INTEGER DEFAULT 0,
    base_price      INTEGER NOT NULL,
    discount_amount INTEGER DEFAULT 0,
    accompany_fee   INTEGER DEFAULT 0,
    total_price     INTEGER NOT NULL,
    created_at      TEXT    DEFAULT (datetime('now','localtime'))
  )
`);

// 预编译语句（性能优化）
const insertStmt = db.prepare(`
  INSERT INTO registrations (
    parent_name, phone, wechat, child_name, child_gender, child_age,
    product, parent_accompany, accompany_days, child_grade,
    has_special_needs, special_needs_detail, referrer, source, qa1, qa2, notes,
    early_bird, group_discount, returning_student, live_order,
    base_price, discount_amount, accompany_fee, total_price
  ) VALUES (
    @parent_name, @phone, @wechat, @child_name, @child_gender, @child_age,
    @product, @parent_accompany, @accompany_days, @child_grade,
    @has_special_needs, @special_needs_detail, @referrer, @source, @qa1, @qa2, @notes,
    @early_bird, @group_discount, @returning_student, @live_order,
    @base_price, @discount_amount, @accompany_fee, @total_price
  )
`);

// ── 校验工具 ────────────────────────────────────────────

/** 校验手机号（中国大陆） */
function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone);
}

/** 校验必填字段 */
function validate(data) {
  const errors = [];

  if (!data.parent_name || data.parent_name.trim().length === 0) {
    errors.push('家长姓名不能为空');
  }
  if (!data.phone || !isValidPhone(data.phone)) {
    errors.push('请输入正确的11位手机号');
  }
  if (!data.wechat || data.wechat.trim().length === 0) {
    errors.push('微信号不能为空');
  }
  if (!data.child_name || data.child_name.trim().length === 0) {
    errors.push('孩子姓名不能为空');
  }
  if (!data.child_gender || !['男', '女'].includes(data.child_gender)) {
    errors.push('请选择孩子性别');
  }
  if (data.child_age === undefined || data.child_age === null ||
      data.child_age < 6 || data.child_age > 18) {
    errors.push('孩子年龄需在6-18岁之间');
  }
  if (!data.product || !['7', '14', '21'].includes(data.product)) {
    errors.push('请选择报名产品');
  }
  if (!data.parent_accompany || !['yes', 'no'].includes(data.parent_accompany)) {
    errors.push('请选择是否家长陪同');
  }
  if (data.parent_accompany === 'yes') {
    const days = parseInt(data.accompany_days, 10);
    if (isNaN(days) || days < 1 || days > parseInt(data.product, 10)) {
      errors.push('陪同天数需在1到所选产品天数之间');
    }
  }
  if (data.total_price === undefined || data.total_price < 0) {
    errors.push('价格计算异常，请刷新页面后重试');
  }
  if (!data.qa1 || data.qa1.trim().length === 0) {
    errors.push('请填写：孩子最近一次让你意外或触动的事');
  }
  if (!data.qa2 || data.qa2.trim().length === 0) {
    errors.push('请填写：对本次夏令营的收获期待');
  }

  return errors;
}

// ── 路由 ────────────────────────────────────────────────

/**
 * POST /api/register
 * 提交报名数据
 */
app.post('/api/register', (req, res) => {
  try {
    const data = req.body;

    // 服务端校验
    const errors = validate(data);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // 号码去重
    const existing = db.prepare('SELECT id FROM registrations WHERE phone = ?').get(data.phone);
    if (existing) {
      return res.status(409).json({
        success: false,
        errors: ['该手机号已提交过报名，如需修改请联系工作人员']
      });
    }

    // 写入数据库
    const params = {
      parent_name: data.parent_name.trim(),
      phone: data.phone,
      wechat: data.wechat.trim(),
      child_name: data.child_name.trim(),
      child_gender: data.child_gender,
      child_age: parseInt(data.child_age, 10),
      product: data.product,
      parent_accompany: data.parent_accompany || 'no',
      accompany_days: data.parent_accompany === 'yes' ? parseInt(data.accompany_days, 10) || 0 : 0,
      child_grade: data.child_grade || '',
      has_special_needs: data.has_special_needs || 'no',
      special_needs_detail: data.has_special_needs === 'yes' ? (data.special_needs_detail || '').trim() : '',
      referrer: (data.referrer || '').trim(),
      source: data.source || '',
      qa1: (data.qa1 || '').trim(),
      qa2: (data.qa2 || '').trim(),
      notes: (data.notes || '').trim(),
      early_bird: data.early_bird ? 1 : 0,
      group_discount: data.group_discount ? 1 : 0,
      returning_student: data.returning_student ? 1 : 0,
      live_order: data.live_order ? 1 : 0,
      base_price: parseInt(data.base_price, 10),
      discount_amount: parseInt(data.discount_amount, 10),
      accompany_fee: parseInt(data.accompany_fee, 10),
      total_price: parseInt(data.total_price, 10)
    };

    const result = insertStmt.run(params);

    res.status(201).json({
      success: true,
      data: { id: result.lastInsertRowid },
      message: '报名提交成功！我们将尽快与您联系确认。'
    });
  } catch (err) {
    console.error('报名提交失败:', err);
    res.status(500).json({
      success: false,
      errors: ['服务器内部错误，请稍后重试']
    });
  }
});

/**
 * GET /api/registrations
 * 查看报名列表（简单管理页）
 */
app.get('/api/registrations', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size, 10) || 20));
    const offset = (page - 1) * pageSize;

    const rows = db.prepare(
      'SELECT * FROM registrations ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(pageSize, offset);

    const total = db.prepare('SELECT COUNT(*) AS count FROM registrations').get().count;

    res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize)
      }
    });
  } catch (err) {
    console.error('查询失败:', err);
    res.status(500).json({ success: false, errors: ['查询失败'] });
  }
});

/**
 * GET /api/export
 * 导出CSV（UTF-8 with BOM，兼容Excel中文）
 */
app.get('/api/export', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM registrations ORDER BY created_at DESC').all();

    if (rows.length === 0) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send('暂无报名数据');
    }

    // CSV转义
    const esc = (val) => {
      if (val === null || val === undefined) return '';
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    const headers = [
      'ID', '家长姓名', '手机号', '微信号', '孩子姓名', '孩子性别', '孩子年龄',
      '报名产品', '家长陪同', '陪同天数', '孩子年级', '特殊需求', '特殊需求说明',
      '推荐人', '渠道来源', '备注', '早鸟优惠', '团报优惠', '老学员优惠', '直播下单优惠',
      '原价', '优惠金额', '陪同费', '总价', '报名时间'
    ];

    const headerMap = [
      'id', 'parent_name', 'phone', 'wechat', 'child_name', 'child_gender', 'child_age',
      'product', 'parent_accompany', 'accompany_days', 'child_grade',
      'has_special_needs', 'special_needs_detail', 'referrer', 'source', 'notes',
      'early_bird', 'group_discount', 'returning_student', 'live_order',
      'base_price', 'discount_amount', 'accompany_fee', 'total_price', 'created_at'
    ];

    const productLabels = { '7': '体验道场(7天)', '14': '进阶道场(14天)', '21': '完整道场(21天)' };

    const csvLines = [headers.map(esc).join(',')];

    for (const row of rows) {
      const line = headerMap.map((key) => {
        if (key === 'product') return productLabels[row[key]] || row[key];
        if (['early_bird', 'group_discount', 'returning_student', 'live_order'].includes(key)) {
          return row[key] ? '是' : '否';
        }
        if (key === 'parent_accompany') return row[key] === 'yes' ? '是' : '否';
        return esc(row[key]);
      });
      csvLines.push(line.join(','));
    }

    // UTF-8 BOM for Excel compatibility
    const bom = '\uFEFF';
    const csv = bom + csvLines.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="registrations_${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('导出失败:', err);
    res.status(500).json({ success: false, errors: ['导出失败'] });
  }
});

// ── 启动服务器 ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`启智归塾夏令营报名服务已启动: http://localhost:${PORT}`);
  console.log(`管理页面: http://localhost:${PORT}/api/registrations`);
  console.log(`导出CSV: http://localhost:${PORT}/api/export`);
});
