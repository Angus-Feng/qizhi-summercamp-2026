#!/usr/bin/env node
/**
 * 生成启智归塾2026夏令营可交互Word报名表
 * 使用清晰的表格格式 + 占位符，用户直接在占位符处填写
 */
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        HeadingLevel, AlignmentType, BorderStyle, ShadingType, WidthType,
        WidthType: WT } = require('docx');
const fs = require('fs');
const path = require('path');

const GREEN = '2E7D32';
const GREEN_BG = 'E8F5E9';
const GRAY = '888888';
const BORDER_COLOR = 'C8CCD0';
const RED = 'CC3333';

const border = { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };
const TABLE_WIDTH = 9026;

function fieldRow(label, fieldKey, placeholder, required) {
  const labelRun = [new TextRun({ text: label, bold: true, size: 22, font: '微软雅黑' })];
  if (required) {
    labelRun.push(new TextRun({ text: ' *', color: RED, size: 22 }));
  }
  return new TableRow({
    children: [
      new TableCell({
        borders, margins: cellMargins, width: { size: 2400, type: WidthType.DXA },
        shading: { fill: GREEN_BG, type: ShadingType.CLEAR },
        children: [new Paragraph({ children: labelRun })]
      }),
      new TableCell({
        borders, margins: cellMargins, width: { size: 6626, type: WidthType.DXA },
        children: [new Paragraph({
          children: [new TextRun({ text: placeholder, color: GRAY, size: 22, italics: true })]
        })]
      })
    ]
  });
}

function dropdownRow(label, fieldKey, options, required) {
  const labelRun = [new TextRun({ text: label, bold: true, size: 22, font: '微软雅黑' })];
  if (required) {
    labelRun.push(new TextRun({ text: ' *', color: RED, size: 22 }));
  }
  return new TableRow({
    children: [
      new TableCell({
        borders, margins: cellMargins, width: { size: 2400, type: WidthType.DXA },
        shading: { fill: GREEN_BG, type: ShadingType.CLEAR },
        children: [new Paragraph({ children: labelRun })]
      }),
      new TableCell({
        borders, margins: cellMargins, width: { size: 6626, type: WidthType.DXA },
        children: [new Paragraph({
          children: [new TextRun({ text: '请选择：', color: GRAY, size: 22, italics: true }),
                     new TextRun({ text: '  ' + options.join(' / '), color: GRAY, size: 20 })]
        })]
      })
    ]
  });
}

function sectionTitle(text) {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, color: GREEN, font: '微软雅黑' })]
  });
}

function spacer() {
  return new Paragraph({ spacing: { before: 60, after: 60 }, children: [] });
}

