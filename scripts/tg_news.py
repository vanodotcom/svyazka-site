"""Забирает последние посты из публичного канала t.me/westra и пишет news.json для главной.
Запускается GitHub Actions раз в час (.github/workflows/tg-news.yml)."""
import html, json, re, sys, urllib.request
from datetime import datetime, timezone, timedelta

CHANNEL = 'westra'
LIMIT = 6
MONTHS = ['янв', 'февр', 'марта', 'апр', 'мая', 'июня', 'июля', 'авг', 'сент', 'окт', 'нояб', 'дек']

def text_of(fragment):
    s = re.sub(r'<br\s*/?>', '\n', fragment)
    s = re.sub(r'<[^>]+>', '', s)
    return html.unescape(s).replace('\xa0', ' ').strip()

def short(s, n):
    s = re.sub(r'\s+', ' ', s).strip()
    if len(s) <= n:
        return s
    cut = s[:n].rsplit(' ', 1)[0].rstrip(' ,.;:—-')
    return cut + '…'

def parse(page):
    posts = []
    for chunk in page.split('class="tgme_widget_message_wrap')[1:]:
        m = re.search(r'data-post="([^"/]+/\d+)"', chunk)
        if not m:
            continue
        link = 'https://t.me/' + m.group(1)
        t = re.search(r'<div class="tgme_widget_message_text js-message_text"[^>]*>(.*?)</div>', chunk, re.S)
        body = text_of(t.group(1)) if t else ''
        if not body:
            continue
        lines = [l.strip() for l in body.split('\n') if l.strip()]
        first = re.match(r'(.{10,100}?[.!?])\s+(.+)', lines[0], re.S)
        if first and len(lines[0]) > 90:  # длинный первый абзац: заголовок = первое предложение
            lines[0:1] = [first.group(1), first.group(2)]
        title = short(lines[0], 90)
        rest = ' '.join(lines[1:]) if len(lines) > 1 else ''
        if not rest and len(re.sub(r'\s+', ' ', lines[0])) > 90:
            rest = re.sub(r'\s+', ' ', lines[0])[len(title.rstrip('…')):]
        photo = ''
        p = re.search(r"tgme_widget_message_(?:photo_wrap|video_thumb)[^>]*background-image:url\('([^']+)'\)", chunk)
        if p:
            photo = p.group(1)
        date = ''
        d = re.search(r'<time[^>]*datetime="([^"]+)"', chunk)
        if d:
            try:
                dt = datetime.fromisoformat(d.group(1)).astimezone(timezone(timedelta(hours=3)))
                date = '%d %s' % (dt.day, MONTHS[dt.month - 1])
            except ValueError:
                pass
        posts.append({'date': date, 'title': title, 'text': short(rest, 160), 'link': link, 'photo': photo})
    posts.reverse()  # на странице канала старые посты сверху
    return posts[:LIMIT]

def main():
    req = urllib.request.Request('https://t.me/s/' + CHANNEL, headers={'User-Agent': 'Mozilla/5.0 (svyazka-site news bot)'})
    page = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'replace')
    posts = parse(page)
    if not posts:
        print('no posts parsed, keeping old news.json')
        return 0
    with open('news.json', 'w', encoding='utf-8') as f:
        json.dump(posts, f, ensure_ascii=False, indent=1)
    print('posts:', len(posts))
    return 0

if __name__ == '__main__':
    sys.exit(main())
