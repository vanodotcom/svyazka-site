"""Разовая выгрузка текстов канала t.me/westra для подготовки страниц (результат — артефакт сборки, в репозиторий не попадает)."""
import json, re, sys, time, urllib.request
sys.path.insert(0, 'scripts')
from tg_news import text_of
out, before = [], None
for _ in range(60):
    url = 'https://t.me/s/westra' + (f'?before={before}' if before else '')
    page = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30).read().decode('utf-8', 'replace')
    ids = []
    for chunk in page.split('class="tgme_widget_message_wrap')[1:]:
        m = re.search(r'data-post="westra/(\d+)"', chunk)
        if not m: continue
        ids.append(int(m.group(1)))
        t = re.search(r'<div class="tgme_widget_message_text js-message_text"[^>]*>(.*?)</div>', chunk, re.S)
        d = re.search(r'<time[^>]*datetime="([^"]+)"', chunk)
        if t: out.append({'id': int(m.group(1)), 'date': d.group(1)[:10] if d else '', 'text': text_of(t.group(1))})
    if not ids or min(ids) <= 1: break
    before = min(ids); time.sleep(1)
out.sort(key=lambda x: x['id'])
json.dump(out, open('tg_dump.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(out), 'posts')
