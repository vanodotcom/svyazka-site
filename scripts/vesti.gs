/* «Связка»: бот и форма для «Вестей из походов».
   Скрипт живёт в закрытой таблице «Связка: координаторы (закрыто)»: Расширения → Apps Script.
   Вставляется один раз. Всё, что меняется (походы, координаторы, вести), меняется в таблицах, не здесь.

   Что делает:
   - бот @svyazkaclub_vesti_bot принимает вести от координаторов (по личному коду похода);
   - форма «Весть с полей» принимает вести от координаторов без Телеграма;
   - вести пишутся в лист «Вести» публичной таблицы «Связка: календарь», оттуда их берёт сайт;
   - копия каждой вести и всё подозрительное уходит в группу модераторов в Телеграме;
   - журнал всего присланного лежит здесь, в листе «Журнал». */

var PUBLIC_ID = '1VaxvNKg-Qq0lQI24aSWUwkhhvPA80JX0QRKDvnT5jNE'; // «Связка: календарь»
var SITE = 'https://svyazkaclub.ru/hikes/live/';
var TZ = 'Europe/Moscow';
var KEEP_DAYS = 7;       // сколько дней после конца похода код координатора ещё работает
var EDIT_HOURS = 24;     // сколько часов координатор может удалить или исправить свою весть

var TYPES = [
  ['start', 'Стартовали'],
  ['ok', 'На связи, всё хорошо'],
  ['point', 'Прошли точку'],
  ['delay', 'Задержка'],
  ['finish', 'Финишировали'],
  ['help', 'Нужна помощь']
];
var NEUTRAL = 'Группа на связи, ситуация решается. Подробности у координатора.';
var HEALTH = /травм|больниц|госпитал|эвакуац|перелом|ранен|погиб|без сознани|кровотеч|сотрясен|обморож|отёк|отек|вертол[её]т|мчс|спасател|ксс/i;
var PHONE = /(\+?\d[\s\-()]*){10,}/;

/* ---------- таблицы ---------- */

/* Лист координаторов. Старое название «Кураторы» тоже понимаем, пока лист не переименован. */
function coordSheet_() { return priv_().getSheetByName('Координаторы') || priv_().getSheetByName('Кураторы'); }
function priv_() { return SpreadsheetApp.getActive(); }
function pub_() { return SpreadsheetApp.openById(PUBLIC_ID); }
function props_() { return PropertiesService.getScriptProperties(); }
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }
function label_(t) { for (var i = 0; i < TYPES.length; i++) if (TYPES[i][0] === t) return TYPES[i][1]; return t; }
function typeByLabel_(l) { for (var i = 0; i < TYPES.length; i++) if (TYPES[i][1] === l) return TYPES[i][0]; return ''; }
function setting_(name, value) {
  var sh = priv_().getSheetByName('Настройки бота'), v = sh.getDataRange().getValues();
  for (var i = 0; i < v.length; i++) if (v[i][0] === name) {
    if (value === undefined) return String(v[i][1] || '').trim();
    sh.getRange(i + 1, 2).setValue(value); return value;
  }
  if (value === undefined) return '';
  sh.appendRow([name, value]); return value;
}

/* Походы из публичной таблицы: только строки с заполненными «Руководитель» и «Начало». */
function hikes_() {
  var sh = pub_().getSheetByName('Походы'), v = sh.getDataRange().getValues(), h = v[0], out = [];
  function col(name) { for (var i = 0; i < h.length; i++) if (String(h[i]).indexOf(name) === 0) return i; return -1; }
  var c = { ks: col('К.с.'), kind: col('Вид'), area: col('Район'), leader: col('Руководитель'), from: col('Начало'),
            to: col('Конец'), group: col('Группа'), curator: col('Координатор') >= 0 ? col('Координатор') : col('Куратор'), addr: col('Адрес вестей') };
  for (var r = 1; r < v.length; r++) {
    var x = v[r];
    if (!x[c.leader] || !(x[c.from] instanceof Date)) continue;
    out.push({ row: r + 1, col: c, ks: String(x[c.ks]), kind: String(x[c.kind]), area: String(x[c.area]),
      leader: String(x[c.leader]).trim(), from: x[c.from], to: x[c.to] instanceof Date ? x[c.to] : x[c.from],
      group: String(x[c.group] || '').trim(), addr: String(x[c.addr] || '').trim() });
  }
  return out;
}

