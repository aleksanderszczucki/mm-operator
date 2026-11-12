// Raport MM – raport operatora na telefonie. Zamówienie przychodzi w adresie z kodu QR (#z=...),
// postęp zapisuje się w telefonie (localStorage), „Wyślij do biura” daje plik .mmraport.json (WhatsApp).
// Strona nie wysyła niczego do żadnego serwera.
(function () {
  'use strict';
  var R = window.MMRaport;
  var app = document.getElementById('app');
  var stan = { zam: null, raport: null };
  var timerInfo = null;

  // ---------- pamięć telefonu (może być niedostępna – wtedy działa bez zapamiętywania) ----------
  function czytaj(klucz) { try { return localStorage.getItem(klucz); } catch (e) { return null; } }
  function pisz(klucz, wartosc) { try { localStorage.setItem(klucz, wartosc); } catch (e) { /* tryb prywatny – trudno */ } }
  function kluczRaportu() { return 'mm-raport:' + stan.zam.numer; }
  function zapisz() {
    pisz(kluczRaportu(), JSON.stringify(stan.raport));
    if (stan.raport.operator) pisz('mm-operator', stan.raport.operator);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function liczba(v) { return v === '' || v == null || isNaN(Number(v)) ? null : Number(v); }
  function format(n) { return Number(n).toLocaleString('pl-PL'); }

  function info(tekst, blad) {
    var el = document.getElementById('info');
    el.textContent = tekst;
    el.className = 'info' + (blad ? ' blad' : '');
    clearTimeout(timerInfo);
    timerInfo = setTimeout(function () { el.className = 'info ukryte'; }, blad ? 9000 : 6000);
  }

  // ---------- start: odczyt zamówienia z adresu ----------
  function ekran(znak, tytul, opis, blad) {
    app.innerHTML = '<section class="ekran' + (blad ? ' blad' : '') + '"><div class="znak" aria-hidden="true">' + znak + '</div>' +
      '<h1>' + esc(tytul) + '</h1><p>' + esc(opis) + '</p></section>';
  }

  function wczytajRaport() {
    var zapisany = null;
    try { zapisany = JSON.parse(czytaj(kluczRaportu()) || 'null'); } catch (e) { zapisany = null; }
    var r = zapisany && zapisany.typ === 'mm-raport' && zapisany.numer === stan.zam.numer && Array.isArray(zapisany.palety)
      ? zapisany : R.nowyRaport(stan.zam);
    if (!r.operator) r.operator = czytaj('mm-operator') || '';
    if (!Array.isArray(r.odhaczone)) r.odhaczone = [];
    return r;
  }

  function start() {
    var m = /#z=([^&]*)/.exec(location.hash);
    if (!m) {
      ekran('QR', 'Zeskanuj kod QR', 'Zeskanuj aparatem telefonu kod QR z kartki operatora (prawy górny róg).');
      return;
    }
    try {
      stan.zam = R.dekodujZamowienie(m[1]);
    } catch (e) {
      ekran('!', 'Nie da się otworzyć zamówienia', e.message, true);
      return;
    }
    stan.raport = wczytajRaport();
    render();
  }

  // ---------- widok ----------
  function zostaloHtml(kod, jedn) {
    var n = R.pozostalo(stan.zam, stan.raport)[kod];
    var klasa = n === 0 ? ' zero' : (n < 0 ? ' za-duzo' : '');
    var tekst = n === 0 ? '✓ 0 ' + jedn : (n < 0 ? 'za dużo ' + format(-n) + ' ' + jedn : 'zostało ' + format(n) + ' ' + jedn);
    return '<span class="zostalo' + klasa + '" data-zostalo="' + esc(kod) + '">' + esc(tekst) + '</span>';
  }

  function produktyHtml() {
    return '<ul class="produkty">' + stan.zam.pozycje.map(function (p) {
      var odh = stan.raport.odhaczone.indexOf(p.kod) >= 0;
      return '<li class="' + (odh ? 'odhaczony' : '') + '"><label><input type="checkbox" data-odhacz="' + esc(p.kod) + '"' +
        (odh ? ' checked' : '') + '><span class="kod">' + esc(p.kod) + '</span>' + zostaloHtml(p.kod, p.jedn) +
        '<span class="nazwa">' + esc(p.nazwa || '') + ' · zamówione ' + format(p.ilosc) + ' ' + esc(p.jedn) + '</span></label></li>';
    }).join('') + '</ul>';
  }

  function ladunekHtml(l, i, j) {
    var opcje = '<option value="">— wybierz produkt —</option>' + stan.zam.pozycje.map(function (p) {
      return '<option value="' + esc(p.kod) + '"' + (p.kod === l.kod ? ' selected' : '') + '>' + esc(p.kod) + (p.nazwa ? ' – ' + esc(p.nazwa) : '') + '</option>';
    }).join('');
    var dane = ' data-p="' + i + '" data-l="' + j + '"';
    var szt = (liczba(l.opak) || 0) * (liczba(l.wOpak) || 0);
    return '<div class="ladunek">' +
      '<select class="wybor" aria-label="Produkt" data-pole="kod"' + dane + '>' + opcje + '</select>' +
      '<label class="pole">Opakowań<input type="number" inputmode="numeric" min="0" aria-label="Opakowań" data-pole="opak"' + dane +
      ' value="' + esc(l.opak == null ? '' : l.opak) + '"></label>' +
      '<label class="pole">Sztuk w opakowaniu<input type="number" inputmode="numeric" min="0" aria-label="Sztuk w opakowaniu" data-pole="wOpak"' + dane +
      ' value="' + esc(l.wOpak == null ? '' : l.wOpak) + '"></label>' +
      '<div class="suma"><span class="szt" data-szt="' + i + '-' + j + '">= ' + format(szt) + ' szt.</span>' +
      '<button class="btn maly" data-akcja="reszta"' + dane + '>Resztę</button>' +
      '<button class="btn maly usun-produkt" aria-label="Usuń produkt" data-akcja="usun-produkt"' + dane + '>✕</button></div></div>';
  }

  function licznikHtml(i, pole, etykieta, opis, wartosc) {
    var dane = ' data-p="' + i + '" data-pole="' + pole + '"';
    return '<div class="licznik"><span class="etykieta">' + etykieta + '<small>' + opis + '</small></span><span class="stepper">' +
      '<button class="btn" aria-label="' + etykieta + ' −" data-akcja="minus"' + dane + '>−</button><output>' + wartosc + '</output>' +
      '<button class="btn" aria-label="' + etykieta + ' +" data-akcja="plus"' + dane + '>+</button></span></div>';
  }

  function paletaHtml(pal, i) {
    var nazwa = 'pak-' + i;
    return '<section class="paleta" data-paleta="' + i + '"><div class="paleta-gora"><b>PALETA ' + (i + 1) + '</b>' +
      '<button class="btn usun" data-akcja="usun-palete" data-p="' + i + '">Usuń paletę</button></div><div class="paleta-srodek">' +
      pal.ladunek.map(function (l, j) { return ladunekHtml(l, i, j); }).join('') +
      '<button class="btn dodaj" data-akcja="dodaj-produkt" data-p="' + i + '">+ Produkt</button>' +
      licznikHtml(i, 'nadstawkiDomino', 'Nadstawka Domino', 'nasze nadstawki', pal.nadstawkiDomino) +
      licznikHtml(i, 'nadstawkiKlienta', 'Nadstawka klienta', 'przyszły z towarem', pal.nadstawkiKlienta) +
      '<div class="pakowanie" role="radiogroup" aria-label="Pakowanie">' +
      '<label><input type="radio" name="' + nazwa + '" value="0" data-pole="przekladana" data-p="' + i + '"' + (pal.przekladana ? '' : ' checked') + '>Oryginalna</label>' +
      '<label><input type="radio" name="' + nazwa + '" value="1" data-pole="przekladana" data-p="' + i + '"' + (pal.przekladana ? ' checked' : '') + '>Ręcznie</label>' +
      '</div></div></section>';
  }

  function podsumowanie() {
    var reszta = R.pozostalo(stan.zam, stan.raport), brak = 0;
    Object.keys(reszta).forEach(function (k) { if (reszta[k] !== 0) brak++; });
    var palet = stan.raport.palety.length;
    return 'Palet: ' + palet + ' · ' + (brak ? 'nierozłożone produkty: ' + brak : 'wszystko rozłożone ✓');
  }

  function render() {
    var z = stan.zam, r = stan.raport;
    app.innerHTML =
      '<section class="zamowienie"><small>ZAMÓWIENIE</small><div class="nr">' + esc(z.numer) + '</div>' +
      '<div class="odb">' + esc(z.odbiorca) + '</div>' + (z.dataDostawy ? '<div class="dost">dostawa ' + esc(z.dataDostawy) + '</div>' : '') + '</section>' +
      '<h2>Produkty</h2>' + produktyHtml() +
      '<h2>Palety</h2>' + r.palety.map(paletaHtml).join('') +
      '<button class="btn dodaj-palete" data-akcja="dodaj-palete">+ Dodaj paletę</button>' +
      '<h2>Operator</h2><div class="dane-operatora">' +
      '<label class="pole">Operator<input type="text" autocomplete="name" aria-label="Operator" data-pole="operator" value="' + esc(r.operator) + '"></label>' +
      '<label class="pole">Uwagi<textarea aria-label="Uwagi" data-pole="uwagi">' + esc(r.uwagi) + '</textarea></label></div>' +
      '<div class="wyslij-pasek"><div class="podsumowanie" id="podsumowanie">' + esc(podsumowanie()) + '</div>' +
      '<button class="btn" data-akcja="wyslij">Wyślij do biura</button></div>';
  }

  // Po wpisaniu liczby odświeżamy tylko liczniki – pełne przerysowanie zabrałoby kursor z następnego pola
  function odswiezLiczniki() {
    stan.zam.pozycje.forEach(function (p) {
      var el = app.querySelector('[data-zostalo="' + CSS.escape(p.kod) + '"]');
      if (el) el.outerHTML = zostaloHtml(p.kod, p.jedn);
    });
    stan.raport.palety.forEach(function (pal, i) {
      pal.ladunek.forEach(function (l, j) {
        var el = app.querySelector('[data-szt="' + i + '-' + j + '"]');
        if (el) el.textContent = '= ' + format((liczba(l.opak) || 0) * (liczba(l.wOpak) || 0)) + ' szt.';
      });
    });
    document.getElementById('podsumowanie').textContent = podsumowanie();
  }

  // ---------- zmiany ----------
  function zmien(fn, przerysuj) {
    fn(stan.raport);
    zapisz();
    if (przerysuj) render(); else odswiezLiczniki();
  }

  function nowaPaleta() { return { ladunek: [{ kod: '', opak: 1, wOpak: null }], nadstawkiKlienta: 0, nadstawkiDomino: 0, przekladana: 0 }; }

  var AKCJE = {
    'dodaj-palete': function () { zmien(function (r) { r.palety.push(nowaPaleta()); }, true); },
    'usun-palete': function (d) {
      if (!window.confirm('Usunąć paletę ' + (Number(d.p) + 1) + '?')) return;
      zmien(function (r) { r.palety.splice(Number(d.p), 1); }, true);
    },
    'dodaj-produkt': function (d) { zmien(function (r) { r.palety[d.p].ladunek.push({ kod: '', opak: 1, wOpak: null }); }, true); },
    'usun-produkt': function (d) { zmien(function (r) { r.palety[d.p].ladunek.splice(Number(d.l), 1); }, true); },
    'reszta': function (d) {
      var l = stan.raport.palety[d.p].ladunek[d.l];
      if (!l.kod) { info('Najpierw wybierz produkt', true); return; }
      var tu = (liczba(l.opak) || 0) * (liczba(l.wOpak) || 0);
      var reszta = R.pozostalo(stan.zam, stan.raport)[l.kod] + tu;
      if (reszta <= 0) { info('Tego produktu nic już nie zostało', true); return; }
      zmien(function () { l.opak = 1; l.wOpak = reszta; }, true);
    },
    'plus': function (d) { zmien(function (r) { r.palety[d.p][d.pole] = (Number(r.palety[d.p][d.pole]) || 0) + 1; }, true); },
    'minus': function (d) { zmien(function (r) { r.palety[d.p][d.pole] = Math.max(0, (Number(r.palety[d.p][d.pole]) || 0) - 1); }, true); },
    'wyslij': wyslij
  };

  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-akcja]');
    if (el && AKCJE[el.dataset.akcja]) AKCJE[el.dataset.akcja](el.dataset);
  });

  app.addEventListener('change', function (e) {
    var el = e.target, d = el.dataset;
    if (d.odhacz) {
      zmien(function (r) {
        r.odhaczone = r.odhaczone.filter(function (k) { return k !== d.odhacz; });
        if (el.checked) r.odhaczone.push(d.odhacz);
      });
      el.closest('li').className = el.checked ? 'odhaczony' : '';
      return;
    }
    if (!d.pole) return;
    if (d.l != null) {
      zmien(function (r) { r.palety[d.p].ladunek[d.l][d.pole] = d.pole === 'kod' ? el.value : liczba(el.value); });
    } else if (d.pole === 'przekladana') {
      zmien(function (r) { r.palety[d.p].przekladana = el.value === '1' ? 1 : 0; });
    } else if (d.pole === 'operator' || d.pole === 'uwagi') {
      zmien(function (r) { r[d.pole] = el.value.trim(); });
    }
  });

  // ---------- wysyłka do biura ----------
  function raportDoWysylki() {
    var r = stan.raport;
    return {
      typ: r.typ, v: r.v, numer: r.numer, operator: r.operator, data: r.data, uwagi: r.uwagi,
      palety: r.palety.map(function (p) {
        return { ladunek: p.ladunek.filter(function (l) { return l.kod; }).map(function (l) { return { kod: l.kod, opak: l.opak, wOpak: l.wOpak }; }),
          nadstawkiKlienta: p.nadstawkiKlienta, nadstawkiDomino: p.nadstawkiDomino, przekladana: p.przekladana };
      })
    };
  }

  function pobierz(plik) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(plik);
    a.download = plik.name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    info('Plik jest w Pobranych – wyślij go na WhatsApp do biura (spinacz → Dokument).');
  }

  function wyslij() {
    var raport = raportDoWysylki();
    if (!raport.palety.length) { info('Dodaj przynajmniej jedną paletę', true); return; }
    var bledy = R.sprawdzRaport(raport, stan.zam);
    if (bledy.length) { info(bledy.join('\n'), true); return; }
    var nazwa = 'raport-' + String(raport.numer).replace(/[^A-Za-z0-9_-]+/g, '_') + '-' + raport.data + '.mmraport.json';
    var plik = new File([JSON.stringify(raport, null, 1)], nazwa, { type: 'application/json' });
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [plik] })) {
      navigator.share({ files: [plik], title: 'Raport ' + raport.numer })
        .then(function () { info('Wysłane. Biuro wgra plik w aplikacji.'); })
        .catch(function (e) { if (!e || e.name !== 'AbortError') pobierz(plik); });
    } else {
      pobierz(plik);
    }
  }

  window.addEventListener('hashchange', start);
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* offline nie zadziała, strona tak */ });
  }
  start();
})();
