#!/usr/bin/env python3
"""
读取启智归塾2026夏令营报名表Word文件，提取数据并提交到报名数据库

用法:
  python3 tools/read_word_form.py 张三填好的报名表.docx
  python3 tools/read_word_form.py 张三填好的报名表.docx --dry-run   # 仅预览，不提交
  python3 tools/read_word_form.py 张三填好的报名表.docx --local      # 提交到本地服务器

文件路径建议放到 summercamp/word_submissions/ 目录下
"""
import sys, os, re, json, argparse
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

from docx import Document

# ── API 地址 ────────────────────────────────
API_URL = 'https://summercamp.qizhishuyuan.cn/api/register'
LOCAL_URL = 'http://localhost:3000/api/register'

# ── 价格常量 ────────────────────────────────
PRODUCT_PRICES = { '7': 2980, '14': 4980, '21': 6980 }
ACCOMPANY_RATE_FULL = 3580
ACCOMPANY_RATE_7DAY = 980

def extract_table_data(doc):
    """从Word表格中提取所有单元格文本，按表分组"""
    result = []
    for table in doc.tables:
        rows_data = []
        for row in table.rows:
            cells_text = []
            for cell in row.cells:
                text = cell.text.strip()
                cells_text.append(text)
            rows_data.append(cells_text)
        result.append(rows_data)
    return result

