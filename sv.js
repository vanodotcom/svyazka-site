/* «Связка»: загрузчик страниц для Тильды.
   В блоке T123 стоит строка вида
     <div data-sv="schools"></div><script src="https://vanodotcom.gitlab.io/svyazka-site/sv.js"></script>
   Скрипт берёт файл p/schools.html из этого репозитория и вставляет его на место div. */
(function(){
  var BASE = 'https://vanodotcom.gitlab.io/svyazka-site/';
  var MIRROR = 'https://cdn.jsdelivr.net/gh/vanodotcom/svyazka-site@main/'; /* запасной сервер: старая копия на GitHub (работает, только если GitHub-аккаунт доступен) */
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
  function load(box){
    if (box.getAttribute('data-sv-done')) return;
    box.setAttribute('data-sv-done', '1');
    var name = box.getAttribute('data-sv');
    /* Сначала GitLab Pages (основной хостинг с 8 ноября 2026); если он не ответил (обновление сайта, сбой, блокировка),
       берём тот же файл из репозитория через запасной сервер jsDelivr. */
    function get(url){ return fetch(url).then(function(r){ if (!r.ok) throw r.status; return r.text(); }); }
    get(BASE + 'p/' + name + '.html?v=' + v)
      .catch(function(){ return get(MIRROR + 'p/' + name + '.html'); })
      .then(function(html){ run(box, html); document.dispatchEvent(new CustomEvent('sv:loaded', {detail: name})); })
      .catch(function(){ box.innerHTML = '<p style="padding:24px 48px;font-family:sans-serif">Не удалось загрузить страницу. Обновите её через минуту.</p>'; });
  }
  function all(){ document.querySelectorAll('[data-sv]').forEach(load); }
  all();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all);
})();
