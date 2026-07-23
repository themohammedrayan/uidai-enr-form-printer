(function () {
  "use strict";

  var TEMPLATE = window.FORM1_EN_TEMPLATE;
  var Engine = window.FormEngine;

  var FIELD_INPUT_MAP = {
    name: "f-name",
    email: "f-email",
    addr_house: "f-house",
    addr_street: "f-street",
    addr_landmark: "f-landmark",
    addr_ward: "f-ward",
    addr_area: "f-area",
    addr_village: "f-village",
    addr_post_office: "f-post-office",
    addr_subdistrict: "f-subdistrict",
    addr_district: "f-district",
    addr_state: "f-state",
    doc_poi: "f-poi",
    doc_poa: "f-poa",
    doc_pdb: "f-pdb",
    hof_name: "f-hof-name",
    doc_por: "f-por",
  };

  // ---- record model ----------------------------------------------------

  function makeEmptyRecord() {
    return {
      purpose: "", status: "", name: "", gender: "", dob: "", age: "", dobBasis: "",
      email: "", mobile: "", basis: "",
      addr: { house: "", street: "", landmark: "", ward: "", area: "", village: "",
        postOffice: "", pin: "", subdistrict: "", district: "", state: "" },
      docPoi: "", docPoa: "", docPdb: "",
      hofName: "", hofAadhaar: "", relationship: "", docPor: "",
      applicantAadhaar: "",
      updates: { biometric: false, name: false, dob: false, gender: false,
        address: false, mobile: false, email: false, poiPoa: false },
    };
  }

  var record = makeEmptyRecord();
  var queue = [];
  var lastPlan = [];
  var FONTS_METRICS = null;
  var currentPreviewUrl = null;
  var STOPS = [];

  function setPath(obj, path, value) {
    var parts = path.split(".");
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = value;
  }

  function recordToFieldValues(rec) {
    return {
      purpose_enrolment: rec.purpose === "enrolment",
      purpose_update: rec.purpose === "update",
      status_resident: rec.status === "resident",
      status_nri: rec.status === "nri",
      name: rec.name,
      gender_female: rec.gender === "female",
      gender_male: rec.gender === "male",
      gender_third: rec.gender === "third",
      dob: rec.dob,
      age: rec.age,
      dob_verified: rec.dobBasis === "verified",
      dob_declared: rec.dobBasis === "declared",
      dob_approximate: rec.dobBasis === "approximate",
      email: rec.email,
      mobile: rec.mobile,
      basis_document: rec.basis === "document",
      basis_hof: rec.basis === "hof",
      addr_house: rec.addr.house,
      addr_street: rec.addr.street,
      addr_landmark: rec.addr.landmark,
      addr_ward: rec.addr.ward,
      addr_area: rec.addr.area,
      addr_village: rec.addr.village,
      addr_post_office: rec.addr.postOffice,
      addr_pin: rec.addr.pin,
      addr_subdistrict: rec.addr.subdistrict,
      addr_district: rec.addr.district,
      addr_state: rec.addr.state,
      doc_poi: rec.docPoi,
      doc_poa: rec.docPoa,
      doc_pdb: rec.docPdb,
      hof_name: rec.hofName,
      hof_aadhaar_1: rec.hofAadhaar.slice(0, 4),
      hof_aadhaar_2: rec.hofAadhaar.slice(4, 8),
      hof_aadhaar_3: rec.hofAadhaar.slice(8, 12),
      rel_mother: rec.relationship === "mother",
      rel_father: rec.relationship === "father",
      rel_guardian: rec.relationship === "guardian",
      rel_spouse: rec.relationship === "spouse",
      rel_child: rec.relationship === "child",
      rel_sibling: rec.relationship === "sibling",
      doc_por: rec.docPor,
      applicant_aadhaar_1: rec.applicantAadhaar.slice(0, 4),
      applicant_aadhaar_2: rec.applicantAadhaar.slice(4, 8),
      applicant_aadhaar_3: rec.applicantAadhaar.slice(8, 12),
      upd_biometric: rec.updates.biometric,
      upd_name: rec.updates.name,
      upd_dob: rec.updates.dob,
      upd_gender: rec.updates.gender,
      upd_address: rec.updates.address,
      upd_mobile: rec.updates.mobile,
      upd_email: rec.updates.email,
      upd_poi_poa: rec.updates.poiPoa,
    };
  }

  // ---- canvas live preview ----------------------------------------------

  function drawPreview() {
    var canvas = document.getElementById("preview-canvas");
    var fieldValues = recordToFieldValues(record);
    lastPlan = Engine.renderPreviewToCanvas(canvas, TEMPLATE, fieldValues, FONTS_METRICS);
    updateNameWarnings();
  }

  function applyComputedMaxLengths() {
    Object.keys(FIELD_INPUT_MAP).forEach(function (fieldName) {
      var el = document.getElementById(FIELD_INPUT_MAP[fieldName]);
      if (!el || el.hasAttribute("maxlength")) return;
      el.maxLength = Engine.computeMaxLen(TEMPLATE.fields[fieldName], FONTS_METRICS);
    });
  }

  // ---- PDF export ---------------------------------------------------------

  function getCurrentCalibration() {
    return {
      dx: parseFloat(document.getElementById("cal-dx").value) || 0,
      dy: parseFloat(document.getElementById("cal-dy").value) || 0,
      scale: parseFloat(document.getElementById("cal-scale").value) || 1,
    };
  }

  async function generateSingleRecordPdf(rec) {
    return Engine.generateSingleRecordPdf(TEMPLATE, recordToFieldValues(rec), getCurrentCalibration(), FONTS_METRICS);
  }

  async function generateQueuePdf(records) {
    var entries = records.map(function (rec) {
      return { template: TEMPLATE, fieldValues: recordToFieldValues(rec) };
    });
    return Engine.generateQueuePdf(entries, getCurrentCalibration(), FONTS_METRICS);
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

  // ---- validation UI hooks -----------------------------------------------

  function updateEmailRequired() {
    document.getElementById("email-req").hidden = record.status !== "nri";
  }

  function updateDobHint(v) {
    var el = document.getElementById("dob-hint");
    el.textContent = v.length === 8 ? "→ " + v.slice(0, 2) + "/" + v.slice(2, 4) + "/" + v.slice(4, 8) : "";
  }

  function updateAadhaarStatus(inputId, value) {
    var statusElId = inputId === "f-hof-aadhaar" ? "hof-aadhaar-status" : "applicant-aadhaar-status";
    var statusEl = document.getElementById(statusElId);
    if (value.length < 12) {
      statusEl.textContent = (12 - value.length) + " digit(s) remaining";
    } else {
      var ok = Validation.verhoeffValid(value);
      statusEl.innerHTML = ok
        ? '<span class="badge ok">Verhoeff OK</span>'
        : '<span class="badge bad">Verhoeff FAIL</span>';
    }
    if (inputId === "f-applicant-aadhaar") {
      var dup = value.length === 12 && queue.some(function (r) {
        return r.applicantAadhaar === value || r.hofAadhaar === value;
      });
      var dupEl = document.getElementById("dup-warning");
      dupEl.hidden = !dup;
      if (dup) dupEl.textContent = "This Aadhaar number is already in the queue.";
    }
  }

  function updateNameWarnings() {
    var msgs = [];
    var title = Validation.detectTitles(record.name);
    if (title) msgs.push('Remove title/honorific "' + title + '" — UIDAI requires it omitted.');
    var nameOp = lastPlan.filter(function (o) { return o.name === "name"; })[0];
    if (nameOp && nameOp.overflow) {
      msgs.push("Name shrunk to " + nameOp.sizePt.toFixed(2) + "pt (preferred " +
        TEMPLATE.fields.name.size + "pt) — consider abbreviating.");
    }
    var el = document.getElementById("name-warning");
    if (msgs.length) {
      el.hidden = false;
      el.innerHTML = msgs.join("<br>");
    } else {
      el.hidden = true;
    }
  }

  // ---- form <-> record wiring ---------------------------------------------

  var TEXT_BINDINGS = [
    ["f-name", "name", {}],
    ["f-email", "email", {}],
    ["f-house", "addr.house", {}],
    ["f-street", "addr.street", {}],
    ["f-landmark", "addr.landmark", {}],
    ["f-ward", "addr.ward", {}],
    ["f-area", "addr.area", {}],
    ["f-village", "addr.village", {}],
    ["f-post-office", "addr.postOffice", {}],
    ["f-subdistrict", "addr.subdistrict", {}],
    ["f-district", "addr.district", {}],
    ["f-state", "addr.state", {}],
    ["f-poi", "docPoi", {}],
    ["f-poa", "docPoa", {}],
    ["f-pdb", "docPdb", {}],
    ["f-hof-name", "hofName", {}],
    ["f-por", "docPor", {}],
    ["f-dob", "dob", { digits: true, maxlen: 8 }],
    ["f-age", "age", { digits: true, maxlen: 3 }],
    ["f-mobile", "mobile", { digits: true, maxlen: 10 }],
    ["f-pin", "addr.pin", { digits: true, maxlen: 6 }],
    ["f-hof-aadhaar", "hofAadhaar", { digits: true, maxlen: 12, aadhaar: true }],
    ["f-applicant-aadhaar", "applicantAadhaar", { digits: true, maxlen: 12, aadhaar: true }],
  ];

  function bindTextInput(id, path, opts) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", function () {
      var raw = el.value;
      var pos = el.selectionStart;
      var cleaned;
      if (opts.digits) {
        var digitsBefore = raw.slice(0, pos).replace(/\D/g, "").length;
        cleaned = raw.replace(/\D/g, "");
        if (opts.maxlen) cleaned = cleaned.slice(0, opts.maxlen);
        el.value = cleaned;
        var newPos = Math.min(digitsBefore, cleaned.length);
        el.setSelectionRange(newPos, newPos);
      } else {
        cleaned = raw.toUpperCase();
        el.value = cleaned;
        el.setSelectionRange(pos, pos);
      }
      setPath(record, path, cleaned);
      if (opts.aadhaar) updateAadhaarStatus(id, cleaned);
      if (id === "f-dob") updateDobHint(cleaned);
      touchActivity();
      drawPreview();
    });
  }

  function setRadio(name, value) {
    document.querySelectorAll('input[name="' + name + '"]').forEach(function (r) {
      r.checked = r.value === value;
    });
  }

  function applyRecordToForm(rec) {
    record = rec;
    document.getElementById("f-name").value = rec.name;
    document.getElementById("f-email").value = rec.email;
    document.getElementById("f-house").value = rec.addr.house;
    document.getElementById("f-street").value = rec.addr.street;
    document.getElementById("f-landmark").value = rec.addr.landmark;
    document.getElementById("f-ward").value = rec.addr.ward;
    document.getElementById("f-area").value = rec.addr.area;
    document.getElementById("f-village").value = rec.addr.village;
    document.getElementById("f-post-office").value = rec.addr.postOffice;
    document.getElementById("f-subdistrict").value = rec.addr.subdistrict;
    document.getElementById("f-district").value = rec.addr.district;
    document.getElementById("f-state").value = rec.addr.state;
    document.getElementById("f-poi").value = rec.docPoi;
    document.getElementById("f-poa").value = rec.docPoa;
    document.getElementById("f-pdb").value = rec.docPdb;
    document.getElementById("f-hof-name").value = rec.hofName;
    document.getElementById("f-por").value = rec.docPor;
    document.getElementById("f-dob").value = rec.dob;
    document.getElementById("f-age").value = rec.age;
    document.getElementById("f-mobile").value = rec.mobile;
    document.getElementById("f-pin").value = rec.addr.pin;
    document.getElementById("f-hof-aadhaar").value = rec.hofAadhaar;
    document.getElementById("f-applicant-aadhaar").value = rec.applicantAadhaar;

    setRadio("purpose", rec.purpose);
    setRadio("status", rec.status);
    setRadio("gender", rec.gender);
    setRadio("dobBasis", rec.dobBasis);
    setRadio("basis", rec.basis);
    setRadio("relationship", rec.relationship);
    document.querySelectorAll('input[name="upd"]').forEach(function (cb) {
      cb.checked = !!rec.updates[cb.value];
    });

    updateEmailRequired();
    updateDobHint(rec.dob);
    updateAadhaarStatus("f-hof-aadhaar", rec.hofAadhaar);
    updateAadhaarStatus("f-applicant-aadhaar", rec.applicantAadhaar);
    drawPreview();
  }

  function resetForm() {
    applyRecordToForm(makeEmptyRecord());
    document.getElementById("f-name").focus();
  }

  function reuseAddress(queuedRec) {
    var seeded = makeEmptyRecord();
    seeded.addr = JSON.parse(JSON.stringify(queuedRec.addr));
    seeded.docPoa = queuedRec.docPoa;
    seeded.hofName = queuedRec.hofName;
    seeded.hofAadhaar = queuedRec.hofAadhaar;
    applyRecordToForm(seeded);
    document.getElementById("f-name").focus();
  }

  // ---- queue --------------------------------------------------------------

  function addToQueue() {
    queue.push(JSON.parse(JSON.stringify(record)));
    renderQueue();
    resetForm();
  }

  function renderQueue() {
    var ul = document.getElementById("queue-list");
    ul.innerHTML = "";
    queue.forEach(function (rec, idx) {
      var li = document.createElement("li");
      var who = document.createElement("div");
      who.className = "who";
      var strong = document.createElement("strong");
      strong.textContent = rec.name || "(no name)";
      var small = document.createElement("small");
      var aadhaarTail = rec.applicantAadhaar ? "•••• •••• " + rec.applicantAadhaar.slice(8) : "—";
      small.textContent = (rec.relationship || "—") + " · Aadhaar " + aadhaarTail;
      who.appendChild(strong);
      who.appendChild(small);

      var btnWrap = document.createElement("div");
      btnWrap.style.display = "flex";
      btnWrap.style.gap = "6px";
      var btnReuse = document.createElement("button");
      btnReuse.type = "button";
      btnReuse.className = "secondary";
      btnReuse.textContent = "Reuse address";
      btnReuse.addEventListener("click", function () { reuseAddress(rec); });
      var btnRemove = document.createElement("button");
      btnRemove.type = "button";
      btnRemove.className = "danger";
      btnRemove.textContent = "Remove";
      btnRemove.addEventListener("click", function () {
        queue.splice(idx, 1);
        renderQueue();
      });
      btnWrap.appendChild(btnReuse);
      btnWrap.appendChild(btnRemove);

      li.appendChild(who);
      li.appendChild(btnWrap);
      ul.appendChild(li);
    });
    document.getElementById("queue-count").textContent = queue.length;
  }

  function wipeQueue() {
    queue = [];
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
    queue = [];
    renderQueue();
    applyRecordToForm(makeEmptyRecord());
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

    TEXT_BINDINGS.forEach(function (b) { bindTextInput(b[0], b[1], b[2]); });

    document.querySelectorAll('#entry-form input[type="radio"][data-adv]').forEach(function (el) {
      el.addEventListener("change", function () {
        record[el.name] = el.value;
        if (el.name === "status") updateEmailRequired();
        touchActivity();
        drawPreview();
      });
    });
    document.querySelectorAll('#entry-form input[type="checkbox"][data-adv]').forEach(function (el) {
      el.addEventListener("change", function () {
        record.updates[el.value] = el.checked;
        touchActivity();
        drawPreview();
      });
    });

    document.getElementById("btn-print-one").addEventListener("click", async function () {
      showPdfPreview(await generateSingleRecordPdf(record));
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
      if (confirm("Clear the current form?")) resetForm();
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
    updateEmailRequired();
    drawPreview();

    Engine.initFontsMetrics().then(function (fonts) {
      FONTS_METRICS = fonts;
      applyComputedMaxLengths();
      drawPreview();
    });
  });
})();