def extract_form_data(doc):
    """根据表单结构提取字段"""
    data = {}
    tables = extract_table_data(doc)
    
    # 辅助：从特定表格的行中取"值"列（第二列），过滤占位符
    def cell_values(table_idx, skip_header=False):
        rows = tables[table_idx]
        start = 1 if skip_header else 0
        vals = []
        for row in rows[start:]:
            if len(row) > 1:
                val = row[1].strip()
                # 过滤占位符文本
                if val and val not in ('None', '') and '请选择' not in val and '请输入' not in val:
                    vals.append(val)
                elif val:
                    vals.append('')  # 占位符视为空
        return vals

    # Table indices in the generated form:
    # 0: 联系人信息 (parent_name, phone, wechat)
    # 1: 孩子1
    # 2: 孩子2
    # 3: 孩子3
    # 4: 报名选型 (product)
    # 5: 母亲陪同 (mother_accompany)
    # 6: 父亲陪同 (father_accompany)
    # 7: 开放性问题 (qa1, qa2)
    # 8: 其他信息 (referrer, source, notes)
    
    if len(tables) >= 1:
        vals = cell_values(0)
        if len(vals) >= 1: data['parent_name'] = vals[0]
        if len(vals) >= 2: data['phone'] = vals[1]
        if len(vals) >= 3: data['wechat'] = vals[2] if vals[2] not in ('请输入微信号（选填）',) else ''
    
    # 孩子信息
    children = []
    for child_idx in range(3):
        tidx = 1 + child_idx
        if tidx >= len(tables):
            break
        vals = cell_values(tidx)
        if len(vals) < 1 or not vals[0] or '孩子' in vals[0]:
            continue
        child = {}
        if len(vals) >= 1: child['name'] = vals[0]
        if len(vals) >= 2: child['gender'] = vals[1] if vals[1] in ('男', '女') else ''
        if len(vals) >= 3:
            try: child['age'] = int(re.sub(r'[^\d]', '', vals[2]))
            except: child['age'] = 0
        if len(vals) >= 4: child['id_number'] = vals[3]
        if len(vals) >= 5: child['grade'] = vals[4] if vals[4] not in ('请选择', '') else ''
        if len(vals) >= 6: child['has_special_needs'] = 'yes' if vals[5] == '有' else 'no'
        if len(vals) >= 7: child['special_needs_detail'] = vals[6]
        children.append(child)
    data['children'] = children
    
    # 产品（从勾选段落中解析）
    data['product'] = ''
    for para in doc.paragraphs:
        text = para.text
        # 检查勾选标记：☑ ✓ ✔ [x] [X] √ ● ■ 或 □ 被替换为非□字符
        checked = any(m in text for m in ['☑', '✓', '✔', '[x]', '[X]', '√', '●', '■'])
        if not checked:
            # □ 可能被改成了非□字符（如用户在□后写了内容，或替换了□）
            # 只要不是以□开头就视为已选
            pass  # 太不准确，跳过
        if ('体验版' in text or '7天' in text) and '体验版' not in text.replace('□','').strip()[:4]:
            # 非□开头 → 可能是 ✓体验版 或 用户删掉了□
            pass
        # 更可靠的判断：如果整行不是以"□ "开头，且包含版本关键词
        stripped = text.strip()
        is_checked = not stripped.startswith('□')
        if '体验版' in text and is_checked: data['product'] = '7'
        elif '进阶版' in text and is_checked: data['product'] = '14'
        elif '完整版' in text and is_checked: data['product'] = '21'

    # 母亲陪同 (table 4)
    if len(tables) >= 5:
        vals = cell_values(4)
        if len(vals) >= 1:
            a = vals[0]
            if '全程' in a: data['mother_accompany'] = 'full'
            elif '按周' in a: data['mother_accompany'] = 'weekly'
            else: data['mother_accompany'] = 'no'
    
    # 父亲陪同 (table 5)
    if len(tables) >= 6:
        vals = cell_values(5)
        if len(vals) >= 1:
            a = vals[0]
            if '全程' in a: data['father_accompany'] = 'full'
            elif '按周' in a: data['father_accompany'] = 'weekly'
            else: data['father_accompany'] = 'no'

    # 其它亲属 (table 6, 2 rows: relation, accompany)
    if len(tables) >= 7:
        vals = cell_values(6)
        if len(vals) >= 1: data['other_relation'] = vals[0]
        if len(vals) >= 2:
            a = vals[1]
            if '全程' in a: data['other_accompany'] = 'full'
            elif '按周' in a: data['other_accompany'] = 'weekly'
            else: data['other_accompany'] = 'no'
    
    # 周次解析：从段落中查找复选框标记
    def parse_weeks_from_paragraphs(prefix):
        """从文档段落中查找周次勾选"""
        weeks = []
        for para in doc.paragraphs:
            text = para.text
            if prefix in text:
                # 查找常见的勾选标记：☑ ✓ ✔ [x] [X] √ ● 或替换后的□变了
                if '第一周' in text and any(m in text for m in ['☑', '✓', '✔', '[x]', '[X]', '√', '●']):
                    weeks.append(1)
                elif '第一周' in text and not ('□ 第一周' in text):
                    # 可能被标记了，需要更精确判断
                    # 如果能找到非默认的标记就加入
                    pass
        # 回退：也检查表格后的段落
        return weeks

    # 从文档段落中检查周次
    mother_weeks = []
    father_weeks = []
    other_weeks = []
    in_father = False
    in_other = False
    for para in doc.paragraphs:
        text = para.text.strip()
        if '母亲' in text and ('按周' in text or '周次' in text):
            in_father = False; in_other = False
            continue
        if '父亲' in text and ('按周' in text or '周次' in text):
            in_father = True; in_other = False
            continue
        if '其它亲属' in text and ('按周' in text or '周次' in text):
            in_father = False; in_other = True
            continue
        if '第一周' in text and '(8月1日' in text:
            checked = any(m in text for m in ['☑', '✓', '✔', '[x]', '[X]', '√', '●', '■'])
            # 也检查□是否被改成了其他字符
            if '□第一周' not in text and '□ 第一周' not in text:
                checked = True
            if checked:
                if in_other: other_weeks.append(1)
                elif in_father: father_weeks.append(1)
                else: mother_weeks.append(1)
        elif '第二周' in text and '(8月8日' in text:
            checked = any(m in text for m in ['☑', '✓', '✔', '[x]', '[X]', '√', '●', '■'])
            if '□第二周' not in text and '□ 第二周' not in text:
                checked = True
            if checked:
                if in_other: other_weeks.append(2)
                elif in_father: father_weeks.append(2)
                else: mother_weeks.append(2)
        elif '第三周' in text and '(8月15日' in text:
            checked = any(m in text for m in ['☑', '✓', '✔', '[x]', '[X]', '√', '●', '■'])
            if '□第三周' not in text and '□ 第三周' not in text:
                checked = True
            if checked:
                if in_other: other_weeks.append(3)
                elif in_father: father_weeks.append(3)
                else: mother_weeks.append(3)
    
    data['mother_weeks'] = mother_weeks if data.get('mother_accompany') == 'weekly' else []
    data['father_weeks'] = father_weeks if data.get('father_accompany') == 'weekly' else []
    data['other_weeks'] = other_weeks if data.get('other_accompany') == 'weekly' else []
    
    # QAs (table 7)
    if len(tables) >= 8:
        vals = cell_values(7)
        if len(vals) >= 1: data['qa1'] = vals[0]
        if len(vals) >= 2: data['qa2'] = vals[1]
    
    # 其他 (table 8)
    if len(tables) >= 9:
        vals = cell_values(8)
        if len(vals) >= 1: data['referrer'] = vals[0] if vals[0] not in ('如有人推荐请填写',) else ''
        if len(vals) >= 2: data['source'] = vals[1] if vals[1] not in ('请选择', '') else ''
        if len(vals) >= 3: data['notes'] = vals[2] if vals[2] not in ('如有特殊要求请说明',) else ''
    
    # 默认值
    data.setdefault('parent_name', '')
    data.setdefault('phone', '')
    data.setdefault('wechat', '')
    data.setdefault('product', '')
    data.setdefault('father_accompany', 'no')
    data.setdefault('mother_accompany', 'no')
    data.setdefault('other_accompany', 'no')
    data.setdefault('other_relation', '')
    data.setdefault('qa1', '')
    data.setdefault('qa2', '')
    data.setdefault('referrer', '')
    data.setdefault('source', '')
    data.setdefault('notes', '')
    
    # 计算价格
    product = data['product']
    base_price = PRODUCT_PRICES.get(product, 0)
    data['child_count'] = len(data['children'])
    data['base_price'] = base_price
    data['children_total'] = data['child_count'] * base_price
    
    accompany_fee = 0
    if data.get('father_accompany') == 'full': accompany_fee += ACCOMPANY_RATE_FULL
    elif data.get('father_accompany') == 'weekly': accompany_fee += len(father_weeks) * ACCOMPANY_RATE_7DAY
    if data.get('mother_accompany') == 'full': accompany_fee += ACCOMPANY_RATE_FULL
    elif data.get('mother_accompany') == 'weekly': accompany_fee += len(mother_weeks) * ACCOMPANY_RATE_7DAY
    if data.get('other_accompany') == 'full': accompany_fee += ACCOMPANY_RATE_FULL
    elif data.get('other_accompany') == 'weekly': accompany_fee += len(other_weeks) * ACCOMPANY_RATE_7DAY
    data['accompany_fee'] = accompany_fee
    data['total_price'] = data['children_total'] + accompany_fee
    
    return data