function gen_(f) {
  var r = [[/(ск|цк)ий$/, '$1ого'], [/(ск|цк)ая$/, '$1ой'], [/(ов|ев|ёв|ин|ын)$/, '$1а'], [/(ов|ев|ёв|ин|ын)а$/, '$1ой'], [/ой$/, 'ого']];
  for (var i = 0; i < r.length; i++) if (r[i][0].test(f)) return f.replace(r[i][0], r[i][1]);
  return f;
}
function groupName_(x) { return x.group || ('Группа ' + gen_(x.leader.split(/\s+/)[0])); }
function translit_(s) {
  var m = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
  return s.toLowerCase().split('').map(function (ch) { return m[ch] !== undefined ? m[ch] : (/[a-z0-9]/.test(ch) ? ch : '-'); }).join('').replace(/-+/g, '-').replace(/^-|-$/g, '');
}
function code_() {
  var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = 'SV-';
  for (var i = 0; i < 6; i++) s += a.charAt(Math.floor(Math.random() * a.length));
  return s;
}

/* Завести походы для вестей: адрес страницы, код координатора, ссылки. Запускается из меню и сама раз в час. */
function syncHikes() {
  var list = hikes_(), psh = pub_().getSheetByName('Походы');
  var csh = coordSheet_(), cur = csh.getDataRange().getValues();
  var used = {}; list.forEach(function (x) { if (x.addr) used[x.addr] = 1; });
  var bot = setting_('Адрес бота') || 'svyazkaclub_vesti_bot';
  list.forEach(function (x) {
    if (!x.addr) {
      var base = translit_(x.leader.split(/\s+/)[0]) + '-' + Utilities.formatDate(x.from, TZ, 'yyyy-MM'), a = base, n = 2;
      while (used[a]) a = base + '-' + (n++);
      used[a] = 1; x.addr = a;
      psh.getRange(x.row, x.col.addr + 1).setValue(a);
    }
    var till = new Date(x.to.getTime() + KEEP_DAYS * 864e5), found = -1;
    for (var i = 1; i < cur.length; i++) if (cur[i][0] === x.addr) found = i;
    if (found < 0) {
      var c = code_();
      csh.appendRow([x.addr, groupName_(x), c, 'https://t.me/' + bot + '?start=' + c, formLink_(c), '', '', '', till, '']);
      cur.push([x.addr]);
    } else {
      csh.getRange(found + 1, 2).setValue(groupName_(x));
      csh.getRange(found + 1, 9).setValue(till);
      if (!cur[found][4] && formLink_(cur[found][2])) csh.getRange(found + 1, 5).setValue(formLink_(cur[found][2]));
    }
  });
}

/* Строка координатора по коду или по Телеграм-id. */
function curators_() {
  var v = coordSheet_().getDataRange().getValues(), out = [], today = new Date();
  for (var i = 1; i < v.length; i++) {
    var r = v[i];
    if (!r[0] || !r[2]) continue;
    out.push({ row: i + 1, addr: r[0], group: r[1], code: String(r[2]).trim().toUpperCase(), ids: String(r[5] || '').split(/[,\s]+/).filter(Boolean),
      active: !(String(r[9]).toLowerCase() === 'да') && (!(r[8] instanceof Date) || r[8] >= today) });
  }
  return out;
}
function byCode_(code) { code = String(code || '').trim().toUpperCase(); return curators_().filter(function (c) { return c.code === code; })[0]; }
function byUser_(id) { id = String(id); return curators_().filter(function (c) { return c.active && c.ids.indexOf(id) > -1; }); }

/* ---------- публикация ---------- */

function journal_(src, author, addr, type, when, text, what) {
  var sh = priv_().getSheetByName('Журнал');
  sh.appendRow([now_(), addr, src, author, label_(type), when, text, what]);
  return sh.getLastRow();
}
function journalSet_(row, what) { priv_().getSheetByName('Журнал').getRange(row, 8).setValue(what); }

