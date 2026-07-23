(function () {
  "use strict";

  var Engine = window.FormEngine;
  var Runtime = window.SchemaRuntime;
  var SCHEMA = window.SCHEMA_FORM1_EN;
  var TEMPLATE = window[SCHEMA.templateGlobal];

  var queue = [];
  var currentPreviewUrl = null;
  var STOPS = [];

  // Shared mutable state the schema runtime reads/writes. `record` starts
  // as a schema-shaped empty record; `fontsMetrics` is filled in once the
  // async pdf-lib font metrics finish loading.
  var ctx = {
    record: Runtime.makeEmptyRecord(SCHEMA),
    queue: queue,
    lastPlan: [],
    template: TEMPLATE,
    fontsMetrics: null,
    canvasId: "preview-canvas",
    drawPreview: function () { Runtime.drawPreview(SCHEMA, ctx); },
    touchActivity: function () { touchActivity(); },
  };

  // ---- PDF export ---------------------------------------------------------

  function getCurrentCalibration() {
    return {
      dx: parseFloat(document.getElementById("cal-dx").value) || 0,
      dy: parseFloat(document.getElementById("cal-dy").value) || 0,
      scale: parseFloat(document.getElementById("cal-scale").value) || 1,
    };
  }

  async function generateSingleRecordPdf(rec) {
    var fieldValues = Runtime.recordToFieldValues(SCHEMA, rec);
    return Engine.generateSingleRecordPdf(TEMPLATE, fieldValues, getCurrentCalibration(), ctx.fontsMetrics);
  }

  async function generateQueuePdf(records) {
    var entries = records.map(function (rec) {
      return { template: TEMPLATE, fieldValues: Runtime.recordToFieldValues(SCHEMA, rec) };
    });
    return Engine.generateQueuePdf(entries, getCurrentCalibration(), ctx.fontsMetrics);
  }

  async function generateBlankPdf() {
    return Engine.generateBlankPdf(TEMPLATE);
  }

  async function generateAlignmentSheetPdf() {
    return Engine.generateAlignmentSheetPdf(TEMPLATE, getCurrentCalibration());
  }

  // ---- PDF preview / print -----------------------------------------------

  function showPdfPreview(bytes) {
    var blob = new Blob([bytes], { type: "application/pdf" });
    if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
    currentPreviewUrl = URL.createObjectURL(blob);
    document.getElementById("pdf-preview-frame").src = currentPreviewUrl;
    document.getElementById("pdf-preview-wrap").style.display = "block";
  }

  function doPrintNow() {
    var frame = document.getElementById("pdf-preview-frame");
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (e) {
      if (currentPreviewUrl) window.open(currentPreviewUrl, "_blank");
    }
  }

  function closePreview() {
    document.getElementById("pdf-preview-wrap").style.display = "none";
  }

  // ---- queue --------------------------------------------------------------

  function addToQueue() {
    queue.push(JSON.parse(JSON.stringify(ctx.record)));
    renderQueue();
    Runtime.resetForm(SCHEMA, ctx);
  }

  function renderQueue() {
    var ul = document.getElementById("queue-list");
    Runtime.renderQueueList(SCHEMA, queue, ul, {
      onReuse: function (rec) { Runtime.reuseAddress(SCHEMA, rec, ctx); },
      onRemove: function (rec, idx) {
        queue.splice(idx, 1);
        renderQueue();
      },
    });
    document.getElementById("queue-count").textContent = queue.length;
  }

  function wipeQueue() {
    queue.length = 0;
    renderQueue();
  }

  // ---- idle auto-wipe -------------------------------------------------------

  var lastActivity = Date.now();
  var IDLE_LIMIT_MS = 15 * 60 * 1000;
  var WARN_AT_MS = 14 * 60 * 1000;

  function touchActivity() {
    lastActivity = Date.now();
    hideIdleBanner();
  }

  function showIdleBanner(msRemaining) {
    var el = document.getElementById("idle-banner");
    el.style.display = "block";
    el.textContent = "Idle — wiping all data in " + Math.ceil(msRemaining / 1000) + "s. Press any key to cancel.";
  }

  function hideIdleBanner() {
    document.getElementById("idle-banner").style.display = "none";
  }

  function wipeAll() {
    wipeQueue();
    Runtime.resetForm(SCHEMA, ctx);
    hideIdleBanner();
    lastActivity = Date.now();
  }

  setInterval(function () {
    var elapsed = Date.now() - lastActivity;
    if (elapsed >= IDLE_LIMIT_MS) {
      wipeAll();
    } else if (elapsed >= WARN_AT_MS) {
      showIdleBanner(IDLE_LIMIT_MS - elapsed);
    }
  }, 1000);

  // ---- calibration profiles -------------------------------------------------

  var CAL_KEY_PROFILES = "uidai_f1_cal_profiles_v1";
  var CAL_KEY_CURRENT = "uidai_f1_cal_current_v1";
  var calStorageAvailable = true;

  function loadProfiles() {
    try {
      var raw = localStorage.getItem(CAL_KEY_PROFILES);
      return raw ? JSON.parse(raw) : { Default: { dx: 0, dy: 0, scale: 1 } };
    } catch (e) {
      calStorageAvailable = false;
      return { Default: { dx: 0, dy: 0, scale: 1 } };
    }
  }

  function saveProfiles(profiles) {
    try {
      localStorage.setItem(CAL_KEY_PROFILES, JSON.stringify(profiles));
    } catch (e) {
      calStorageAvailable = false;
    }
  }

  function loadCurrentProfileName(profiles) {
    try {
      var n = localStorage.getItem(CAL_KEY_CURRENT);
      return n && profiles[n] ? n : Object.keys(profiles)[0];
    } catch (e) {
      return Object.keys(profiles)[0];
    }
  }

  function saveCurrentProfileName(name) {
    try {
      localStorage.setItem(CAL_KEY_CURRENT, name);
    } catch (e) {
      // localStorage blocked; profile choice just won't persist across reloads.
    }
  }

  var calProfiles = loadProfiles();
  var currentProfileName = loadCurrentProfileName(calProfiles);

  function loadProfileIntoInputs() {
    var p = calProfiles[currentProfileName] || { dx: 0, dy: 0, scale: 1 };
    document.getElementById("cal-dx").value = p.dx;
    document.getElementById("cal-dy").value = p.dy;
    document.getElementById("cal-scale").value = p.scale;
  }

  function persistCurrentProfileFromInputs() {
    var p = {
      dx: parseFloat(document.getElementById("cal-dx").value) || 0,
      dy: parseFloat(document.getElementById("cal-dy").value) || 0,
      scale: parseFloat(document.getElementById("cal-scale").value) || 1,
    };
    calProfiles[currentProfileName] = p;
    saveProfiles(calProfiles);
  }

  function populateProfileSelect() {
    var sel = document.getElementById("cal-profile");
    sel.innerHTML = "";
    Object.keys(calProfiles).forEach(function (name) {
      var opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    sel.value = currentProfileName;
    loadProfileIntoInputs();
  }

  // ---- keyboard-first flow -------------------------------------------------

  function buildStops() {
    var stops = [];
    var seenNames = {};
    document.querySelectorAll("#entry-form [data-adv]").forEach(function (el) {
      if (el.type === "radio" || el.type === "checkbox") {
        if (seenNames[el.name]) return;
        seenNames[el.name] = true;
      }
      stops.push(el);
    });
    return stops;
  }

  function onEnterAdvance(e) {
    if (e.key !== "Enter" || e.ctrlKey || e.shiftKey) return;
    var el = e.target;
    if (!el.matches("[data-adv]")) return;
    e.preventDefault();
    var idx = STOPS.indexOf(el);
    if (idx === -1) {
      idx = STOPS.findIndex(function (s) { return s.name && s.name === el.name; });
    }
    if (idx > -1 && idx + 1 < STOPS.length) STOPS[idx + 1].focus();
  }

  function onGlobalShortcuts(e) {
    if (e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      document.getElementById("btn-print-one").click();
    } else if (e.ctrlKey && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      document.getElementById("btn-queue").click();
    }
  }

  // ---- init -----------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", function () {
    Runtime.sizeCanvasToTemplate(document.getElementById("preview-canvas"), TEMPLATE);

    populateProfileSelect();
    if (!calStorageAvailable) {
      var note = document.getElementById("cal-storage-note");
      note.hidden = false;
      note.textContent = "localStorage unavailable in this browser context — calibration will not persist after reload.";
    }

    document.getElementById("cal-profile").addEventListener("change", function (e) {
      currentProfileName = e.target.value;
      saveCurrentProfileName(currentProfileName);
      loadProfileIntoInputs();
    });
    document.getElementById("cal-new").addEventListener("click", function () {
      var name = prompt("New profile name:");
      if (name && !calProfiles[name]) {
        calProfiles[name] = { dx: 0, dy: 0, scale: 1 };
        saveProfiles(calProfiles);
        currentProfileName = name;
        saveCurrentProfileName(name);
        populateProfileSelect();
      }
    });
    document.getElementById("cal-delete").addEventListener("click", function () {
      if (Object.keys(calProfiles).length <= 1) {
        alert("At least one calibration profile must remain.");
        return;
      }
      if (confirm('Delete profile "' + currentProfileName + '"?')) {
        delete calProfiles[currentProfileName];
        saveProfiles(calProfiles);
        currentProfileName = Object.keys(calProfiles)[0];
        saveCurrentProfileName(currentProfileName);
        populateProfileSelect();
      }
    });
    ["cal-dx", "cal-dy", "cal-scale"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", persistCurrentProfileFromInputs);
    });
    document.getElementById("cal-apply").addEventListener("click", function () {
      var mx = parseFloat(document.getElementById("meas-x").value);
      var my = parseFloat(document.getElementById("meas-y").value);
      var mbar = parseFloat(document.getElementById("meas-bar").value);
      if (!isNaN(mx)) document.getElementById("cal-dx").value = (20 - mx).toFixed(3);
      if (!isNaN(my)) document.getElementById("cal-dy").value = (20 - my).toFixed(3);
      if (!isNaN(mbar) && mbar > 0) document.getElementById("cal-scale").value = (150 / mbar).toFixed(5);
      persistCurrentProfileFromInputs();
    });
    document.getElementById("btn-alignment-sheet").addEventListener("click", async function () {
      showPdfPreview(await generateAlignmentSheetPdf());
    });

    Runtime.bindAllInputs(SCHEMA, ctx);

    document.getElementById("btn-print-one").addEventListener("click", async function () {
      showPdfPreview(await generateSingleRecordPdf(ctx.record));
    });
    document.getElementById("btn-print-blank").addEventListener("click", async function () {
      showPdfPreview(await generateBlankPdf());
    });
    document.getElementById("btn-print-queue").addEventListener("click", async function () {
      if (!queue.length) {
        alert("Queue is empty.");
        return;
      }
      showPdfPreview(await generateQueuePdf(queue));
    });
    document.getElementById("btn-queue").addEventListener("click", function () { addToQueue(); });
    document.getElementById("btn-clear-form").addEventListener("click", function () {
      if (confirm("Clear the current form?")) Runtime.resetForm(SCHEMA, ctx);
    });
    document.getElementById("btn-wipe-queue").addEventListener("click", function () {
      if (confirm("Wipe the whole queue? This cannot be undone.")) wipeQueue();
    });
    document.getElementById("btn-do-print").addEventListener("click", doPrintNow);
    document.getElementById("btn-close-preview").addEventListener("click", closePreview);

    STOPS = buildStops();
    document.getElementById("entry-form").addEventListener("keydown", onEnterAdvance);
    document.addEventListener("keydown", onGlobalShortcuts);
    document.addEventListener("keydown", touchActivity, true);
    document.addEventListener("mousedown", touchActivity, true);

    renderQueue();
    ctx.drawPreview();

    Engine.initFontsMetrics().then(function (fonts) {
      ctx.fontsMetrics = fonts;
      Runtime.applyComputedMaxLengths(SCHEMA, TEMPLATE, fonts);
      ctx.drawPreview();
    });
  });
})();
