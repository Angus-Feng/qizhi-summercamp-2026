/**
 * 启智归塾2026夏令营 - 报名后端 v2
 * 
 * 支持：多孩子、父母分别陪同、邮件通知
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// ── 邮件配置 ──────────────────────────────────────────
// 设置环境变量 SMTP_USER / SMTP_PASS 启用邮件通知
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const NOTIFY_EMAILS = (process.env.NOTIFY_EMAIL || SMTP_USER).split(',').map(e => e.trim()).filter(Boolean);

let transporter = null;
try {
  if (SMTP_USER && SMTP_PASS) {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: 'smtp.qq.com', port: 465, secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
    console.log('✅ 邮件通知已启用');
  }
} catch(e) { console.log('⚠ 邮件未配置:', e.message); }

// ── 初始化 ──────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// ── 管理端密码中间件 ─────────────────────────────────
function adminAuth(req, res, next) {
  if (!ADMIN_PASSWORD) return next(); // 未设密码则允许
  const pw = req.query.password || (req.headers['x-admin-password']);
  if (pw === ADMIN_PASSWORD) return next();
  res.status(401).json({ success: false, errors: ['管理密码错误'] });
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// ── 数据存储 ─────────────────────────────────────────
const DATA_FILE = process.env.VERCEL
  ? '/tmp/registrations.json'
  : path.join(__dirname, 'registrations.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch(e) {}
  return [];
}
function saveData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8'); }
function nextId(data) { return data.length === 0 ? 1 : Math.max(...data.map(r => r.id)) + 1; }

// ── 校验 ────────────────────────────────────────────
function isValidPhone(phone) { return /^1[3-9]\d{9}$/.test(phone); }

function validate(data) {
  const errors = [];
  if (!data.parent_name || !data.parent_name.trim()) errors.push('联系人姓名不能为空');
  if (!data.phone || !isValidPhone(data.phone)) errors.push('请输入正确的11位手机号');
  if (!data.wechat || !data.wechat.trim()) errors.push('微信号不能为空');

  // 孩子校验
  if (!data.children || !Array.isArray(data.children) || data.children.length === 0) {
    errors.push('请至少添加一个孩子');
  } else {
    data.children.forEach((ch, i) => {
      if (!ch.name || !ch.name.trim()) errors.push(`孩子${i+1}姓名不能为空`);
      if (!ch.gender || !['男','女'].includes(ch.gender)) errors.push(`请选择孩子${i+1}的性别`);
      if (!ch.age || ch.age < 5 || ch.age > 18) errors.push(`孩子${i+1}年龄需在5-18岁之间`);
    });
  }

  if (!data.product || !['7','14','21'].includes(data.product)) errors.push('请选择报名产品');
  if (!data.qa1 || !data.qa1.trim()) errors.push('请填写开放性问题1');
  if (!data.qa2 || !data.qa2.trim()) errors.push('请填写开放性问题2');
  if (data.total_price === undefined || data.total_price < 0) errors.push('价格计算异常');

  return errors;
}

// ── 构建邮件内容 ─────────────────────────────────────
function buildEmailBody(record) {
  const productLabels = { '7': '体验版(7天)', '14': '进阶版(14天)', '21': '完整版(21天)' };
  const weekNames = { 1: '第一周(8/1-7)', 2: '第二周(8/8-14)', 3: '第三周(8/15-21)' };
  function fmtWeeks(arr) { return arr && arr.length > 0 ? arr.map(w => weekNames[w]||('第'+w+'周')).join('、') : '—'; }
  function fmtParent(p, label) {
    const acc = record[p+'_accompany'] || 'no';
    if (acc === 'no') return label+'：不参加';
    if (acc === 'full') return label+'：全程 ¥3,580';
    return label+'：按周('+fmtWeeks(record[p+'_weeks'])+')';
  }
  let childrenHtml = record.children.map((ch, i) => 
    `<p><b>孩子${i+1}：</b>${ch.name} | ${ch.gender} | ${ch.age}岁 | ${ch.grade}${ch.has_special_needs === 'yes' ? ' | 特殊需求：'+ch.special_needs_detail : ''}</p>`
  ).join('');
  return `
    <h3>📋 新报名通知</h3>
    <p><b>联系人：</b>${record.parent_name} | ${record.phone} | ${record.wechat}</p>
    <p><b>报名产品：</b>${productLabels[record.product] || record.product} | ${record.child_count}个孩子</p>
    ${childrenHtml}
    <p><b>${fmtParent('father','父亲')}</b></p>
    <p><b>${fmtParent('mother','母亲')}</b></p>
    <p><b>合计：</b>¥${record.total_price.toLocaleString()}</p>
    <p><b>Q1：</b>${record.qa1}</p>
    <p><b>Q2：</b>${record.qa2}</p>
  `;
}

// ── 路由 ────────────────────────────────────────────

app.post('/api/register', (req, res) => {
  try {
    const data = req.body;
    const errors = validate(data);
    if (errors.length > 0) return res.status(400).json({ success: false, errors });

    const records = loadData();
    if (records.some(r => r.phone === data.phone)) {
      return res.status(409).json({ success: false, errors: ['该手机号已提交过报名'] });
    }

    const record = {
      id: nextId(records),
      parent_name: data.parent_name.trim(),
      phone: data.phone,
      wechat: data.wechat.trim(),
      children: data.children,
      product: data.product,
      father_accompany: data.father_accompany || 'no',
      mother_accompany: data.mother_accompany || 'no',
      father_weeks: Array.isArray(data.father_weeks) ? data.father_weeks : [],
      mother_weeks: Array.isArray(data.mother_weeks) ? data.mother_weeks : [],
      child_count: data.child_count || data.children.length,
      qa1: (data.qa1 || '').trim(),
      qa2: (data.qa2 || '').trim(),
      referrer: (data.referrer || '').trim(),
      source: data.source || '',
      notes: (data.notes || '').trim(),
      base_price: parseInt(data.base_price, 10),
      children_total: parseInt(data.children_total, 10),
      accompany_fee: parseInt(data.accompany_fee, 10),
      total_price: parseInt(data.total_price, 10),
      created_at: new Date().toISOString()
    };

    records.push(record);
    saveData(records);

    // 发送邮件通知（非阻塞，不等待）
    if (transporter && NOTIFY_EMAILS.length > 0) {
      for (const to of NOTIFY_EMAILS) {
        transporter.sendMail({
          from: SMTP_USER, to,
          subject: `【夏令营报名】${record.parent_name} - ${record.child_count}孩 ¥${record.total_price}`,
          html: buildEmailBody(record)
        }).then(() => console.log('邮件已发送至', to)).catch(e => console.error('邮件失败:', e.message));
      }
    }

    res.status(201).json({ success: true, data: { id: record.id }, message: '报名提交成功！我们将尽快与您联系确认。' });
  } catch(err) {
    console.error('提交失败:', err);
    res.status(500).json({ success: false, errors: ['服务器内部错误'] });
  }
});

app.get('/api/registrations', adminAuth, (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size, 10) || 20));
    const records = loadData();
    records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = records.length;
    const offset = (page - 1) * pageSize;
    res.json({ success: true, data: records.slice(offset, offset + pageSize),
      pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) } });
  } catch(e) { res.status(500).json({ success: false }); }
});

app.get('/api/export', adminAuth, (req, res) => {
  try {
    const records = loadData();
    records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (records.length === 0) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send('暂无报名数据');
    }

    const esc = v => { if (v == null) return ''; const s = String(v); return (s.includes(',')||s.includes('"')||s.includes('\n')) ? '"'+s.replace(/"/g,'""')+'"' : s; };
    const pLabels = { '7':'体验版(7天)','14':'进阶版(14天)','21':'完整版(21天)' };
    const weekNames = { 1:'第一周(8/1-7)', 2:'第二周(8/8-14)', 3:'第三周(8/15-21)' };
    function fmtWeeks(arr) { return Array.isArray(arr) && arr.length > 0 ? arr.map(w => weekNames[w]||w).join('、') : ''; }
    function fmtParent(row, p) { const acc = row[p+'_accompany']||'no'; if (acc==='full') return '全程'; if (acc==='weekly') return '按周:'+fmtWeeks(row[p+'_weeks']); return '不参加'; }

    const headers = ['ID','联系人','手机号','微信号','孩子数','孩子详情','报名产品',
      '父亲陪同','母亲陪同','Q1','Q2','推荐人','渠道','备注','原价','陪同费','总价','报名时间'];
    const lines = [headers.map(esc).join(',')];

    for (const row of records) {
      const kids = row.children.map((c,i) => `${i+1}.${c.name}(${c.gender}${c.age}岁${c.grade})${c.has_special_needs==='yes'?'[特需]':''}`).join('; ');
      lines.push([
        row.id, row.parent_name, row.phone, row.wechat, row.child_count, kids,
        pLabels[row.product]||row.product, fmtParent(row,'father'), fmtParent(row,'mother'),
        row.qa1, row.qa2, row.referrer, row.source, row.notes,
        row.base_price, row.accompany_fee, row.total_price, row.created_at
      ].map(esc).join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="registrations_${Date.now()}.csv"`);
    res.send('\uFEFF' + lines.join('\n'));
  } catch(e) { res.status(500).json({ success: false }); }
});

// ── 启动 ────────────────────────────────────────────
if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`夏令营报名服务: http://localhost:${PORT}`);
    console.log(`管理: http://localhost:${PORT}/api/registrations`);
    console.log(`导出: http://localhost:${PORT}/api/export`);
    if (!SMTP_USER) console.log('⚠ 邮件通知未配置（设置SMTP_USER/SMTP_PASS环境变量启用）');
  });
}
