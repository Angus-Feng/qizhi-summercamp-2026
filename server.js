/**
 * 启智归塾2026夏令营 - 报名后端服务
 *
 * Vercel 兼容版 —— JSON 文件存储（替代 better-sqlite3）
 *
 * API：
 *   POST /api/register     - 提交报名数据
 *   GET  /api/registrations - 查看报名列表（?page=1&page_size=20）
 *   GET  /api/export        - 导出CSV
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// ── 初始化 ──────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 生产环境托管前端静态文件
app.use(express.static(path.join(__dirname)));

// ── 数据存储 ─────────────────────────────────────────────

// Vercel 用 /tmp，本地用 __dirname
const DATA_FILE = process.env.VERCEL
  ? '/tmp/registrations.json'
  : path.join(__dirname, 'registrations.json');

/** 读取所有报名数据 */
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) { /* ignore corrupt file */ }
  return [];
}

/** 保存数据到文件 */
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/** 生成自增ID */
function nextId(data) {
  if (data.length === 0) return 1;
  return Math.max(...data.map(r => r.id)) + 1;
}

// ── 校验工具 ────────────────────────────────────────────

function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone);
}

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
 */
app.post('/api/register', (req, res) => {
  try {
    const data = req.body;

    const errors = validate(data);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const records = loadData();

    // 号码去重
    if (records.some(r => r.phone === data.phone)) {
      return res.status(409).json({
        success: false,
        errors: ['该手机号已提交过报名，如需修改请联系工作人员']
      });
    }

    const record = {
      id: nextId(records),
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
      total_price: parseInt(data.total_price, 10),
      created_at: new Date().toISOString()
    };

    records.push(record);
    saveData(records);

    res.status(201).json({
      success: true,
      data: { id: record.id },
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
 */
app.get('/api/registrations', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size, 10) || 20));

    const records = loadData();
    // 按创建时间倒序
    records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const total = records.length;
    const offset = (page - 1) * pageSize;
    const rows = records.slice(offset, offset + pageSize);

    res.json({
      success: true,
      data: rows,
      pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) }
    });
  } catch (err) {
    console.error('查询失败:', err);
    res.status(500).json({ success: false, errors: ['查询失败'] });
  }
});

/**
 * GET /api/export
 */
app.get('/api/export', (req, res) => {
  try {
    const records = loadData();
    records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (records.length === 0) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send('暂无报名数据');
    }

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
      '推荐人', '渠道来源', '问答题1', '问答题2', '备注',
      '早鸟优惠', '团报优惠', '老学员优惠', '直播下单优惠',
      '原价', '优惠金额', '陪同费', '总价', '报名时间'
    ];

    const productLabels = { '7': '体验道场(7天)', '14': '进阶道场(14天)', '21': '完整道场(21天)' };

    const csvLines = [headers.map(esc).join(',')];

    for (const row of records) {
      const line = [
        row.id, row.parent_name, row.phone, row.wechat,
        row.child_name, row.child_gender, row.child_age,
        productLabels[row.product] || row.product,
        row.parent_accompany === 'yes' ? '是' : '否',
        row.accompany_days, row.child_grade,
        row.has_special_needs === 'yes' ? '是' : '否',
        row.special_needs_detail, row.referrer, row.source,
        row.qa1, row.qa2, row.notes,
        row.early_bird ? '是' : '否',
        row.group_discount ? '是' : '否',
        row.returning_student ? '是' : '否',
        row.live_order ? '是' : '否',
        row.base_price, row.discount_amount, row.accompany_fee,
        row.total_price, row.created_at
      ].map(esc);
      csvLines.push(line.join(','));
    }

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
