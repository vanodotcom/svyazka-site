"""Заморозка роботов для запасной копии на GitLab (вызывается из .gitlab-ci.yml перед роботами).

Кнопка «Откатить данные роботов» на GitHub (.github/workflows/rollback.yml) кладёт в основной репозиторий
файл robots-pause.txt и откачивает данные. Репозиторий GitLab об этом не знает, поэтому здесь мы смотрим
на GitHub: если там заморожено, скачиваем оттуда откаченные файлы и роботов на GitLab не запускаем.
Код выхода 0 — заморожено (роботов не запускать), 1 — работаем как обычно.
Если GitHub не отвечает (например, снова заблокирован), считаем, что не заморожено."""
import json, os, sys, urllib.error, urllib.request

RAW = 'https://raw.githubusercontent.com/vanodotcom/svyazka-site/main/'
FILES = ['news.json', 'calendar.ics', 'data/search.json', 'data/passes.json']


def get(path):
    with urllib.request.urlopen(RAW + path, timeout=20) as r:
        return r.read()


def main():
    if os.path.exists('robots-pause.txt'):  # заморозка прямо в репозитории GitLab
        print('роботы заморожены в этом репозитории')
        return 0
    try:
        note = get('robots-pause.txt')
    except urllib.error.HTTPError as e:  # 404 — файла нет, значит не заморожено
        if e.code != 404:
            print('GitHub ответил ошибкой', e.code, '— работаем как обычно')
        return 1
    except Exception as e:
        print('GitHub не отвечает, работаем как обычно:', e)
        return 1
    print('роботы заморожены на GitHub:', note.decode('utf-8', 'replace').strip())
    for f in FILES:
        try:
            data = get(f)
        except Exception as e:
            print('не скачал', f, e)
            continue
        os.makedirs(os.path.dirname(f) or '.', exist_ok=True)
        open(f, 'wb').write(data)
    # картинки новостей, на которые ссылается откаченный news.json
    try:
        for post in json.load(open('news.json', encoding='utf-8')):
            p = post.get('photo') or ''
            if p.startswith('img/news/') and not os.path.exists(p):
                os.makedirs('img/news', exist_ok=True)
                open(p, 'wb').write(get(p))
    except Exception as e:
        print('картинки новостей не скачались:', e)
    return 0


if __name__ == '__main__':
    sys.exit(main())
