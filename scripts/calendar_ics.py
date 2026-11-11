"""Собирает calendar.ics (подписка на календарь клуба) из листа «События» Google-таблицы.
Запускается роботом раз в час (на GitHub .github/workflows/calendar-ics.yml, на GitLab .gitlab-ci.yml). Строки с [ТЕСТ] и без даты пропускаются."""
import csv, hashlib, io, os, re, urllib.parse, urllib.request
from datetime import date, datetime, timedelta, timezone

SHEET_ID = '1VaxvNKg-Qq0lQI24aSWUwkhhvPA80JX0QRKDvnT5jNE'  # та же таблица, что в p/calendar.html
SHEET = 'События'
HOURS = 2  # длительность события, если в таблице только время начала
KEEP_PAST_DAYS = 60
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MSK = timezone(timedelta(hours=3))


def fetch():
    url = ('https://docs.google.com/spreadsheets/d/%s/gviz/tq?tqx=out:csv&headers=1&sheet=%s'
           % (SHEET_ID, urllib.parse.quote(SHEET)))
    with urllib.request.urlopen(url, timeout=30) as r:
        return list(csv.reader(io.StringIO(r.read().decode('utf-8'))))


def parse_day(s):
    s = s.strip()
    m = re.match(r'^(\d{1,2})\.(\d{1,2})\.(\d{4})$', s)
    if m:
        return date(int(m[3]), int(m[2]), int(m[1]))
    m = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})', s)
    if m:
        return date(int(m[1]), int(m[2]), int(m[3]))
    return None


def esc(s):
    return s.replace('\\', '\\\\').replace(';', '\\;').replace(',', '\\,').replace('\n', '\\n')


def fold(line):
    out, b = [], line.encode('utf-8')
    while len(b) > 74:
        cut = 74
        while (b[cut] & 0xC0) == 0x80:
            cut -= 1
        out.append(b[:cut].decode('utf-8'))
        b = b' ' + b[cut:]
    out.append(b.decode('utf-8'))
    return '\r\n'.join(out)


def utc(dt):
    return dt.astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')


def build(rows):
    today = datetime.now(MSK).date()
    lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//svyazkaclub.ru//calendar//RU', 'CALSCALE:GREGORIAN',
             'METHOD:PUBLISH', 'X-WR-CALNAME:Связка: календарь клуба', 'X-WR-TIMEZONE:Europe/Moscow',
             'X-WR-CALDESC:Занятия школ, выезды и клубные события турклуба «Связка». svyazkaclub.ru/calendar/',
             'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H']
    for r in rows[1:]:
        r = r + [''] * (6 - len(r))
        day, when, title, place, tag = parse_day(r[0]), r[1].strip(), r[2].strip(), r[3].strip(), r[4].strip()
        if not day or not title or '[ТЕСТ]' in title.upper() or day < today - timedelta(days=KEEP_PAST_DAYS):
            continue
        uid = hashlib.sha1(('%s|%s' % (day.isoformat(), title)).encode('utf-8')).hexdigest()[:20]
        lines += ['BEGIN:VEVENT', 'UID:%s@svyazkaclub.ru' % uid]
        m = re.search(r'(\d{1,2})[:.](\d{2})', when)
        if m:
            start = datetime(day.year, day.month, day.day, int(m[1]), int(m[2]), tzinfo=MSK)
            m2 = re.search(r'[–-]\s*(\d{1,2})[:.](\d{2})', when)
            end = (datetime(day.year, day.month, day.day, int(m2[1]), int(m2[2]), tzinfo=MSK)
                   if m2 else start + timedelta(hours=HOURS))
            lines += ['DTSTAMP:' + utc(start), 'DTSTART:' + utc(start), 'DTEND:' + utc(end)]
        else:
            lines += ['DTSTAMP:%sT000000Z' % day.strftime('%Y%m%d'),
                      'DTSTART;VALUE=DATE:' + day.strftime('%Y%m%d'),
                      'DTEND;VALUE=DATE:' + (day + timedelta(days=1)).strftime('%Y%m%d')]
        lines.append('SUMMARY:' + esc(title))
        if place:
            lines.append('LOCATION:' + esc(place))
        desc = ' · '.join(x for x in [tag, 'Все события: https://svyazkaclub.ru/calendar/'] if x)
        lines += ['DESCRIPTION:' + esc(desc), 'URL:https://svyazkaclub.ru/calendar/', 'END:VEVENT']
    lines.append('END:VCALENDAR')
    return '\r\n'.join(fold(x) for x in lines) + '\r\n'


def guard(ics):
    """Защита от поломки: если событий вдруг стало намного меньше, чем в прежнем файле
    (переименовали лист или столбцы, удалили строки), прежний calendar.ics не трогаем и
    завершаемся с ошибкой: на GitHub запуск станет красным и придёт письмо.
    Обойти защиту (если событий правда стало мало): запустить с SV_FORCE=1."""
    path = os.path.join(ROOT, 'calendar.ics')
    if os.environ.get('SV_FORCE') == '1' or not os.path.exists(path):
        return
    old = open(path, encoding='utf-8').read().count('BEGIN:VEVENT')
    new = ics.count('BEGIN:VEVENT')
    if (new == 0 and old >= 1) or (new < old / 2 and old - new >= 5):
        raise SystemExit('событий было %d, стало %d: похоже на поломку таблицы, календарь не перезаписываю' % (old, new))


if __name__ == '__main__':
    if os.path.exists(os.path.join(ROOT, 'robots-pause.txt')):
        print('роботы заморожены (robots-pause.txt), календарь не обновляю')
        raise SystemExit(0)
    ics = build(fetch())
    guard(ics)
    with open(os.path.join(ROOT, 'calendar.ics'), 'w', encoding='utf-8', newline='') as f:
        f.write(ics)
