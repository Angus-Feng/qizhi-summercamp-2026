#!/usr/bin/env python3
"""将 static-wechat.html 中所有图片转为 base64 内嵌"""
import re, base64, os, sys, urllib.request

BASE = '/Users/feng/WorkBuddy/2026-05-26-09-12-40/summercamp'
HTML_FILE = os.path.join(BASE, 'static-wechat.html')

with open(HTML_FILE, 'r', encoding='utf-8') as f:
    html = f.read()

def img_to_b64(data, mime='image/jpeg'):
    return f'data:{mime};base64,{base64.b64encode(data).decode()}'

def get_image_data(src):
    """获取图片二进制数据"""
    if src.startswith('http'):
        try:
            with urllib.request.urlopen(src, timeout=15) as resp:
                return resp.read()
        except Exception as e:
            print(f'  ⚠️ 下载失败 {src}: {e}')
            return None
    else:
        path = os.path.join(BASE, src)
        if os.path.exists(path):
            with open(path, 'rb') as f:
                return f.read()
        else:
            print(f'  ⚠️ 文件不存在 {path}')
            return None

# 找到所有 img src 属性
pattern = r'(<img[^>]*src=")([^"]+)(")'
modified = 0

def replace_src(match):
    global modified
    prefix = match.group(1)
    src = match.group(2)
    suffix = match.group(3)
    
    # 跳过已经是 data: 的
    if src.startswith('data:'):
        return match.group(0)
    
    # 跳过 blob_ref（特殊的占位符）
    if 'image_blob_ref' in src:
        return match.group(0)
    
    print(f'  处理: {src[:60]}...')
    data = get_image_data(src)
    if data:
        b64 = img_to_b64(data)
        modified += 1
        return f'{prefix}{b64}{suffix}'
    return match.group(0)

html = re.sub(pattern, replace_src, html)

print(f'\n✅ 共转换 {modified} 张图片')
with open(HTML_FILE, 'w', encoding='utf-8') as f:
    f.write(html)
print(f'✅ 写入完成: {HTML_FILE}')
