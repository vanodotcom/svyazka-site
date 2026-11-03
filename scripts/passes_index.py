"""Собирает список перевалов из каталога westra.ru/passes для подсказок в поиске на /library/passes/.
Пишет data/passes.json. Запускается GitHub Actions раз в сутки (.github/workflows/passes-index.yml).
Берёт только списки перевалов по крупным районам (около 30 страниц, с паузой между запросами)."""
import html, json, re, sys, time, urllib.request

BASE = 'https://westra.ru/passes/'
UA = 'svyazka-passes-index/1.0 (+https://svyazkaclub.ru/library/passes/)'


def get(url):
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read().decode('cp1251', 'replace')
        except Exception as e:  # сеть или сервер: подождать и повторить
            print('ошибка', url, e, file=sys.stderr)
            time.sleep(10 * (attempt + 1))
    raise SystemExit('не удалось скачать ' + url)


def clean(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', s)).replace('\xa0', ' ')).strip()


def main():
    home = get(BASE)
    seg = home[home.find('Выберите район'):]
    seg = seg[:seg.find('</table>')]
    tops = re.findall(r"<a href='/passes/Places/(\d+)' class='reg_top'\s*>([^<]+)</a>", seg)
    if len(tops) < 20:
        raise SystemExit('не нашёл список районов, разметка каталога изменилась?')
    total = re.search(r'Всего в базе\s*(\d+)\s*описани\D+(\d+)\s*перевал', clean(home))

    regions, reg_idx, passes = [], {}, {}

    def region(pid, name):
        if pid not in reg_idx:
            reg_idx[pid] = len(regions)
            regions.append([int(pid), name])
        return reg_idx[pid]

    for top_id, top_name in tops:
        time.sleep(2)
        page = get(BASE + 'Passes/view_passes.php?place=' + top_id)
        cur = region(top_id, html.unescape(top_name).strip())
        top_i = cur
        for row in re.finditer(r'<tr[^>]*id="?(place|pass)(\d+)"?[^>]*>(.*?)</tr>', page, re.S):
            kind, rid, body = row.groups()
            if kind == 'place':
                m = re.search(r'<b>(.*?)</b>', body)
                cur = region(rid, clean(m.group(1))) if m else top_i
                continue
            tds = re.findall(r'<td[^>]*>(.*?)</td>', body, re.S)
            if len(tds) < 3 or rid in passes:
                continue
            name = clean(tds[0])
            h = clean(tds[1])
            cat = clean(tds[2])
            reports = len(re.findall(r"/passes/Reports/\d+", tds[4] if len(tds) > 4 else ''))
            passes[rid] = [int(rid), name, int(h) if h.isdigit() else 0, cat, cur, reports]
        print(top_name, len(passes), file=sys.stderr)

    if len(passes) < 10000:
        raise SystemExit('слишком мало перевалов (%d), не перезаписываю файл' % len(passes))
    out = {
        'total_passes': int(total.group(2)) if total else len(passes),
        'total_reports': int(total.group(1)) if total else 0,
        'regions': regions,          # [id района, название]
        'passes': sorted(passes.values(), key=lambda p: p[1].lower()),  # [id, название, высота, кат., № района, отчётов]
    }
    with open('data/passes.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('перевалов:', len(passes), 'районов:', len(regions), file=sys.stderr)


if __name__ == '__main__':
    main()
