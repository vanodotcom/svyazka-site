"""Собирает data/search.json для поиска в меню: адрес, заголовок и текст каждой страницы из p/.
Запускается роботом после каждой правки в p/ (.github/workflows/search-index.yml)."""
import html, json, os, re
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# файл → (адрес на сайте, название в результатах поиска). Новую страницу добавить сюда.
PAGES = {
    'home': ('/', 'Главная'),
    'start': ('/start/', 'Я здесь впервые'),
    'schools': ('/schools/', 'Горный туризм: школы НУ, БУ, СУ'),
    'hiking': ('/schools/hiking/', 'Пешеходный туризм'),
    'water': ('/schools/water/', 'Водный туризм'),
    'ski': ('/schools/ski/', 'Лыжный туризм'),
    'alpinism': ('/schools/alpinism/', 'Альпинизм'),
    'join': ('/schools/join/', 'Записаться в школу'),
    'places': ('/schools/places/', 'Места занятий'),
    'hikes': ('/hikes/', 'Походы сезона'),
    'live': ('/hikes/live/', 'Вести с полей'),
    'lead': ('/hikes/lead/', 'Руководителю похода и МКК'),
    'calendar': ('/calendar/', 'Календарь'),
    'library': ('/library/', 'Библиотека'),
    'passes': ('/library/passes/', 'Каталог перевалов'),
    'club': ('/club/', 'О клубе'),
    'gallery': ('/club/gallery/', 'Как мы ходим в горы'),
    'people': ('/club/people/', 'Люди и контакты'),
    'member': ('/club/member/', 'Как стать членом клуба'),
    'history': ('/club/history/', 'История клуба'),
    'merch': ('/club/merch/', 'Мерч клуба'),
    'style': ('/club/style/', 'Фирменный стиль'),
    'privacy': ('/privacy/', 'Политика обработки персональных данных'),
    'soglasie': ('/soglasie/', 'Согласие на обработку персональных данных'),
}
CYR = re.compile('[А-Яа-яЁё]')
STR = re.compile(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"")
TAG = re.compile(r'<[^>]+>')
PLACEHOLDER = re.compile(r'\[[^\]]*\]|ПОЧТА_КЛУБА')


class Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.skip, self.script, self.stack = [], 0, [], []

    def handle_starttag(self, tag, attrs):
        cls = dict(attrs).get('class') or ''
        if tag in ('style', 'script', 'svg', 'select') or 'svp-path' in cls.split():
            self.skip += 1
            self.stack.append(tag)
        elif self.stack and tag == self.stack[-1]:
            self.stack.append(tag)
        if tag == 'img':
            alt = dict(attrs).get('alt')
            if alt:
                self.parts.append(alt)

    def handle_endtag(self, tag):
        if self.stack and tag == self.stack[-1]:
            self.stack.pop()
            if not self.stack or self.stack[-1] != tag:
                self.skip = max(0, self.skip - 1)
            return
        if tag in ('p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'td', 'tr', 'br', 'section', 'a', 'button', 'summary', 'dt', 'dd'):
            self.parts.append(' · ')
        else:
            self.parts.append(' ')

    def handle_data(self, data):
        if self.skip:
            if self.lasttag == 'script':
                self.script.append(data)
            return
        self.parts.append(data)


def clean(s):
    s = PLACEHOLDER.sub(' ', s)
    s = re.sub(r'\s+', ' ', s)
    s = re.sub(r'(\s*·\s*)+', ' · ', s)
    s = re.sub(r'\s+([.,:;!?»)])', r'\1', s)
    return s.strip(' ·')


def page_text(src):
    p = Text()
    p.feed(src)
    text = ''.join(p.parts)
    # тексты, которые страница рисует скриптом (школы, сезоны): строки с русскими буквами
    extra = []
    for m in STR.finditer('\n'.join(p.script)):
        s = m.group(1) if m.group(1) is not None else m.group(2)
        if s and CYR.search(s) and len(s) > 2:
            s = html.unescape(TAG.sub(' ', s.replace('\\n', ' ').replace("\\'", "'")))
            extra.append(s)
    return clean(text + ' · ' + ' · '.join(extra))


def main():
    out = []
    for name, (url, title) in PAGES.items():
        path = os.path.join(ROOT, 'p', name + '.html')
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8') as f:
            text = page_text(f.read())
        out.append({'u': url, 't': title, 'x': text[:12000]})
    os.makedirs(os.path.join(ROOT, 'data'), exist_ok=True)
    with open(os.path.join(ROOT, 'data', 'search.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    main()
