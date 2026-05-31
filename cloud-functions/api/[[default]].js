/**
 * 启智归塾2026夏令营 - 报名后端 v3（EdgeOne Pages 版）
 * 
 * 函数位置：cloud-functions/api/[[default]].js
 * EdgeOne 路由映射：/api/* → 此函数
 * Express 路由同时注册 /api/register 和 /register 两种路径（兼容性保障）
 * 
 * 数据持久化：GitHub API（私有仓库 data/registrations.json）
 * 支持：多孩子、父母分别陪同、邮件通知、管理密码
 */

import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';

// ── 邮件配置 ──────────────────────────────────────────
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const NOTIFY_EMAILS = (process.env.NOTIFY_EMAIL || SMTP_USER).split(',').map(e => e.trim()).filter(Boolean);

let transporter = null;
try {
  if (SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: 'smtp.qq.com', port: 465, secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
  }
} catch(e) { console.error('Mail init error:', e.message); }

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

// ── GitHub 数据存储 ─────────────────────────────────
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = 'Angus-Feng/qizhi-summercamp-2026';
const GITHUB_FILE = 'data/registrations.json';
const GITHUB_API = 'https://api.github.com';

// 内存缓存（减少 API 调用，冷启动时自动失效后重新从 GitHub 读取）
let cachedData = null;
let cachedSha = null;
let cacheTime = 0;
const CACHE_TTL = 3 * 60 * 1000; // 3 分钟缓存

async function ghFetch(path, opts = {}) {
  const headers = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'summercamp-api'
  };
  if (opts.body) headers['Content-Type'] = 'application/json';
  const resp = await fetch(`${GITHUB_API}${path}`, { ...opts, headers });
  return resp;
}

async function loadData() {
  // 缓存命中
  if (cachedData && (Date.now() - cacheTime) < CACHE_TTL) {
    return cachedData;
  }
  try {
    const resp = await ghFetch(`/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`);
    if (resp.status === 404) {
      cachedData = [];
      cachedSha = null;
      cacheTime = Date.now();
      return [];
    }
    if (!resp.ok) {
      console.error('GitHub read error:', resp.status, await resp.text());
      // 降级：返回缓存（可能为空）
      return cachedData || [];
    }
    const json = await resp.json();
    cachedSha = json.sha;
    const content = Buffer.from(json.content, 'base64').toString('utf-8');
    cachedData = JSON.parse(content);
    cacheTime = Date.now();
    return cachedData;
  } catch(e) {
    console.error('loadData error:', e.message);
    return cachedData || [];
  }
}

