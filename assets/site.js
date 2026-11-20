/* Light/dark toggle. With no saved choice the site follows the system setting. */
(function () {
  var root = document.documentElement;
  var btn = document.getElementById('theme-toggle');
  if (!btn) return;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function current() {
    var forced = root.getAttribute('data-theme');
    if (forced === 'dark' || forced === 'light') return forced;
    return mq && mq.matches ? 'dark' : 'light';
  }
  function label() {
    btn.textContent = current() === 'dark' ? 'Light mode' : 'Dark mode';
  }

  btn.addEventListener('click', function () {
    var next = current() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    label();
  });

  if (mq && mq.addEventListener) {
    mq.addEventListener('change', function () { label(); });
  }
  label();
})();
