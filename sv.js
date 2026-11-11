/* «Связка»: загрузчик страниц для Тильды.
   В блоке T123 стоит строка вида
     <div data-sv="schools"></div><script src="https://vanodotcom.github.io/svyazka-site/sv.js"></script>
   (в шапке и подвале Тильды у этой строки есть запасной вариант: если GitHub не открылся, sv.js берётся с GitLab; см. README).
   Скрипт берёт файл p/schools.html из репозитория и вставляет его на место div. */
(function(){
  /* Сайт лежит в двух одинаковых копиях: основная — GitHub Pages, запасная — GitLab Pages (обе обновляются вместе).
     Страницу запрашиваем сразу с обеих и берём ту, что пришла первой: если один хостинг не открывается
     у посетителя (сбой, блокировка у мобильного оператора), сайт всё равно работает со второго. */
  var BASES = ['https://vanodotcom.github.io/svyazka-site/', 'https://vanodotcom.gitlab.io/svyazka-site/'];
  var MIRROR = 'https://cdn.jsdelivr.net/gh/vanodotcom/svyazka-site@main/'; /* третий запасной, если не ответили оба (копия с GitHub, обновляется с задержкой до 12 часов) */
  var MAIN = BASES[0]; /* адрес GitHub записан внутри страниц (фото, данные); если первым ответил GitLab, меняем его на GitLab */
  var v = Math.floor(Date.now() / 60000); /* свежая версия не реже раза в минуту */
  /* Заранее открываем соединения со шрифтами и Google-таблицей и сразу начинаем качать шрифты,
     не дожидаясь шапки (та подключает те же шрифты, второй раз браузер их не качает). sv.js
     запускается в каждом блоке Тильды, поэтому делаем это один раз. */
  if (!document.getElementById('sv-pre')) {
    var FONTS = 'https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&family=Unbounded:wght@500;600;700&display=swap';
    [['preconnect', 'https://fonts.googleapis.com'], ['preconnect', 'https://fonts.gstatic.com', 1],
     ['preconnect', 'https://docs.google.com', 1], ['stylesheet', FONTS]].forEach(function(x, i){
      var l = document.createElement('link'); l.rel = x[0]; l.href = x[1];
      if (x[2]) l.crossOrigin = 'anonymous';
      if (i === 3) l.id = 'sv-pre';
      document.head.appendChild(l);
    });
  }
  document.documentElement.lang = 'ru'; /* язык страницы для читалок, переводчика и переносов */
  function run(box, html){
    box.innerHTML = html;
    box.querySelectorAll('script').forEach(function(old){
      var s = document.createElement('script');
      for (var i = 0; i < old.attributes.length; i++) s.setAttribute(old.attributes[i].name, old.attributes[i].value);
      s.text = old.text; old.parentNode.replaceChild(s, old);
    });
  }
  /* запрос с ограничением по времени: заблокированный хостинг может «висеть» без ответа */
  function get(url, ms){
    var c = window.AbortController ? new AbortController() : null;
    var t = c ? setTimeout(function(){ c.abort(); }, ms) : 0;
    return fetch(url, c ? {signal: c.signal} : {}).then(function(r){ clearTimeout(t); if (!r.ok) throw r.status; return r.text(); });
  }
  /* Свежая версия страницы. Сначала спрашиваем GitHub; GitLab подключаем, только если GitHub
     не ответил за GAP мс или ответил ошибкой. Так страница не качается дважды, а запасной путь остаётся. */
  var GAP = 1500;
  function fresh(name){
    var url = 'p/' + name + '.html?v=' + v;
    return new Promise(function(ok, bad){
      var left = BASES.length, timer = 0, next = 1, won = false;
      function fail(){ if (--left === 0) bad(); else go(); }
      function go(){
        clearTimeout(timer);
        if (won || next >= BASES.length) return;
        var base = BASES[next++];
        get(base + url, 8000).then(function(html){ won = true; ok([base, html]); }, fail);
        if (next < BASES.length) timer = setTimeout(go, GAP);
      }
      get(BASES[0] + url, 8000).then(function(html){ won = true; clearTimeout(timer); ok([BASES[0], html]); }, fail);
      timer = setTimeout(go, GAP);
    }).catch(function(){ return get(MIRROR + 'p/' + name + '.html', 10000).then(function(html){ return [MIRROR, html]; }); });
  }
  /* Память браузера: последняя скачанная версия каждой страницы лежит в localStorage.
     При следующем заходе её показываем сразу, а свежую качаем в фоне. Если свежая отличается,
     показываем её (шапку не перерисовываем: её скрипты вешают обработчики на всю страницу,
     новая шапка появится со следующего перехода). */
  var KEEP = {header: 1};
  function read(name){ try { var c = JSON.parse(localStorage.getItem('sv:' + name)); return c && c.h ? c : null; } catch (e) { return null; } }
  function save(name, base, html){ try { localStorage.setItem('sv:' + name, JSON.stringify({b: base, h: html})); } catch (e) {} }
  function load(box){
    if (box.getAttribute('data-sv-done')) return;
    box.setAttribute('data-sv-done', '1');
    var name = box.getAttribute('data-sv'), shown = null, cache = read(name);
    function show(base, raw){
      shown = raw;
      var html = base === MAIN ? raw : raw.split(MAIN).join(base); /* фото и данные — с того же хостинга */
      run(box, html); document.dispatchEvent(new CustomEvent('sv:loaded', {detail: name}));
    }
    if (cache) show(cache.b, cache.h); /* сразу, не дожидаясь сети */
    fresh(name).then(function(r){
      save(name, r[0], r[1]);
      if (shown === null || (shown !== r[1] && !KEEP[name])) show(r[0], r[1]);
    }).catch(function(){
      if (shown === null) box.innerHTML = '<p style="padding:24px 48px;font-family:sans-serif">Не удалось загрузить страницу. Обновите её через минуту.</p>';
    });
  }
  function all(){ document.querySelectorAll('[data-sv]').forEach(load); }
  all();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all);
})();
