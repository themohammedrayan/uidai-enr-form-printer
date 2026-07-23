// Generic binding/validation layer, driven by a per-form schema (see
// js/schema-form1-en.js for the shape). Nothing here is specific to any one
// form -- every function takes the active `schema` (and usually a shared
// mutable `ctx` object holding {record, queue, lastPlan, template,
// fontsMetrics, drawPreview(), touchActivity()}) as an explicit argument.
(function (global) {
  "use strict";

  var Engine = global.FormEngine;

  function setPath(obj, path, value) {
    var parts = path.split(".");
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (typeof o[parts[i]] !== "object" || o[parts[i]] === null) o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = value;
  }

  function getPath(obj, path) {
    var parts = path.split(".");
    var o = obj;
    for (var i = 0; i < parts.length; i++) {
      if (o == null) return undefined;
      o = o[parts[i]];
    }
    return o;
  }

  // ---- record model ---------------------------------------------------------

  function makeEmptyRecord(schema) {
    var rec = {};
    schema.fields.forEach(function (f) {
      if (f.widget === "checkboxGroup") {
        var obj = {};
        Object.keys(f.templateMap).forEach(function (k) { obj[k] = false; });
        setPath(rec, f.path, obj);
      } else {
        setPath(rec, f.path, "");
      }
    });
    return rec;
  }

  function recordToFieldValues(schema, rec) {
    var out = {};
    schema.fields.forEach(function (f) {
      if (f.widget === "radioGroup") {
        var selected = getPath(rec, f.path);
        Object.keys(f.templateMap).forEach(function (optionKey) {
          out[f.templateMap[optionKey]] = selected === optionKey;
        });
      } else if (f.widget === "checkboxGroup") {
        var box = getPath(rec, f.path) || {};
        Object.keys(f.templateMap).forEach(function (k) {
          out[f.templateMap[k]] = !!box[k];
        });
      } else if (f.widget === "text") {
        var v = getPath(rec, f.path) || "";
        if (Array.isArray(f.template)) {
          for (var i = 0; i < f.template.length; i++) {
            out[f.template[i]] = v.slice(i * f.split, (i + 1) * f.split);
          }
        } else {
          out[f.template] = v;
        }
      }
    });
    return out;
  }

  // ---- computed max-length (skips fields with an explicit HTML maxlength) ---

  function applyComputedMaxLengths(schema, template, fontsMetrics) {
    schema.fields.forEach(function (f) {
      if (f.widget !== "text" || Array.isArray(f.template)) return;
      var el = document.getElementById(f.domId);
      if (!el || el.hasAttribute("maxlength")) return;
      var templateField = template.fields[f.template];
      if (!templateField || templateField.kind !== "text") return;
      el.maxLength = Engine.computeMaxLen(templateField, fontsMetrics);
    });
  }

  // ---- role-driven cross-cutting validation UI -------------------------------

  function updateRoleHooks(schema, rec, ctx) {
    schema.fields.forEach(function (f) {
      if (f.role === "dob") {
        var dobVal = getPath(rec, f.path) || "";
        var hintEl = document.querySelector('[data-hint-for="' + f.id + '"]');
        if (hintEl) {
          hintEl.textContent = dobVal.length === 8
            ? "→ " + dobVal.slice(0, 2) + "/" + dobVal.slice(2, 4) + "/" + dobVal.slice(4, 8)
            : "";
        }
      }

      if (f.role === "aadhaar") {
        var aVal = getPath(rec, f.path) || "";
        var statusEl = document.querySelector('[data-status-for="' + f.id + '"]');
        if (statusEl) {
          if (aVal.length < 12) {
            statusEl.textContent = (12 - aVal.length) + " digit(s) remaining";
          } else {
            var ok = global.Validation.verhoeffValid(aVal);
            statusEl.innerHTML = ok
              ? '<span class="badge ok">Verhoeff OK</span>'
              : '<span class="badge bad">Verhoeff FAIL</span>';
          }
        }
        if (f.dupCheck) {
          var dupEl = document.querySelector('[data-dup-warning-for="' + f.id + '"]');
          if (dupEl) {
            var aadhaarPaths = (schema.recordShape && schema.recordShape.aadhaarPaths) || [];
            var dup = aVal.length === 12 && (ctx.queue || []).some(function (queuedRec) {
              return aadhaarPaths.some(function (p) { return getPath(queuedRec, p) === aVal; });
            });
            dupEl.hidden = !dup;
            if (dup) dupEl.textContent = "This Aadhaar number is already in the queue.";
          }
        }
      }

      if (f.role === "name") {
        var nameVal = getPath(rec, f.path) || "";
        var warnEl = document.querySelector('[data-warning-for="' + f.id + '"]');
        if (warnEl) {
          var msgs = [];
          var title = global.Validation.detectTitles(nameVal);
          if (title) msgs.push('Remove title/honorific "' + title + '" — UIDAI requires it omitted.');
          var nameOp = (ctx.lastPlan || []).filter(function (o) { return o.name === f.template; })[0];
          if (nameOp && nameOp.overflow) {
            var templateField = ctx.template.fields[f.template];
            msgs.push("Name shrunk to " + nameOp.sizePt.toFixed(2) + "pt (preferred " +
              templateField.size + "pt) — consider abbreviating.");
          }
          if (msgs.length) {
            warnEl.hidden = false;
            warnEl.innerHTML = msgs.join("<br>");
          } else {
            warnEl.hidden = true;
          }
        }
      }

      if (f.requiredWhen) {
        var reqEl = document.querySelector('[data-required-note-for="' + f.id + '"]');
        if (reqEl) reqEl.hidden = getPath(rec, f.requiredWhen.path) !== f.requiredWhen.equals;
      }
    });
  }

  // ---- canvas preview --------------------------------------------------------

  function sizeCanvasToTemplate(canvas, template, baseWidthPx) {
    var w = baseWidthPx || 864;
    var h = Math.round((w * template.page.heightMm) / template.page.widthMm);
    canvas.width = w;
    canvas.height = h;
  }

  function drawPreview(schema, ctx) {
    var canvas = document.getElementById(ctx.canvasId || "preview-canvas");
    var fieldValues = recordToFieldValues(schema, ctx.record);
    ctx.lastPlan = Engine.renderPreviewToCanvas(canvas, ctx.template, fieldValues, ctx.fontsMetrics);
    updateRoleHooks(schema, ctx.record, ctx);
  }

  // ---- form <-> record wiring -------------------------------------------------

  function bindTextInput(field, ctx) {
    var el = document.getElementById(field.domId);
    if (!el) return;
    el.addEventListener("input", function () {
      var raw = el.value;
      var pos = el.selectionStart;
      var cleaned;
      if (field.digits) {
        var digitsBefore = raw.slice(0, pos).replace(/\D/g, "").length;
        cleaned = raw.replace(/\D/g, "");
        if (field.maxlen) cleaned = cleaned.slice(0, field.maxlen);
        el.value = cleaned;
        var newPos = Math.min(digitsBefore, cleaned.length);
        el.setSelectionRange(newPos, newPos);
      } else {
        cleaned = raw.toUpperCase();
        el.value = cleaned;
        el.setSelectionRange(pos, pos);
      }
      setPath(ctx.record, field.path, cleaned);
      ctx.touchActivity();
      ctx.drawPreview();
    });
  }

  function bindRadioGroup(field, ctx) {
    document.querySelectorAll('input[name="' + field.name + '"][data-adv]').forEach(function (el) {
      el.addEventListener("change", function () {
        setPath(ctx.record, field.path, el.value);
        ctx.touchActivity();
        ctx.drawPreview();
      });
    });
  }

  function bindCheckboxGroup(field, ctx) {
    document.querySelectorAll('input[name="' + field.name + '"][data-adv]').forEach(function (el) {
      el.addEventListener("change", function () {
        var box = getPath(ctx.record, field.path) || {};
        box[el.value] = el.checked;
        setPath(ctx.record, field.path, box);
        ctx.touchActivity();
        ctx.drawPreview();
      });
    });
  }

  function bindAllInputs(schema, ctx) {
    schema.fields.forEach(function (f) {
      if (f.widget === "text") bindTextInput(f, ctx);
      else if (f.widget === "radioGroup") bindRadioGroup(f, ctx);
      else if (f.widget === "checkboxGroup") bindCheckboxGroup(f, ctx);
    });
  }

  function setRadioGroup(name, value) {
    document.querySelectorAll('input[name="' + name + '"]').forEach(function (r) {
      r.checked = r.value === value;
    });
  }

  function applyRecordToForm(schema, rec, ctx) {
    ctx.record = rec;
    schema.fields.forEach(function (f) {
      if (f.widget === "text") {
        var el = document.getElementById(f.domId);
        if (el) el.value = getPath(rec, f.path) || "";
      } else if (f.widget === "radioGroup") {
        setRadioGroup(f.name, getPath(rec, f.path));
      } else if (f.widget === "checkboxGroup") {
        var box = getPath(rec, f.path) || {};
        document.querySelectorAll('input[name="' + f.name + '"]').forEach(function (cb) {
          cb.checked = !!box[cb.value];
        });
      }
    });
    drawPreview(schema, ctx);
  }

  function resetForm(schema, ctx) {
    applyRecordToForm(schema, makeEmptyRecord(schema), ctx);
    var focusEl = document.getElementById(schema.focusFieldId);
    if (focusEl) focusEl.focus();
  }

  // Seeds a fresh record from the shared address/POA/HoF groups declared in
  // schema.recordShape, so this works identically regardless of which two
  // forms are involved -- see recordShape.addr/sharedTop convention.
  function reuseAddress(schema, queuedRec, ctx) {
    var seeded = makeEmptyRecord(schema);
    var shape = schema.recordShape || {};
    var addr = {};
    (shape.addr || []).forEach(function (key) {
      addr[key] = getPath(queuedRec, "addr." + key) || "";
    });
    setPath(seeded, "addr", addr);
    (shape.sharedTop || []).forEach(function (key) {
      setPath(seeded, key, getPath(queuedRec, key) || "");
    });
    applyRecordToForm(schema, seeded, ctx);
    var focusEl = document.getElementById(schema.focusFieldId);
    if (focusEl) focusEl.focus();
  }

  // ---- queue list rendering ---------------------------------------------------

  function renderQueueList(schema, queue, ulElement, handlers) {
    ulElement.innerHTML = "";
    queue.forEach(function (rec, idx) {
      var li = document.createElement("li");
      var who = document.createElement("div");
      who.className = "who";
      var strong = document.createElement("strong");
      strong.textContent = getPath(rec, schema.summary.namePath) || "(no name)";
      var small = document.createElement("small");
      var aadhaarVal = getPath(rec, schema.summary.aadhaarPath) || "";
      var aadhaarTail = aadhaarVal ? "•••• •••• " + aadhaarVal.slice(8) : "—";
      var subtitle = getPath(rec, schema.summary.subtitlePath) || "—";
      small.textContent = subtitle + " · Aadhaar " + aadhaarTail;
      who.appendChild(strong);
      who.appendChild(small);

      var btnWrap = document.createElement("div");
      btnWrap.style.display = "flex";
      btnWrap.style.gap = "6px";
      var btnReuse = document.createElement("button");
      btnReuse.type = "button";
      btnReuse.className = "secondary";
      btnReuse.textContent = "Reuse address";
      btnReuse.addEventListener("click", function () { handlers.onReuse(rec, idx); });
      var btnRemove = document.createElement("button");
      btnRemove.type = "button";
      btnRemove.className = "danger";
      btnRemove.textContent = "Remove";
      btnRemove.addEventListener("click", function () { handlers.onRemove(rec, idx); });
      btnWrap.appendChild(btnReuse);
      btnWrap.appendChild(btnRemove);

      li.appendChild(who);
      li.appendChild(btnWrap);
      ulElement.appendChild(li);
    });
  }

  global.SchemaRuntime = {
    setPath: setPath,
    getPath: getPath,
    makeEmptyRecord: makeEmptyRecord,
    recordToFieldValues: recordToFieldValues,
    applyComputedMaxLengths: applyComputedMaxLengths,
    updateRoleHooks: updateRoleHooks,
    sizeCanvasToTemplate: sizeCanvasToTemplate,
    drawPreview: drawPreview,
    bindTextInput: bindTextInput,
    bindRadioGroup: bindRadioGroup,
    bindCheckboxGroup: bindCheckboxGroup,
    bindAllInputs: bindAllInputs,
    applyRecordToForm: applyRecordToForm,
    resetForm: resetForm,
    reuseAddress: reuseAddress,
    renderQueueList: renderQueueList,
  };
})(window);