async function main() {
  const children = [];

  // Title
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [new TextRun({ text: '启智归塾 · 2026夏令营报名表', bold: true, size: 36, font: '微软雅黑' })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: '启智书院 × 日月洲度假村 × 江淮书院  联合主办', size: 20, color: GREEN, font: '微软雅黑' })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [
      new TextRun({ text: '时间：2026年8月1日 — 8月21日（共21天）', size: 22, bold: true, color: GREEN, font: '微软雅黑' })
    ]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [
      new TextRun({ text: '地点：淮安日月洲度假村（淮安经济技术开发区南马厂大道99号）', size: 22, bold: true, color: GREEN, font: '微软雅黑' })
    ]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: '请在下方表格中直接填写，填写完毕后保存发回工作人员', size: 18, color: GRAY, italics: true })]
  }));

  // ══ Section 1: 联系人 ══
  children.push(sectionTitle('一、联系人信息'));
  children.push(new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [2400, 6626],
    rows: [
      fieldRow('联系人姓名', 'parent_name', '请输入您的姓名', true),
      dropdownRow('与孩子的关系', 'relation', ['母亲','父亲','爷爷','奶奶','外公','外婆','舅舅','其他亲属'], true),
      fieldRow('手机号', 'phone', '请输入11位手机号', true),
      fieldRow('微信号', 'wechat', '请输入微信号（选填）', false),
    ]
  }));
  children.push(spacer());

  // ══ Section 2: 孩子 ══
  children.push(sectionTitle('二、孩子信息（可填写1-3个孩子，至少填1个）'));
  for (let i = 1; i <= 3; i++) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `孩子 ${i}`, bold: true, size: 22, font: '微软雅黑' })]
    }));
    children.push(new Table({
      width: { size: TABLE_WIDTH, type: WidthType.DXA },
      columnWidths: [2400, 6626],
      rows: [
        fieldRow('  姓名', `child${i}_name`, `孩子${i}姓名`, i === 1),
        dropdownRow('  性别', `child${i}_gender`, ['男', '女'], i === 1),
        fieldRow('  年龄(5-18)', `child${i}_age`, '如：10（超龄请加微信）', i === 1),
        fieldRow('  身份证号', `child${i}_idnum`, '18位身份证号，必填', i === 1),
      ]
    }));
    // 年级勾选
    children.push(new Paragraph({
      spacing: { before: 60 },
      children: [new TextRun({ text: '  年级（请勾选一项）：', size: 20, color: GRAY })]
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: '    □ 学前    □ 小1-3    □ 小4-6    □ 初中    □ 高中', size: 22, font: '微软雅黑' })]
    }));
    // 特殊需求勾选
    children.push(new Paragraph({
      spacing: { before: 40 },
      children: [new TextRun({ text: '  特殊需求（请勾选）：', size: 20, color: GRAY })]
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: '    □ 无    □ 有（如有请在下行填写说明）', size: 22, font: '微软雅黑' })]
    }));
    children.push(new Table({
      width: { size: TABLE_WIDTH, type: WidthType.DXA },
      columnWidths: [2400, 6626],
      rows: [
        fieldRow('  特殊需求说明', `child${i}_special_detail`, '如：食物过敏、药物等', false),
      ]
    }));
    children.push(spacer());
  }

  // ══ Section 3: 产品 ══
  children.push(sectionTitle('三、报名选型（请勾选一项）'));
  children.push(new Paragraph({
    spacing: { before: 80 },
    children: [new TextRun({ text: '□ 体验版（7天）¥2,980/人', size: 24, font: '微软雅黑' })]
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: '    适合初次体验，7天道场启蒙', size: 18, color: GRAY })]
  }));
  children.push(new Paragraph({
    spacing: { before: 40 },
    children: [new TextRun({ text: '□ 进阶版（14天）¥4,980/人', size: 24, font: '微软雅黑' })]
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: '    14天深度体验，心性扎根', size: 18, color: GRAY })]
  }));
  children.push(new Paragraph({
    spacing: { before: 40 },
    children: [new TextRun({ text: '□ 完整版（21天）¥6,980/人', size: 24, font: '微软雅黑' })]
  }));
  children.push(new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text: '    完整21天道场，完整蜕变', size: 18, color: GRAY })]
  }));
  children.push(spacer());

  // ══ Section 4: 家长陪同 ══
  children.push(sectionTitle('四、家长陪同（选填）'));
  
  function parentCheckboxes(title, prefix) {
    children.push(new Paragraph({
      spacing: { before: 60 },
      children: [new TextRun({ text: title, bold: true, size: 22, font: '微软雅黑' })]
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: '参与方式（请勾选一项）：', size: 20, color: GRAY })]
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: '□ 不参加    □ 全程 ¥3,580    □ 按周 ¥980/7天', size: 22, font: '微软雅黑' })]
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: '按周时勾选以下周次：', size: 20, color: GRAY })]
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: '□ 第一周（8月1日-7日）    □ 第二周（8月8日-14日）    □ 第三周（8月15日-21日）', size: 22, font: '微软雅黑' })]
    }));
    children.push(spacer());
  }
  
  parentCheckboxes('母亲陪同', 'mother');
  parentCheckboxes('父亲陪同', 'father');
  
  // ── 其它亲属 ──
  children.push(new Paragraph({
    children: [new TextRun({ text: '其它亲属（选填）', bold: true, size: 22, font: '微软雅黑' })]
  }));
  children.push(new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [2400, 6626],
    rows: [
      fieldRow('与孩子关系', 'other_relation', '请注明身份（如：爷爷、舅舅等）', false),
    ]
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: '参与方式（请勾选一项）：', size: 20, color: GRAY })]
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: '□ 不参加    □ 全程 ¥3,580    □ 按周 ¥980/7天', size: 22, font: '微软雅黑' })]
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: '按周时勾选以下周次（其它亲属）：', size: 20, color: GRAY })]
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: '□ 第一周（8月1日-7日）    □ 第二周（8月8日-14日）    □ 第三周（8月15日-21日）', size: 22, font: '微软雅黑' })]
  }));
  children.push(spacer());
  children.push(new Paragraph({
    children: [new TextRun({ text: '按周时勾选以下周次（其它亲属）：', size: 20, color: GRAY })]
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: '□ 第一周（8月1日-7日）    □ 第二周（8月8日-14日）    □ 第三周（8月15日-21日）', size: 20, color: GRAY })]
  }));
  children.push(spacer());

  // ══ Section 5: 开放性问题 ══
  children.push(sectionTitle('五、开放性问题'));
  children.push(new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [2400, 6626],
    rows: [
      fieldRow('1. 孩子最近一次让你\n意外或触动的事？', 'qa1', '请在这里写下您的回答', true),
      fieldRow('2. 您对这次夏令营\n的期待是什么？', 'qa2', '请在这里写下您的回答', true),
    ]
  }));
  children.push(spacer());

  // ══ Section 6: 其他 ══
  children.push(sectionTitle('六、其他信息（选填）'));
  children.push(new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [2400, 6626],
    rows: [
      fieldRow('推荐人', 'referrer', '如有人推荐请填写', false),
      fieldRow('备注', 'notes', '如有特殊要求请说明', false),
    ]
  }));
  children.push(new Paragraph({
    spacing: { before: 60 },
    children: [new TextRun({ text: '获知渠道（请勾选）：', size: 20, color: GRAY })]
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: '□ 微信朋友圈    □ 公众号    □ 朋友推荐    □ 抖音/视频号    □ 其他', size: 22, font: '微软雅黑' })]
  }));

  const doc = new Document({
    styles: {
      default: { document: { run: { font: '微软雅黑', size: 22 } } }
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = path.join(__dirname, '..', '启智归塾2026夏令营报名表.docx');
  fs.writeFileSync(outPath, buffer);
  console.log(`✅ Word报名表已生成: ${outPath}`);
}

main().catch(console.error);
