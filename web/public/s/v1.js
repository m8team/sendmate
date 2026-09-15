/*! sendm8 v1 · AJAX for <form data-sendm8> · https://sendm8.com/docs#ajax-helper · AGPL-3.0 */
(function (w, d) {
  'use strict';
  // Without fetch or FormData the form simply posts the old-fashioned way.
  if (!w.fetch || !w.FormData || !d.addEventListener) return;

  var ATTR = 'data-sendm8';
  var DEFAULT_SUCCESS = 'Thanks! Message sent.';
  var DEFAULT_ERROR = 'Something went wrong. Please try again.';
  var NETWORK_ERROR = 'Couldn’t send your message. Check your connection and try again.';

  /** True for http(s) URLs whose path is /f/<something>. */
  function isEndpoint(action) {
    if (!action) return false;
    var a = d.createElement('a');
    a.href = action;
    var path = a.pathname.charAt(0) === '/' ? a.pathname : '/' + a.pathname;
    return /^https?:$/.test(a.protocol) && /^\/f\/[^/]+\/?$/.test(path);
  }

  function emit(form, name, detail) {
    var ev;
    try {
      ev = new CustomEvent(name, { bubbles: true, cancelable: true, detail: detail });
    } catch (e) {
      ev = d.createEvent('CustomEvent');
      ev.initCustomEvent(name, true, true, detail);
    }
    return form.dispatchEvent(ev);
  }

  /** An element named by a selector attribute, or null when the value is plain text. */
  function target(form, value) {
    if (!value || !/^[#.[]/.test(value)) return null;
    try {
      return d.querySelector(value);
    } catch (e) {
      return null;
    }
  }

  /** The auto-inserted message node for this form (role="status" or role="alert"). */
  function autoNode(form, kind) {
    var sel = '[data-sendm8-' + kind + '-message]';
    var el = form.querySelector(sel);
    if (!el) {
      el = d.createElement('p');
      el.setAttribute('data-sendm8-' + kind + '-message', '');
      el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
      el.className = 'sendm8-' + kind;
      form.appendChild(el);
    }
    return el;
  }

  function clear(form) {
    var nodes = form.querySelectorAll('[data-sendm8-error-message], [data-sendm8-success-message]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = '';
      nodes[i].hidden = true;
    }
    var errTarget = target(form, form.getAttribute('data-sendm8-error'));
    if (errTarget) errTarget.hidden = true;
  }

  function show(form, kind, message) {
    var value = form.getAttribute('data-sendm8-' + kind);
    var el = target(form, value);
    if (el) {
      // A selector: reveal that element. Error elements get the API's message as their text.
      if (kind === 'error') el.textContent = message;
      el.hidden = false;
      return el;
    }
    el = autoNode(form, kind);
    el.textContent = kind === 'success' ? value || message : message;
    el.hidden = false;
    return el;
  }

  function buttons(form) {
    var list = [];
    var all = form.querySelectorAll('button, input[type="submit"], input[type="image"]');
    for (var i = 0; i < all.length; i++) {
      var b = all[i];
      var type = (b.getAttribute('type') || 'submit').toLowerCase();
      if (type === 'submit' || type === 'image') list.push(b);
    }
    return list;
  }

  function setBusy(form, busy, submitter) {
    form.__sendm8Busy = busy;
    if (busy) form.setAttribute('aria-busy', 'true');
    else form.removeAttribute('aria-busy');
    var list = buttons(form);
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (busy) {
        b.__sendm8WasDisabled = b.disabled;
        b.disabled = true;
      } else {
        b.disabled = !!b.__sendm8WasDisabled;
      }
    }
    if (busy && submitter) form.__sendm8Submitter = submitter;
  }

  /** Sends a form. Resolves with `{ ok, id?, error? }`; never rejects. */
  function submit(form, submitter) {
    if (form.__sendm8Busy) return Promise.resolve({ ok: false, error: { code: 'busy', message: 'Already sending.' } });
    var data = new FormData(form);
    if (submitter && submitter.name) data.append(submitter.name, submitter.value || '');
    clear(form);
    setBusy(form, true, submitter);

    return w
      .fetch(form.action, { method: 'POST', body: data, headers: { Accept: 'application/json' } })
      .then(
        function (res) {
          return res.json().then(
            function (body) {
              return { status: res.status, body: body };
            },
            function () {
              return { status: res.status, body: null };
            },
          );
        },
        function () {
          return { status: 0, body: null };
        },
      )
      .then(function (r) {
        setBusy(form, false);
        var body = r.body || {};
        if (body.ok === true) {
          var detail = { id: body.id, next: body.next, response: body };
          if (emit(form, 'sendm8:success', detail)) {
            form.reset();
            show(form, 'success', DEFAULT_SUCCESS);
          }
          return { ok: true, id: body.id };
        }
        var apiError = body.error;
        var error = {
          code: (apiError && apiError.code) || (r.status ? 'http_' + r.status : 'network'),
          message: typeof apiError === 'string' ? apiError : (apiError && apiError.message) || (r.status ? DEFAULT_ERROR : NETWORK_ERROR),
          status: r.status,
        };
        if (emit(form, 'sendm8:error', error)) show(form, 'error', error.message);
        return { ok: false, error: error };
      });
  }

  function onSubmit(e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM' || !form.hasAttribute(ATTR)) return;
    if (form.getAttribute(ATTR) === 'off' || e.defaultPrevented || !isEndpoint(form.action)) return;
    e.preventDefault();
    submit(form, e.submitter);
  }

  d.addEventListener('submit', onSubmit);

  if (!w.sendm8) {
    w.sendm8 = { version: '1', submit: submit, isEndpoint: isEndpoint };
  }
})(window, document);