def validate_data(data):
    """校验数据"""
    errors = []
    if not data.get('parent_name'): errors.append('联系人姓名不能为空')
    phone = data.get('phone', '')
    if not re.match(r'^1[3-9]\d{9}$', phone): errors.append('请输入正确的11位手机号')
    if not data.get('children'):
        errors.append('请至少填写一个孩子')
    else:
        for i, ch in enumerate(data['children']):
            if not ch.get('name'): errors.append(f'孩子{i+1}姓名不能为空')
            if not ch.get('gender') or ch['gender'] not in ('男', '女'): errors.append(f'孩子{i+1}性别无效')
            if not ch.get('age') or ch['age'] < 5 or ch['age'] > 18: errors.append(f'孩子{i+1}年龄需在5-18岁')
            if not ch.get('id_number') or not re.match(r'^\d{17}[\dXx]$', ch.get('id_number', '')): errors.append(f'孩子{i+1}身份证号格式错误')
    if not data.get('product') or data['product'] not in ('7', '14', '21'): errors.append('请选择报名产品')
    if not data.get('qa1'): errors.append('请填写开放性问题1')
    if not data.get('qa2'): errors.append('请填写开放性问题2')
    return errors

def print_summary(data):
    """打印数据摘要"""
    print('\n📋 报名数据预览：')
    print(f'  联系人：{data["parent_name"]} | {data["phone"]}')
    if data.get('wechat'): print(f'  微信：{data["wechat"]}')
    print(f'  孩子数：{data["child_count"]}')
    for i, ch in enumerate(data['children']):
        print(f'    孩子{i+1}：{ch.get("name","?")} | {ch.get("gender","?")} | {ch.get("age","?")}岁 | {ch.get("grade","")}')
    p_names = {'7':'体验版(7天)','14':'进阶版(14天)','21':'完整版(21天)'}
    print(f'  产品：{p_names.get(data["product"],data["product"])}')
    print(f'  母亲：{data["mother_accompany"]} 周次={data.get("mother_weeks",[])}')
    print(f'  父亲：{data["father_accompany"]} 周次={data.get("father_weeks",[])}')
    print(f'  Q1：{data.get("qa1","")[:50]}...')
    print(f'  Q2：{data.get("qa2","")[:50]}...')
    print(f'  合计：¥{data["total_price"]:,}')

def submit_data(data, api_url):
    """提交到API"""
    import urllib.request
    try:
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        req = urllib.request.Request(api_url, data=body, headers={'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode('utf-8'))
            return result
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        try:
            return json.loads(err_body)
        except:
            return {'success': False, 'errors': [f'HTTP {e.code}: {err_body}']}
    except Exception as e:
        return {'success': False, 'errors': [str(e)]}

def main():
    parser = argparse.ArgumentParser(description='读取Word报名表并提交到报名数据库')
    parser.add_argument('file', help='Word报名表文件路径(.docx)')
    parser.add_argument('--dry-run', action='store_true', help='仅预览不提交')
    parser.add_argument('--local', action='store_true', help='提交到本地服务器')
    parser.add_argument('--url', help='自定义API地址')
    args = parser.parse_args()
    
    if not os.path.exists(args.file):
        print(f'❌ 文件不存在: {args.file}')
        sys.exit(1)
    
    print(f'📖 读取文件: {args.file}')
    doc = Document(args.file)
    data = extract_form_data(doc)
    
    print_summary(data)
    
    errors = validate_data(data)
    if errors:
        print(f'\n❌ 数据校验失败：')
        for e in errors:
            print(f'  - {e}')
        if not args.dry_run:
            print('\n请修正Word文件后重试，或用 --dry-run 先预览')
            sys.exit(1)
        else:
            print('\n（dry-run模式，不提交）')
            return
    
    if args.dry_run:
        print('\n✅ 数据校验通过（dry-run模式，未提交）')
        return
    
    api_url = args.url or (LOCAL_URL if args.local else API_URL)
    print(f'\n📤 提交到: {api_url}')
    result = submit_data(data, api_url)
    
    if result.get('success'):
        print(f'✅ 提交成功！报名ID: {result.get("data",{}).get("id","?")}')
    else:
        print(f'❌ 提交失败：')
        for e in result.get('errors', ['未知错误']):
            print(f'  - {e}')

if __name__ == '__main__':
    main()