function publish_(addr, type, when, text, src) {
  var sh = pub_().getSheetByName('Вести'), n = Number(props_().getProperty('N') || 0) + 1;
  props_().setProperty('N', String(n));
  sh.appendRow([when, addr, label_(type), text, 'да', now_(), src, String(n)]);
  return { row: sh.getLastRow(), n: n };
}
/* Найти весть по её номеру (столбец H) и показать или скрыть. Номер не меняется, даже если строки переставят. */
function rowByN_(n) {
  var v = pub_().getSheetByName('Вести').getRange('H:H').getValues();
  for (var i = v.length - 1; i > 0; i--) if (String(v[i][0]) === String(n)) return i + 1;
  return 0;
}
function showN_(n, yes) { var r = rowByN_(n); if (r) pub_().getSheetByName('Вести').getRange(r, 5).setValue(yes ? 'да' : 'нет'); return r; }
function flags_(text) {
  var f = [];
  if (PHONE.test(text)) f.push('похоже на номер телефона');
  if (HEALTH.test(text)) f.push('похоже на подробности о здоровье или ЧП');
  return f;
}
function groupOf_(addr) { var c = curators_().filter(function (x) { return x.addr === addr; })[0]; return c ? c.group : addr; }

/* Обычная весть: на сайт + копия модераторам с кнопкой «Скрыть». */
function postNow_(addr, type, when, text, src, author) {
  var p = publish_(addr, type, when, text, src);
  journal_(src, author, addr, type, when, text, 'опубликовано, №' + p.n);
  mod_('✅ ' + groupOf_(addr) + ' · ' + label_(type) + ' · ' + when.slice(11) + '\n' + text + '\n\nот: ' + author,
    [[{ text: 'Скрыть с сайта', callback_data: 'h:' + p.n }]]);
  return p;
}
/* Подозрительная весть или «Нужна помощь»: ждёт модератора. */
function hold_(addr, type, when, text, src, author, why) {
  var j = journal_(src, author, addr, type, when, text, 'ждёт модератора: ' + why);
  var kb = type === 'help'
    ? [[{ text: 'Опубликовать нейтрально', callback_data: 'mn:' + j }], [{ text: 'Не публиковать', callback_data: 'mx:' + j }]]
    : [[{ text: 'Опубликовать как есть', callback_data: 'mp:' + j }], [{ text: 'Опубликовать нейтрально', callback_data: 'mn:' + j }], [{ text: 'Не публиковать', callback_data: 'mx:' + j }]];
  mod_((type === 'help' ? '⚠️ НУЖНА ПОМОЩЬ\n' : '✋ Ждёт решения (' + why + ')\n') + groupOf_(addr) + ' · ' + label_(type) + ' · ' + when + '\n' + text + '\n\nот: ' + author, kb);
}

/* ---------- Телеграм ---------- */

function tg_(method, data) {
  var token = props_().getProperty('TOKEN');
  if (!token) throw new Error('Нет токена бота: меню «Вести» → «1. Ввести токен бота»');
  var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method,
    { method: 'post', contentType: 'application/json', payload: JSON.stringify(data), muteHttpExceptions: true });
  return JSON.parse(r.getContentText());
}
function say_(chat, text, kb) {
  var d = { chat_id: chat, text: text, disable_web_page_preview: true };
  if (kb) d.reply_markup = { inline_keyboard: kb };
  return tg_('sendMessage', d);
}
function mod_(text, kb) { var m = props_().getProperty('MOD_CHAT'); if (m) say_(m, text, kb); }
function state_(id, s) {
  var c = CacheService.getScriptCache(), k = 'st' + id;
  if (s === undefined) { var v = c.get(k); return v ? JSON.parse(v) : {}; }
  if (s === null) c.remove(k); else c.put(k, JSON.stringify(s), 21600);
}
function typeKb_() {
  return [[{ text: 'На связи, всё хорошо', callback_data: 't:ok' }], [{ text: 'Прошли точку', callback_data: 't:point' }, { text: 'Задержка', callback_data: 't:delay' }],
    [{ text: 'Стартовали', callback_data: 't:start' }, { text: 'Финишировали', callback_data: 't:finish' }], [{ text: '⚠️ Нужна помощь', callback_data: 't:help' }]];
}
function whenKb_() {
  return [[{ text: 'Только что', callback_data: 'w:now' }], [{ text: 'Сегодня, раньше', callback_data: 'w:today' }, { text: 'Вчера', callback_data: 'w:yday' }]];
}
function preview_(chat, s) {
  say_(chat, 'Так будет на сайте:\n\n' + s.group + ' · ' + label_(s.type) + '\n' + s.when + '\n' + s.text,
    [[{ text: 'Опубликовать', callback_data: 'p:yes' }], [{ text: 'Исправить текст', callback_data: 'p:edit' }, { text: 'Отмена', callback_data: 'p:no' }]]);
}

