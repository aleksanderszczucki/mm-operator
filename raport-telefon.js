// Raport operatora z telefonu – sama logika, wspólna dla aplikacji w biurze i strony na telefon.
// 1) zamówienie w kodzie QR: dane po „#z=” w adresie (część po # nie trafia do serwera),
// 2) plik raportu z telefonu: { typ:'mm-raport', v:1, numer, operator, data, uwagi, palety:[...] },
// 3) sprawdzenie pliku i zamiana na palety aplikacji (silnik.nowaPaleta).
(function (global) {
  'use strict';

  var MAKS_DANYCH = 900;          // znaków base64url – powyżej tego QR 32 mm robi się trudny do zeskanowania
  var MAKS_Z_NAZWAMI = 400;       // nazwy produktów tylko w małym kodzie (operator ma nazwy i rysunki na kartce)
  var WERSJA = 1;
  var BLAD_QR = 'Kod QR jest uszkodzony – zeskanuj go jeszcze raz albo wypełnij raport na papierze';

  // ---------- base64url z UTF-8 (polskie i fińskie znaki) ----------
  function naBase64url(tekst) {
    var b64;
    if (typeof Buffer !== 'undefined' && typeof window === 'undefined') b64 = Buffer.from(tekst, 'utf8').toString('base64');
    else {
      var bajty = new TextEncoder().encode(tekst), s = '';
      for (var i = 0; i < bajty.length; i++) s += String.fromCharCode(bajty[i]);
      b64 = btoa(s);
    }
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function zBase64url(dane) {
    var b64 = String(dane).replace(/-/g, '+').replace(/_/g, '/');
    if (typeof Buffer !== 'undefined' && typeof window === 'undefined') return Buffer.from(b64, 'base64').toString('utf8');
    var s = atob(b64), bajty = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) bajty[i] = s.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bajty);
  }

  // ---------- 1. Zamówienie w kodzie QR ----------
  function kompakt(zamowienie, zNazwami) {
    return JSON.stringify({
      v: WERSJA, n: zamowienie.numer || '', o: zamowienie.odbiorca || '', d: zamowienie.dataDostawy || '',
      p: (zamowienie.pozycje || []).map(function (p) {
        return [p.kod, Number(p.ilosc) || 0, p.jedn || '', zNazwami ? (p.nazwa || '') : ''];
      })
    });
  }

  // { dane, bezNazw } albo null, gdy zamówienie nie zmieści się w czytelnym kodzie QR
  function kodujZamowienie(zamowienie) {
    var dane = naBase64url(kompakt(zamowienie, true));
    if (dane.length <= MAKS_Z_NAZWAMI) return { dane: dane, bezNazw: false };
    dane = naBase64url(kompakt(zamowienie, false));
    return dane.length <= MAKS_DANYCH ? { dane: dane, bezNazw: true } : null;
  }

  function dekodujZamowienie(dane) {
    var o;
    try { o = JSON.parse(zBase64url(dane)); } catch (e) { throw new Error(BLAD_QR); }
    if (!o || o.v !== WERSJA || typeof o.n !== 'string' || !o.n || !Array.isArray(o.p)) throw new Error(BLAD_QR);
    return {
      numer: o.n, odbiorca: String(o.o || ''), dataDostawy: String(o.d || ''),
      pozycje: o.p.map(function (p) {
        if (!Array.isArray(p) || typeof p[0] !== 'string') throw new Error(BLAD_QR);
        return { kod: p[0], ilosc: Number(p[1]) || 0, jedn: String(p[2] || ''), nazwa: String(p[3] || '') };
      })
    };
  }

  // ---------- 2. Raport z telefonu ----------
  function dzisiaj() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function nowyRaport(zamowienie) {
    return { typ: 'mm-raport', v: WERSJA, numer: zamowienie.numer, operator: '', data: dzisiaj(), uwagi: '', palety: [] };
  }

  // Zamówione minus wpisane na palety (ujemne = za dużo)
  function pozostalo(zamowienie, raport) {
    var wynik = {};
    (zamowienie.pozycje || []).forEach(function (p) { wynik[p.kod] = (wynik[p.kod] || 0) + (Number(p.ilosc) || 0); });
    ((raport && raport.palety) || []).forEach(function (pal) {
      (pal.ladunek || []).forEach(function (l) {
        if (l.kod in wynik) wynik[l.kod] -= (Number(l.opak) || 0) * (Number(l.wOpak) || 0);
      });
    });
    return wynik;
  }

  function liczbaOk(v) { return v !== '' && v !== null && typeof v !== 'boolean' && isFinite(Number(v)) && Number(v) >= 0; }

  // Lista błędów po polsku; pusta = plik można wgrać
  function sprawdzRaport(obiekt, zamowienie) {
    if (!obiekt || typeof obiekt !== 'object' || obiekt.typ !== 'mm-raport' || !Array.isArray(obiekt.palety)) {
      return ['To nie jest plik raportu z telefonu'];
    }
    if (obiekt.v !== WERSJA) return ['Plik raportu jest z innej wersji strony telefonu – zaktualizuj aplikację'];
    if (String(obiekt.numer) !== String(zamowienie.numer)) {
      return ['To raport do zamówienia ' + obiekt.numer + ', a otwarte jest zamówienie ' + zamowienie.numer];
    }
    var kody = {}, bledy = [];
    (zamowienie.pozycje || []).forEach(function (p) { kody[p.kod] = true; });
    obiekt.palety.forEach(function (pal, i) {
      var nr = 'Paleta ' + (i + 1) + ': ';
      if (!pal || !Array.isArray(pal.ladunek)) { bledy.push(nr + 'brak listy towaru'); return; }
      pal.ladunek.forEach(function (l) {
        if (!l || !kody[l.kod]) bledy.push(nr + 'produktu ' + (l && l.kod) + ' nie ma w zamówieniu');
        else if (!liczbaOk(l.opak) || !liczbaOk(l.wOpak)) bledy.push(nr + 'zła ilość przy ' + l.kod);
      });
      if (!liczbaOk(pal.nadstawkiKlienta) || !liczbaOk(pal.nadstawkiDomino)) bledy.push(nr + 'zła liczba nadstawek');
      if (pal.przekladana !== 0 && pal.przekladana !== 1) bledy.push(nr + 'nie wiadomo, czy przekładana ręcznie');
    });
    return bledy;
  }

  // Raport (już sprawdzony) → palety aplikacji
  function naPalety(raport, nowaPaleta, noweId) {
    return raport.palety.map(function (pal, i) {
      var p = nowaPaleta(noweId(i));
      var klienta = Number(pal.nadstawkiKlienta) || 0, domino = Number(pal.nadstawkiDomino) || 0;
      return Object.assign({}, p, {
        nadstawki: klienta + domino, nadstawkiKlienta: klienta, przekladana: pal.przekladana === 1 ? 1 : 0,
        ladunek: pal.ladunek.map(function (l) { return { kod: l.kod, wOpak: Number(l.wOpak), opak: Number(l.opak) }; })
      });
    });
  }

  var api = {
    MAKS_DANYCH: MAKS_DANYCH, MAKS_Z_NAZWAMI: MAKS_Z_NAZWAMI, kodujZamowienie: kodujZamowienie, dekodujZamowienie: dekodujZamowienie,
    nowyRaport: nowyRaport, pozostalo: pozostalo, sprawdzRaport: sprawdzRaport, naPalety: naPalety
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.MMRaport = api;
})(typeof window !== 'undefined' ? window : globalThis);