async function saveData(data) {
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  const body = {
    message: `报名数据更新 ${new Date().toISOString().slice(0,19)}`,
    content,
    ...(cachedSha ? { sha: cachedSha } : {}) // 首次创建无需 sha
  };
  try {
    const resp = await ghFetch(`/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const errText = await resp.text();
      // sha 冲突（并发写入），重新拉取后重试一次
      if (resp.status === 409) {
        console.warn('GitHub sha conflict, retrying...');
        const fresh = await ghFetch(`/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`);
        if (fresh.ok) {
          const freshJson = await fresh.json();
          cachedSha = freshJson.sha;
          // 合并：用最新数据 + 新记录
          const freshData = JSON.parse(Buffer.from(freshJson.content, 'base64').toString('utf-8'));
          // 找出本批新增的记录（不在 freshData 中的）
          const newRecords = data.filter(d => !freshData.some(f => f.id === d.id));
          const merged = [...freshData, ...newRecords];
          // 重试保存
          const retryBody = { message: body.message, content: Buffer.from(JSON.stringify(merged, null, 2)).toString('base64'), sha: cachedSha };
          const retryResp = await ghFetch(`/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`, {
            method: 'PUT', body: JSON.stringify(retryBody)
          });
          if (retryResp.ok) {
            const retryJson = await retryResp.json();
            cachedSha = retryJson.content.sha;
            cachedData = merged;
            cacheTime = Date.now();
            return;
          }
          console.error('GitHub retry save error:', retryResp.status, await retryResp.text());
        }
      }
      console.error('GitHub save error:', resp.status, errText);
      // 即使保存到 GitHub 失败，也更新内存缓存，保证当前请求正常返回
      cachedData = data;
      cacheTime = Date.now();
      return;
    }
    const json = await resp.json();
    cachedSha = json.content.sha;
    cachedData = data;
    cacheTime = Date.now();
  } catch(e) {
    console.error('saveData error:', e.message);
    cachedData = data;
    cacheTime = Date.now();
  }
}

function nextId(data) { return data.length === 0 ? 1 : Math.max(...data.map(r => r.id)) + 1; }

// ── 校验 ────────────────────────────────────────────
function isValidPhone(phone) { return /^1[3-9]\d{9}$/.test(phone); }

function validate(data) {
  const errors = [];
  if (!data.parent_name || !data.parent_name.trim()) errors.push('联系人姓名不能为空');
  if (!data.phone || !isValidPhone(data.phone)) errors.push('请输入正确的11位手机号');
  // 微信号选填
  if (!data.children || !Array.isArray(data.children) || data.children.length === 0) {
    errors.push('请至少添加一个孩子');
  } else {
    data.children.forEach((ch, i) => {
      if (!ch.name || !ch.name.trim()) errors.push(`孩子${i+1}姓名不能为空`);
      if (!ch.gender || !['男','女'].includes(ch.gender)) errors.push(`请选择孩子${i+1}的性别`);
      if (!ch.age || ch.age < 5 || ch.age > 18) errors.push(`孩子${i+1}年龄需在5-18岁`);
      if (!ch.id_number || !/^\d{17}[\dXx]$/.test(ch.id_number)) errors.push(`孩子${i+1}身份证号格式错误`);
    });
  }
  if (!data.product || !['7','14','21'].includes(data.product)) errors.push('请选择报名产品');
  if (!data.qa1 || !data.qa1.trim()) errors.push('请填写开放性问题1');
  if (!data.qa2 || !data.qa2.trim()) errors.push('请填写开放性问题2');
  return errors;
}

// ── 邮件内容 ─────────────────────────────────────────
function buildEmailBody(record) {
  const pLabels = { '7': '体验版(7天)', '14': '进阶版(14天)', '21': '完整版(21天)' };
  const weekNames = { 1: '第一周(8/1-7)', 2: '第二周(8/8-14)', 3: '第三周(8/15-21)' };
  function fmtWeeks(arr) { return arr && arr.length > 0 ? arr.map(w => weekNames[w]||('第'+w+'周')).join('、') : '—'; }
  function fmtParent(p, label) {
    const acc = record[p+'_accompany'] || 'no';
    if (acc === 'no') return label+'：不参加';
    const name = record[p+'_name'] || '';
    const nameStr = name ? name+' | ' : '';
    if (acc === 'full') return label+'：'+nameStr+'全程 ¥3,580';
    return label+'：'+nameStr+'按周('+fmtWeeks(record[p+'_weeks'])+')';
  }
  let kids = record.children.map((c,i) => `<p><b>孩子${i+1}：</b>${c.name} | ${c.gender} | ${c.age}岁 | ${c.grade} | 身份证：${c.id_number||'—'}${c.has_special_needs==='yes'?' | 特需:'+c.special_needs_detail:''}</p>`).join('');
  let extraHtml = '';
  if (record.other_accompany && record.other_accompany !== 'no') {
    const otherLabel = record.other_relation || '其它亲属';
    const accLabel = record.other_accompany === 'full' ? '全程 ¥3,580' : '按周('+fmtWeeks(record.other_weeks)+')';
    extraHtml = `<p><b>${otherLabel}：</b>${accLabel}</p>`;
  }
  return `<h3>📋 新报名通知</h3><p><b>联系人：</b>${record.parent_name}（${record.relation||'未填'}）| ${record.phone}${record.wechat ? ' | '+record.wechat : ''}</p><p><b>产品：</b>${pLabels[record.product]||record.product} | ${record.child_count}孩</p>${kids}<p><b>${fmtParent('father','父亲')}</b></p><p><b>${fmtParent('mother','母亲')}</b></p>${extraHtml}<p><b>合计：</b>¥${record.total_price.toLocaleString()}</p><p><b>Q1：</b>${record.qa1}</p><p><b>Q2：</b>${record.qa2}</p>`;
}

// ── 路由处理函数（async）────────────────────────────

async function handleRegister(req, res) {
  try {
    const data = req.body;
    const errors = validate(data);
    if (errors.length > 0) return res.status(400).json({ success: false, errors });

    const records = await loadData();
    if (records.some(r => r.phone === data.phone)) {
      return res.status(409).json({ success: false, errors: ['该手机号已提交过报名'] });
    }

    const record = {
      id: nextId(records),
      parent_name: data.parent_name.trim(),
      relation: (data.relation || '').trim(),
      phone: data.phone,
      wechat: (data.wechat || '').trim(),
      children: data.children,
      product: data.product,
      father_accompany: data.father_accompany || 'no',
      father_name: (data.father_name || '').trim(),
      father_phone: (data.father_phone || '').trim(),
      mother_accompany: data.mother_accompany || 'no',
      mother_name: (data.mother_name || '').trim(),
      mother_phone: (data.mother_phone || '').trim(),
      father_weeks: Array.isArray(data.father_weeks) ? data.father_weeks : [],
      mother_weeks: Array.isArray(data.mother_weeks) ? data.mother_weeks : [],
      other_accompany: data.other_accompany || 'no',
      other_relation: (data.other_relation || '').trim(),
      other_name: (data.other_name || '').trim(),
      other_phone: (data.other_phone || '').trim(),
      other_weeks: Array.isArray(data.other_weeks) ? data.other_weeks : [],
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
    await saveData(records);

    if (transporter && NOTIFY_EMAILS.length > 0) {
      for (const to of NOTIFY_EMAILS) {
        transporter.sendMail({
          from: SMTP_USER, to,
        subject: `【夏令营报名】${record.parent_name} - ${record.child_count}孩 ¥${record.total_price}`,
        html: buildEmailBody(record)
      }).catch(() => {});
      }
    }

    res.status(201).json({ success: true, data: { id: record.id }, message: '报名提交成功！我们将尽快与您联系确认。' });
  } catch(err) {
    console.error('register error:', err);
    res.status(500).json({ success: false, errors: ['服务器内部错误'] });
  }
}

async function handleListRegistrations(req, res) {
  try {
    const records = await loadData();
    records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ success: true, data: records });
  } catch(e) { res.status(500).json({ success: false }); }
}

async function handleExport(req, res) {
  try {
    const records = await loadData();
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
    function fmtOther(row) { const acc = row.other_accompany||'no'; if (acc==='no') return ''; const rel = row.other_relation||'其它亲属'; const detail = acc==='full'?'全程':'按周:'+fmtWeeks(row.other_weeks); return rel+':'+detail; }
    const headers = ['ID','联系人','关系','手机号','微信号','孩子数','孩子详情(含身份证)','产品','父亲陪同','母亲陪同','其它亲属','Q1','Q2','推荐人','渠道','备注','原价','陪同费','总价','时间'];
    const lines = [headers.map(esc).join(',')];
    for (const row of records) {
      const kids = row.children.map((c,i) => `${i+1}.${c.name}(${c.gender}${c.age}岁${c.grade} ID:${c.id_number||'—'})`).join('; ');
      lines.push([row.id,row.parent_name,row.relation||'',row.phone,row.wechat,row.child_count,kids,pLabels[row.product]||row.product,fmtParent(row,'father'),fmtParent(row,'mother'),fmtOther(row),row.qa1,row.qa2,row.referrer,row.source,row.notes,row.base_price,row.accompany_fee,row.total_price,row.created_at].map(esc).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="registrations_${Date.now()}.csv"`);
    res.send('\uFEFF' + lines.join('\n'));
  } catch(e) { res.status(500).json({ success: false }); }
}

// ── 注册路由（双路径兼容）──────────────────────────────
app.post('/api/register', handleRegister);
app.post('/register', handleRegister);

app.get('/api/registrations', adminAuth, handleListRegistrations);
app.get('/registrations', adminAuth, handleListRegistrations);

app.get('/api/export', adminAuth, handleExport);
app.get('/export', adminAuth, handleExport);

export default app;