/* Телеграм присылает сюда все сообщения боту. */
function doPost(e) {
  try {
    if (!e || !e.parameter || e.parameter.k !== props_().getProperty('SECRET')) return;
    var u = JSON.parse(e.postData.contents), cache = CacheService.getScriptCache();
    if (cache.get('u' + u.update_id)) return; // повтор того же сообщения
    cache.put('u' + u.update_id, '1', 21600);
    if (u.callback_query) onButton_(u.callback_query); else if (u.message) onMessage_(u.message);
  } catch (err) {
    console.error(err);
  }
}

function who_(from) { return [from.first_name, from.last_name].filter(Boolean).join(' ') + (from.username ? ' @' + from.username : '') + ' (id ' + from.id + ')'; }

function onMessage_(m) {
  var chat = m.chat.id, id = m.from.id, text = (m.text || m.caption || '').trim();
  /* группа модераторов */
  if (m.chat.type !== 'private') {
    if (/^\/moderatory/.test(text)) {
      if (props_().getProperty('MOD_CHAT') && props_().getProperty('MOD_CHAT') !== String(chat)) return say_(chat, 'Группа модераторов уже назначена. Сменить её можно в меню таблицы.');
      props_().setProperty('MOD_CHAT', String(chat)); setting_('Группа модераторов', m.chat.title + ' (' + chat + ')');
      return say_(chat, 'Готово: сюда будут приходить копии всех вестей и всё, что ждёт решения. Модераторы — все участники этой группы.');
    }
    return;
  }
  /* подключение по коду: /start SV-XXXXXX */
  var st = text.match(/^\/start\s+(\S+)/);
  if (st) {
    var c = byCode_(st[1]);
    if (!c || !c.active) return say_(chat, 'Код не подошёл или срок его действия закончился. Напишите модератору вестей клуба.');
    if (c.ids.indexOf(String(id)) < 0) {
      var sh = coordSheet_();
      sh.getRange(c.row, 6).setValue(c.ids.concat(String(id)).join(', '));
      sh.getRange(c.row, 7).setValue(who_(m.from));
      sh.getRange(c.row, 8).setValue(now_());
      mod_('🔗 Подключился координатор: ' + c.group + '\n' + who_(m.from));
    }
    return say_(chat, 'Вы координатор: ' + c.group + '.\n\nКогда группа выйдет на связь, просто напишите сюда, что она передала (или перешлите сообщение). Я спрошу тип вести и покажу, как она будет выглядеть на сайте.\n\n' +
      'Не пишите фамилии участников, телефоны и подробности о здоровье. Плохие новости сначала лично родственникам, а сюда «Нужна помощь»: такую весть увидят только модераторы.\n\n' +
      '/delete — убрать последнюю весть\n/edit — исправить последнюю весть\n\nСтраница вестей: ' + SITE + '?h=' + c.addr);
  }
  var mine = byUser_(id);
  if (!mine.length) return say_(chat, 'Это бот координаторов турклуба «Связка». Вести с полей читайте здесь: ' + SITE);
  if (/^\/start/.test(text)) return say_(chat, 'Вы координатор: ' + mine.map(function (x) { return x.group; }).join(', ') + '. Пишите сюда вести.');
  if (/^\/(delete|edit)/.test(text)) return lastOwn_(chat, id, /^\/edit/.test(text));
  if (/^\/cancel/.test(text)) { state_(id, null); return say_(chat, 'Отменено.'); }
  if (!text) return say_(chat, 'Пока я принимаю только текст. Опишите словами, что передала группа.');

  var s = state_(id);
  if (s.step === 'time') { /* ждём время «14:30» */
    var t = text.match(/^(\d{1,2})[:.\s](\d{2})$/);
    if (!t) return say_(chat, 'Напишите время в виде 14:30.');
    s.when = Utilities.formatDate(new Date(Date.now() - (s.day === 'yday' ? 864e5 : 0)), TZ, 'yyyy-MM-dd') + ' ' + ('0' + t[1]).slice(-2) + ':' + t[2];
    s.step = 'confirm'; state_(id, s); return preview_(chat, s);
  }
  if (s.step === 'fix') { s.text = text; s.step = 'confirm'; state_(id, s); return preview_(chat, s); }
  if (s.step === 'editlast') {
    var er = rowByN_(s.n);
    if (er) pub_().getSheetByName('Вести').getRange(er, 4).setValue(text);
    journal_('бот', who_(m.from), s.addr, '', '', text, 'исправлено, весть №' + s.n); state_(id, null);
    mod_('✏️ Исправлено: ' + groupOf_(s.addr) + '\n' + text, [[{ text: 'Скрыть с сайта', callback_data: 'h:' + s.n }]]);
    return say_(chat, 'Исправил, на сайте через пару минут.');
  }
  s = { text: text, step: 'type' };
  if (mine.length > 1) {
    s.step = 'hike'; state_(id, s);
    return say_(chat, 'Какой поход?', mine.map(function (x) { return [{ text: x.group, callback_data: 'g:' + x.addr }]; }));
  }
  s.addr = mine[0].addr; s.group = mine[0].group; state_(id, s);
  say_(chat, 'Тип вести?', typeKb_());
}

