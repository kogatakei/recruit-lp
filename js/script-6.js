/* index.html 内のインライン <script> #6 を抽出（元ページ: https://recruit-service.crazy.co.jp/） */
/* ===== 3. 外部リンクを別タブで開く ===== */
(function () {
  var apply = function () {
    var host = location.hostname;
    Array.prototype.forEach.call(document.querySelectorAll('a[href^="http"]'), function (a) {
      try {
        if (new URL(a.href).hostname !== host) {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        }
      } catch (e) {}
    });
  };
  var setup = function () {
    apply();
    setTimeout(apply, 2000);  /* STUDIOのリスト描画が遅れた場合の保険 */
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
