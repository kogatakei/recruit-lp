/* index.html 内のインライン <script> #5 を抽出（元ページ: https://recruit-service.crazy.co.jp/） */
/* ===== 1. FVキャッチコピー：一文字ずつ出現＋スクロールフェード（SP最適化・縦書き対応） ===== */
(function () {
  var FADE_START = 0;
  var FADE_END   = 1600;
  var CHAR_DELAY = 0.09;
  var CHAR_DUR   = 0.9;
  var EASE = 'cubic-bezier(0.25, 0.1, 0.25, 1)';
  var IS_SP = matchMedia('(max-width: 767px)').matches;
  var MOVE  = IS_SP ? 0 : 6;                    /* SPは透明度のみ（軽量化） */
  var ALIGN = IS_SP ? 'flex-start' : 'center';  /* SP縦書きは上揃え */
  /* SP縦書きの句読点：X=右方向、Y=マイナスで上、TIGHT=下の余白を詰める量（いずれもem） */
  var PUNCT_X = 0.3;
  var PUNCT_Y = -0.3;
  var PUNCT_TIGHT = 0.45;

  var setup = function () {
    var el = document.getElementById('catch-copy');
    if (!el) return;
    el.style.opacity = 0;
    var p = el.querySelector('p') || el;

    var i = 0;
    var wrapChars = function (node) {
      if (node.nodeType === 3 && node.textContent !== '') {
        var frag = document.createDocumentFragment();
        node.textContent.split('').forEach(function (ch) {
          if (/\s/.test(ch)) { frag.appendChild(document.createTextNode(ch)); return; }
          var isPunct = IS_SP && /[、。]/.test(ch);
          var s = document.createElement('span');
          s.textContent = ch;
          if (isPunct) s.dataset.punct = '1';
          var startX = isPunct ? PUNCT_X : 0;
          var startY = (isPunct ? PUNCT_Y : 0) + (MOVE / 16);
          s.style.cssText =
            'opacity:0;transform:translate3d(' + startX + 'em,' + startY + 'em,0);' +
            (isPunct ? 'margin-bottom:-' + PUNCT_TIGHT + 'em;' : '') +
            'will-change:opacity,transform;backface-visibility:hidden;' +
            'transition:opacity ' + CHAR_DUR + 's ' + EASE + ',transform ' + CHAR_DUR + 's ' + EASE + ';' +
            'transition-delay:' + (i * CHAR_DELAY) + 's';
          frag.appendChild(s);
          i++;
        });
        node.parentNode.replaceChild(frag, node);
      } else if (node.tagName !== 'SPAN') {
        Array.prototype.slice.call(node.childNodes || []).forEach(wrapChars);
      }
    };
    wrapChars(p);

    var lines = [[]];
    Array.prototype.slice.call(p.childNodes).forEach(function (n) {
      if (n.tagName === 'BR') { lines.push([]); }
      else { lines[lines.length - 1].push(n); }
    });
    p.innerHTML = '';
    p.style.flexDirection = 'column';
    p.style.alignItems = ALIGN;
    lines.forEach(function (line) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-direction:row;justify-content:' + ALIGN + ';';
      line.forEach(function (n) { row.appendChild(n); });
      p.appendChild(row);
    });

    el.style.opacity = 1;
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      Array.prototype.forEach.call(p.querySelectorAll('span'), function (s) {
        s.style.opacity = 1;
        s.style.transform = s.dataset.punct
          ? 'translate3d(' + PUNCT_X + 'em,' + PUNCT_Y + 'em,0)'
          : 'translate3d(0,0,0)';
      });
    }); });

    /* タイプ完了後、GPU確保を解放 */
    setTimeout(function () {
      Array.prototype.forEach.call(p.querySelectorAll('span'), function (s) {
        s.style.willChange = 'auto';
      });
    }, (i * CHAR_DELAY + CHAR_DUR) * 1000 + 200);

    /* スクロールフェード（rAF間引き） */
    var ticking = false;
    var update = function () {
      var y = window.scrollY || window.pageYOffset;
      var t = Math.max(0, Math.min(1, (y - FADE_START) / (FADE_END - FADE_START)));
      el.style.opacity = 1 - t;
      ticking = false;
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(setup, 250);
    });
  } else {
    setTimeout(setup, 250);
  }
})();

/* ===== 2. 見出しワイプ発火＋配置ズレ自動補正 ===== */
(function () {
  var setup = function () {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var fixAncestors = function (id) {
      var el = document.querySelector('[id="' + id + '"]');
      if (!el) return;
      var node = el.parentElement;
      for (var d = 0; d < 4 && node && node !== document.body; d++) {
        var r = node.getBoundingClientRect();
        if (r.left < -50) {
          node.style.setProperty('left', '0', 'important');
          node.style.setProperty('margin-left', '0', 'important');
          node.style.setProperty('transform', 'none', 'important');
        }
        node = node.parentElement;
      }
    };
    ['band-1', 'text-1', 'band-2', 'text-2'].forEach(fixAncestors);

    var done = false;
    var check = function () {
      if (done) return;
      var el = document.querySelector('[id="band-1"]') || document.querySelector('[id="text-1"]');
      if (!el) return;
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.88 && r.bottom > 0) {
        done = true;
        ['band-1', 'text-1', 'band-2', 'text-2'].forEach(fixAncestors);
        document.body.classList.add('wipe-on');
        window.removeEventListener('scroll', onScroll);
      }
    };
    var onScroll = function () { requestAnimationFrame(check); };
    window.addEventListener('scroll', onScroll, { passive: true });
    check();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