function lastOwn_(chat, id, edit) {
  var who = '(id ' + id + ')', v = priv_().getSheetByName('Журнал').getDataRange().getValues();
  for (var i = v.length - 1; i > 0; i--) {
    var m = String(v[i][7]).match(/опубликовано, №(\d+)/);
    if (String(v[i][3]).indexOf(who) > -1 && m) {
      var t0 = v[i][0] instanceof Date ? v[i][0] : Utilities.parseDate(String(v[i][0]), TZ, 'yyyy-MM-dd HH:mm'), age = (new Date() - t0) / 36e5;
      if (age > EDIT_HOURS) return say_(chat, 'Последняя весть старше суток, её может поправить только модератор.');
      if (!rowByN_(m[1])) break;
      if (edit) { state_(id, { step: 'editlast', n: m[1], addr: v[i][1] }); return say_(chat, 'Сейчас там:\n' + v[i][6] + '\n\nПришлите новый текст целиком (или /cancel).'); }
      showN_(m[1], false); journalSet_(i + 1, v[i][7] + '; удалено координатором');
      mod_('🗑 Координатор убрал весть: ' + groupOf_(v[i][1]) + '\n' + v[i][6]);
      return say_(chat, 'Убрал с сайта.');
    }
  }
  say_(chat, 'Не нашёл вашей вести, которую можно изменить.');
}

