/* index.html 内のインライン <script> #4 を抽出（元ページ: https://recruit-service.crazy.co.jp/） */
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){materialSymbolsLoader();sdImg();},{once:true})}else{materialSymbolsLoader();sdImg();}
function initModules() {
    try{modal();}catch(e){console.error(e);}try{appear();}catch(e){console.error(e);}/* sendAnalytics("brqEeXMmq4") はSTUDIO計測のため除去（Vercel移行） */
}
if (document.readyState === 'complete') {
  initModules();
} else {
  window.addEventListener('load', initModules, { once: true });
}
