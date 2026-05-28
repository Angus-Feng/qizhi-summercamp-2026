/**
 * 启智归塾2026夏令营 - 报名后端 v2（EdgeOne Pages 版）
 * 
 * 支持：多孩子、父母分别陪同、邮件通知、管理密码
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// ── 邮件配置 ──────────────────────────────────────────
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || SMTP_USER;

let transporter = null;
try {
  if (SMTP_USER && SMTP_PASS) {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: 'smtp.qq.com', port: 465, secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
  }
} catch(e) {}

// ── 初始化 ──────────────────────────────────────────
const app = express();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

function adminAuth(req, res, next) {
  if (!ADMIN_PASSWORD) return next();
  const pw = req.query.password || req.headers['x-admin-password'];
  if (pw === ADMIN_PASSWORD) return next();
  res.status(401).json({ success: false, errors: ['管理密码错误'] });
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 不 serve 静态文件（EdgeOne Pages 自动处理）

// ── 数据存储 ─────────────────────────────────────────
const DATA_FILE = '/tmp/registrations.json';
function loadData() {
  try { if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); } catch(e) {}
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
  if (!data.children || !Array.isArray(data.children) || data.children.length === 0) {
    errors.push('请至少添加一个孩子');
  } else {
    data.children.forEach((ch, i) => {
      if (!ch.name || !ch.name.trim()) errors.push(`孩子${i+1}姓名不能为空`);
      if (!ch.gender || !['男','女'].includes(ch.gender)) errors.push(`请选择孩子${i+1}的性别`);
      if (!ch.age || ch.age < 6 || ch.age > 18) errors.push(`孩子${i+1}年龄需在6-18岁`);
    });
  }
  if (!data.product || !['7','14','21'].includes(data.product)) errors.push('请选择报名产品');
  if (!data.qa1 || !data.qa1.trim()) errors.push('请填写开放性问题1');
  if (!data.qa2 || !data.qa2.trim()) errors.push('请填写开放性问题2');
  return errors;
}

// ── 邮件内容 ─────────────────────────────────────────
function buildEmailBody(record) {
  const pLabels = { '7': '体验道场(7天)', '14': '进阶道场(14天)', '21': '完整道场(21天)' };
  const aLabels = { 'no': '不参加', 'full': '全程 ¥3580', 'weekly': '按周 ¥980/7天' };
  let kids = record.children.map((c,i) => `<p><b>孩子${i+1}：</b>${c.name} | ${c.gender} | ${c.age}岁 | ${c.grade}${c.has_special_needs==='yes'?' | 特需:'+c.special_needs_detail:''}</p>`).join('');
  return `<h3>📋 新报名通知</h3><p><b>联系人：</b>${record.parent_name} | ${record.phone} | ${record.wechat}</p><p><b>产品：</b>${pLabels[record.product]||record.product} | ${record.child_count}孩</p>${kids}<p><b>父亲：</b>${aLabels[record.father_accompany]||record.father_accompany} | <b>母亲：</b>${aLabels[record.mother_accompany]||record.mother_accompany}</p><p><b>合计：</b>¥${record.total_price.toLocaleString()}</p><p><b>Q1：</b>${record.qa1}</p><p><b>Q2：</b>${record.qa2}</p>`;
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
      father_weeks: data.father_weeks || 0,
      mother_weeks: data.mother_weeks || 0,
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

    if (transporter && NOTIFY_EMAIL) {
      transporter.sendMail({
        from: SMTP_USER, to: NOTIFY_EMAIL,
        subject: `【夏令营报名】${record.parent_name} - ${record.child_count}孩 ¥${record.total_price}`,
        html: buildEmailBody(record)
      }).catch(() => {});
    }

    res.status(201).json({ success: true, data: { id: record.id }, message: '报名提交成功！我们将尽快与您联系确认。' });
  } catch(err) {
    res.status(500).json({ success: false, errors: ['服务器内部错误'] });
  }
});

app.get('/api/registrations', adminAuth, (req, res) => {
  try {
    const records = loadData();
    records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ success: true, data: records });
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
    const pLabels = { '7':'体验道场(7天)','14':'进阶道场(14天)','21':'完整道场(21天)' };
    const headers = ['ID','联系人','手机号','微信号','孩子数','孩子详情','产品','父亲陪同','母亲陪同','Q1','Q2','推荐人','渠道','备注','原价','陪同费','总价','时间'];
    const lines = [headers.map(esc).join(',')];
    for (const row of records) {
      const kids = row.children.map((c,i) => `${i+1}.${c.name}(${c.gender}${c.age}岁${c.grade})`).join('; ');
      lines.push([row.id,row.parent_name,row.phone,row.wechat,row.child_count,kids,pLabels[row.product]||row.product,row.father_accompany,row.mother_accompany,row.qa1,row.qa2,row.referrer,row.source,row.notes,row.base_price,row.accompany_fee,row.total_price,row.created_at].map(esc).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="registrations_${Date.now()}.csv"`);
    res.send('\uFEFF' + lines.join('\n'));
  } catch(e) { res.status(500).json({ success: false }); }
});

export default app;