function onButton_(q) {
  var d = q.data, chat = q.message.chat.id, id = q.from.id;
  tg_('answerCallbackQuery', { callback_query_id: q.id });
  /* кнопки модераторов (в группе модераторов) */
  if (/^(h|sh|mp|mn|mx):/.test(d)) {
    if (String(chat) !== props_().getProperty('MOD_CHAT')) return;
    var k = d.split(':')[0], n = Number(d.split(':')[1]), by = q.from.first_name + (q.from.username ? ' @' + q.from.username : '');
    var edit = function (t, kb) { tg_('editMessageText', { chat_id: chat, message_id: q.message.message_id, text: q.message.text + '\n\n' + t, reply_markup: { inline_keyboard: kb || [] } }); };
    if (k === 'h') { showN_(n, false); return edit('🙈 Скрыто с сайта (' + by + ')', [[{ text: 'Вернуть на сайт', callback_data: 'sh:' + n }]]); }
    if (k === 'sh') { showN_(n, true); return edit('👁 Возвращено на сайт (' + by + ')', [[{ text: 'Скрыть с сайта', callback_data: 'h:' + n }]]); }
    var j = priv_().getSheetByName('Журнал').getRange(n, 1, 1, 8).getValues()[0];
    if (String(j[7]).indexOf('ждёт модератора') !== 0) return edit('Уже решено: ' + j[7]);
    if (k === 'mx') { journalSet_(n, 'не публиковать (' + by + ')'); return edit('🚫 Не публикуем (' + by + ')'); }
    var type = typeByLabel_(j[4]) || 'ok', text = k === 'mn' ? NEUTRAL : j[6];
    if (type === 'help') type = 'delay';
    var p = publish_(j[1], type, String(j[5]), text, String(j[2]));
    journalSet_(n, 'опубликовано' + (k === 'mn' ? ' нейтрально' : '') + ' (' + by + '), №' + p.n);
    return edit('✅ Опубликовано' + (k === 'mn' ? ': «' + NEUTRAL + '»' : '') + ' (' + by + ')', [[{ text: 'Скрыть с сайта', callback_data: 'h:' + p.n }]]);
  }
  /* кнопки координатора */
  var s = state_(id), done = function (t) { tg_('editMessageText', { chat_id: chat, message_id: q.message.message_id, text: t }); };
  if (!s.step) return done('Это сообщение устарело. Пришлите текст вести заново.');
  var mine = byUser_(id);
  if (d.indexOf('g:') === 0) {
    var g = mine.filter(function (x) { return x.addr === d.slice(2); })[0];
    if (!g) return done('Этот поход вам больше не доступен.');
    s.addr = g.addr; s.group = g.group; s.step = 'type'; state_(id, s);
    done('Поход: ' + g.group); return say_(chat, 'Тип вести?', typeKb_());
  }
  if (d.indexOf('t:') === 0) {
    s.type = d.slice(2); s.step = 'when'; state_(id, s);
    done('Тип: ' + label_(s.type)); return say_(chat, 'Когда группа вышла на связь?', whenKb_());
  }
  if (d.indexOf('w:') === 0) {
    var w = d.slice(2);
    if (w === 'now') { s.when = now_(); s.step = 'confirm'; state_(id, s); done('Когда: только что'); return preview_(chat, s); }
    s.day = w; s.step = 'time'; state_(id, s); done('Когда: ' + (w === 'yday' ? 'вчера' : 'сегодня'));
    return say_(chat, 'Во сколько? Напишите время, например 14:30.');
  }
  if (d === 'p:edit') { s.step = 'fix'; state_(id, s); done('Исправляем.'); return say_(chat, 'Пришлите текст целиком заново.'); }
  if (d === 'p:no') { state_(id, null); return done('Отменено, ничего не опубликовано.'); }
  if (d === 'p:yes' || d === 'p:mod') {
    if (!mine.some(function (x) { return x.addr === s.addr; })) { state_(id, null); return done('Этот поход вам больше не доступен.'); }
    var f = flags_(s.text);
    if (s.type === 'help') { hold_(s.addr, s.type, s.when, s.text, 'бот', who_(q.from), 'нужна помощь'); state_(id, null); return done('Передал модераторам. На сайт эта весть сама не попадёт. Если нужна помощь, звоните в КСС/МЧС.'); }
    if (f.length && d === 'p:yes') {
      return say_(chat, 'В тексте ' + f.join(' и ') + '. На сайте такое не публикуем. Что делаем?',
        [[{ text: 'Переписать', callback_data: 'p:edit' }], [{ text: 'Отправить модератору', callback_data: 'p:mod' }]]);
    }
    if (d === 'p:mod') { hold_(s.addr, s.type, s.when, s.text, 'бот', who_(q.from), f.join(', ') || 'по просьбе координатора'); state_(id, null); return done('Отправил модератору. Он решит, публиковать ли.'); }
    postNow_(s.addr, s.type, s.when, s.text, 'бот', who_(q.from)); state_(id, null);
    return done('Опубликовано, на сайте через пару минут.\n' + SITE + '?h=' + s.addr + '\n\n/delete — убрать, /edit — исправить');
  }
}

