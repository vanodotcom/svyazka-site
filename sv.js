/* «Связка»: загрузчик страниц для Тильды.
   В блоке T123 стоит строка вида
     <div data-sv="schools"></div><script src="https://vanodotcom.gitlab.io/svyazka-site/sv.js"></script>
   (в старых заглушках вместо gitlab.io стоит vanodotcom.github.io — работает так же).
   Скрипт берёт файл p/schools.html из репозитория и вставляет его на место div. */
(function(){
  /* Сайт лежит в двух одинаковых копиях: GitLab Pages и GitHub Pages (с 10 ноября 2026 обе обновляются вместе).
     Страницу запрашиваем сразу с обеих и берём ту, что пришла первой: если один хостинг не открывается
     у посетителя (сбой, блокировка у мобильного оператора), сайт всё равно работает со второго. */
  var BASES = ['https://vanodotcom.gitlab.io/svyazka-site/', 'https://vanodotcom.github.io/svyazka-site/'];
  var MIRROR = 'https://cdn.jsdelivr.net/gh/vanodotcom/svyazka-site@main/'; /* запасной сервер, если не ответили оба (копия с GitHub, обновляется с задержкой до 12 часов) */
  var MAIN = BASES[0]; /* этот адрес записан внутри страниц (фото, данные); меняем его на тот хостинг, который ответил */
  var v = Math.floor(Date.now() / 60000); /* свежая версия не реже раза в минуту */
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
  /* первый успешный ответ из нескольких (как Promise.any, но работает и в старых браузерах) */
  function first(list){
    return new Promise(function(ok, bad){
      var left = list.length;
      list.forEach(function(p){ p.then(ok, function(){ if (--left === 0) bad(); }); });
    });
  }
  function load(box){
    if (box.getAttribute('data-sv-done')) return;
    box.setAttribute('data-sv-done', '1');
    var name = box.getAttribute('data-sv');
    first(BASES.map(function(base){
      return get(base + 'p/' + name + '.html?v=' + v, 8000).then(function(html){ return [base, html]; });
    }))
      .catch(function(){ return get(MIRROR + 'p/' + name + '.html', 10000).then(function(html){ return [MIRROR, html]; }); })
      .then(function(r){
        var html = r[0] === MAIN ? r[1] : r[1].split(MAIN).join(r[0]); /* фото и данные — с того же хостинга */
        run(box, html); document.dispatchEvent(new CustomEvent('sv:loaded', {detail: name}));
      })
      .catch(function(){ box.innerHTML = '<p style="padding:24px 48px;font-family:sans-serif">Не удалось загрузить страницу. Обновите её через минуту.</p>'; });
  }
  function all(){ document.querySelectorAll('[data-sv]').forEach(load); }
  all();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all);
})();
