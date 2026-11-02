/* Bookingbooster form connector for the marketing sites.
   Add one line before </body>:  <script src="https://booking-booster.co.uk/embed/forms.js" defer></script>
   Every form with an email field then also sends its answers to the app's lead inbox. The page's own
   validation and thank-you message keep working exactly as before; we only send once the form is valid. */
(function () {
  var me = document.currentScript, api = (me && me.src ? new URL(me.src).origin : '') + '/api/leads';
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function fields(form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.type === 'password' || el.type === 'file' || el.type === 'submit' || el.type === 'button') return;
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
      out[el.name] = String(el.value || '').slice(0, 2000);
    });
    return out;
  }
  document.addEventListener('submit', function (e) {
    var form = e.target; if (!form || form.tagName !== 'FORM') return;
    var d = fields(form); if (!EMAIL.test(d.email || '')) return;
    var missing = Array.prototype.some.call(form.elements, function (el) { return el.required && !String(el.value || '').trim(); }); if (missing) return;
    // let the page's own handler run first (it may reset the form), then skip if it flagged a problem
    setTimeout(function () {
      if (form.querySelector('.err, [aria-invalid="true"]')) return;
      var parts = location.pathname.replace(/\.html?$/, '').split('/').filter(Boolean), page = parts.slice(-2).join('/') || location.hostname;
      var id = form.getAttribute('data-lead') || form.id || form.getAttribute('name') || '';
      d.form = id.length > 3 ? id : page; // short ids like "f" say nothing in the lead inbox
      d.page = page;
      d.referrer = document.referrer.slice(0, 300);
      var q = new URLSearchParams(location.search); ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) { if (q.get(k)) d[k] = q.get(k); });
      var body = JSON.stringify(d);
      try { fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body, keepalive: true, mode: 'cors' }).catch(function () {}); } catch (_) {}
    }, 0);
  }, true); // capture: read the answers before the page's own handler can reset the form
})();