/* ---------- форма ---------- */

function formLink_(code) {
  var url = props_().getProperty('FORM_PREFILL');
  return url ? url.replace('КОД', encodeURIComponent(code)) : '';
}

function createForm() {
  if (props_().getProperty('FORM_ID')) return SpreadsheetApp.getUi().alert('Форма уже есть: ' + props_().getProperty('FORM_URL'));
  var f = FormApp.create('Весть с полей')
    .setDescription('Для координаторов турклуба «Связка». Пользуйтесь своей личной ссылкой: код уже вписан.\nНе пишите фамилии участников, телефоны и подробности о здоровье.')
    .setCollectEmail(false).setAllowResponseEdits(false).setLimitOneResponsePerUser(false);
  var code = f.addTextItem().setTitle('Код координатора').setHelpText('Из вашей личной ссылки, вида SV-XXXXXX').setRequired(true);
  f.addMultipleChoiceItem().setTitle('Тип вести').setChoiceValues(TYPES.map(function (t) { return t[1]; })).setRequired(true);
  f.addDateTimeItem().setTitle('Когда группа вышла на связь').setRequired(true);
  f.addParagraphTextItem().setTitle('Текст вести').setRequired(true);
  f.addCheckboxItem().setTitle('Проверка').setChoiceValues(['В тексте нет фамилий участников, телефонов и подробностей о здоровье']).setRequired(true);
  f.setDestination(FormApp.DestinationType.SPREADSHEET, priv_().getId());
  var pre = f.createResponse().withItemResponse(code.createResponse('КОД')).toPrefilledUrl();
  props_().setProperties({ FORM_ID: f.getId(), FORM_URL: f.getPublishedUrl(), FORM_PREFILL: pre });
  setting_('Форма (для координаторов)', f.getPublishedUrl());
  setting_('Форма (редактировать)', f.getEditUrl());
  ScriptApp.newTrigger('onForm').forSpreadsheet(priv_()).onFormSubmit().create();
  syncHikes();
  SpreadsheetApp.getUi().alert('Форма создана. Личные ссылки на неё появились в листе «Координаторы».');
}

/* Код из формы. В старой форме вопрос назывался «Код куратора», понимаем оба. */
function code_f_(get) { return get('Код координатора') || get('Код куратора'); }

function onForm(e) {
  var nv = e.namedValues, get = function (k) { return String((nv[k] || [''])[0]).trim(); };
  var c = byCode_(code_f_(get)), type = typeByLabel_(get('Тип вести')) || 'ok', text = get('Текст вести');
  var whenRaw = get('Когда группа вышла на связь'), when = now_();
  var m = whenRaw.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\D+(\d{1,2}):(\d{2})/);
  if (m) when = m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) + ' ' + ('0' + m[4]).slice(-2) + ':' + m[5];
  else if (!isNaN(new Date(whenRaw))) when = Utilities.formatDate(new Date(whenRaw), TZ, 'yyyy-MM-dd HH:mm');
  if (!c || !c.active) {
    journal_('форма', 'код ' + code_f_(get), '', type, when, text, 'не опубликовано: неверный или просроченный код');
    return mod_('❓ Форма: весть с неверным кодом «' + code_f_(get) + '», не опубликована.\n' + text);
  }
  var f = flags_(text);
  if (type === 'help' || f.length) return hold_(c.addr, type, when, text, 'форма', 'форма, код ' + c.code, type === 'help' ? 'нужна помощь' : f.join(', '));
  postNow_(c.addr, type, when, text, 'форма', 'форма, код ' + c.code);
}

/* Переименование 9 ноября 2026: в уже созданной форме «куратор» меняем на «координатор».
   Личные ссылки на форму не ломаются: они привязаны к номеру вопроса, а не к его названию. */
