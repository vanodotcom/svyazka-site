"""Забирает последние посты из публичного канала t.me/westra и пишет news.json для главной.
Запускается раз в час: на GitLab в .gitlab-ci.yml, на GitHub в .github/workflows/tg-news.yml.

Картинки трёх новостей, которые показывает главная, робот скачивает к себе в img/news/
(имя = номер поста, например 1084.jpg), чтобы главная не зависела от доступности Телеграма.
Картинки ушедших с главной новостей удаляются, хранится только то, что сейчас на главной."""
import html, json, os, re, sys, urllib.request
from datetime import datetime, timezone, timedelta

CHANNEL = 'westra'
LIMIT = 6
SHOW = 3           # столько новостей показывает главная (p/home.html), только их картинки храним
IMG_DIR = 'img/news'
UA = {'User-Agent': 'Mozilla/5.0 (svyazka-site news bot)'}
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

def cache_photos(posts):
    """Скачать картинки первых SHOW новостей в img/news/ и записать в photo путь к копии.
    Если скачать не вышло, остаётся ссылка на Телеграм. У остальных новостей картинки нет (на главной их не видно)."""
    os.makedirs(IMG_DIR, exist_ok=True)
    keep = set()
    for i, post in enumerate(posts):
        url = post.get('photo') or ''
        if i >= SHOW or not url:
            post['photo'] = '' if i >= SHOW else url
            continue
        name = post['link'].rstrip('/').split('/')[-1] + '.jpg'
        path = os.path.join(IMG_DIR, name)
        try:
            if not os.path.exists(path):  # картинка поста не меняется, второй раз не качаем
                data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read()
                with open(path, 'wb') as f:
                    f.write(data)
            post['photo'] = IMG_DIR + '/' + name  # путь от корня сайта; главная достраивает адрес сама
            keep.add(name)
        except Exception as e:
            print('photo not cached:', url[:60], e)
    for name in os.listdir(IMG_DIR):  # убрать картинки новостей, которых больше нет на главной
        if name not in keep:
            os.remove(os.path.join(IMG_DIR, name))

def main():
    req = urllib.request.Request('https://t.me/s/' + CHANNEL, headers=UA)
    page = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'replace')
    posts = parse(page)
    if not posts:
        print('no posts parsed, keeping old news.json')
        return 0
    cache_photos(posts)
    with open('news.json', 'w', encoding='utf-8') as f:
        json.dump(posts, f, ensure_ascii=False, indent=1)
    print('posts:', len(posts))
    return 0

if __name__ == '__main__':
    sys.exit(main())