function renameForm() {
  var ui = SpreadsheetApp.getUi(), url = setting_('Форма (редактировать)');
  if (!url) return ui.alert('Не нашёл ссылку на форму в листе «Настройки бота».');
  var f = FormApp.openByUrl(url);
  f.setDescription('Для координаторов турклуба «Связка». Пользуйтесь своей личной ссылкой: код уже вписан.\nНе пишите фамилии участников, телефоны и подробности о здоровье.');
  f.getItems().forEach(function (it) { if (/куратор/i.test(it.getTitle())) it.setTitle(it.getTitle().replace(/куратор/g, 'координатор').replace(/Куратор/g, 'Координатор')); });
  ui.alert('Готово: в форме теперь «координатор».');
}

/* ---------- настройка (меню в таблице) ---------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Вести')
    .addItem('1. Ввести токен бота', 'setToken')
    .addItem('2. Подключить бота', 'connectBot')
    .addItem('3. Создать форму для координаторов', 'createForm')
    .addSeparator()
    .addItem('Обновить походы и ссылки координаторов', 'syncHikes')
    .addItem('Сменить группу модераторов', 'resetMods')
    .addItem('Обновить тексты формы', 'renameForm')
    .addItem('Проверить, всё ли работает', 'check')
    .addToUi();
}

function setToken() {
  var ui = SpreadsheetApp.getUi(), r = ui.prompt('Токен бота', 'Вставьте токен, который выдал @BotFather (длинная строка с двоеточием).', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  props_().setProperty('TOKEN', r.getResponseText().trim());
  var me = tg_('getMe', {});
  if (!me.ok) return ui.alert('Телеграм не принял токен. Проверьте, что скопировали его целиком.');
  setting_('Адрес бота', me.result.username);
  ui.alert('Токен принят, бот: @' + me.result.username + '. Теперь шаг 2.');
}

function connectBot() {
  /* Адрес веб-приложения владелец вставляет сам: ScriptApp.getService().getUrl() часто отдаёт
     адрес черновика, а не развёртывания, и Телеграм получает «404 Not Found». */
  var ui = SpreadsheetApp.getUi();
  var a = ui.prompt('Адрес веб-приложения', 'В редакторе скрипта: «Развернуть» → «Управление развёртываниями» → скопируйте «URL» веб-приложения (заканчивается на /exec) и вставьте сюда.', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  var url = a.getResponseText().trim().replace(/\?.*$/, '');
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) return ui.alert('Это не тот адрес. Нужен URL веб-приложения, он начинается с https://script.google.com/ и заканчивается на /exec.');
  var secret = props_().getProperty('SECRET') || Utilities.getUuid().replace(/-/g, '');
  props_().setProperty('SECRET', secret);
  var r = tg_('setWebhook', { url: url + '?k=' + secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
  if (!r.ok) return ui.alert('Не получилось: ' + r.description);
  tg_('setMyCommands', { commands: [{ command: 'delete', description: 'убрать последнюю весть' }, { command: 'edit', description: 'исправить последнюю весть' }, { command: 'cancel', description: 'отменить' }] });
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'syncHikes') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncHikes').timeBased().everyHours(1).create();
  syncHikes();
  ui.alert('Бот подключён. Добавьте @' + setting_('Адрес бота') + ' в группу модераторов и напишите там /moderatory');
}

function resetMods() { props_().deleteProperty('MOD_CHAT'); setting_('Группа модераторов', ''); SpreadsheetApp.getUi().alert('Готово. Напишите /moderatory в новой группе модераторов.'); }

function check() {
  var p = props_(), out = [];
  out.push('Токен: ' + (p.getProperty('TOKEN') ? 'есть' : 'НЕТ, шаг 1'));
  if (p.getProperty('TOKEN')) { var w = tg_('getWebhookInfo', {}).result || {}; out.push('Бот подключён: ' + (w.url ? 'да' : 'НЕТ, шаг 2') + (w.last_error_message ? ' (последняя ошибка: ' + w.last_error_message + ')' : '')); }
  out.push('Группа модераторов: ' + (p.getProperty('MOD_CHAT') ? setting_('Группа модераторов') : 'НЕТ, напишите /moderatory в группе'));
  out.push('Форма: ' + (p.getProperty('FORM_URL') || 'НЕТ, шаг 3'));
  out.push('Походов для вестей: ' + hikes_().length);
  SpreadsheetApp.getUi().alert(out.join('\n'));
}
