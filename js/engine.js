// Template-agnostic rendering engine shared by every form. Nothing in this
// file references a specific form's field names or record shape -- it only
// ever deals in {template, fieldValues} where fieldValues is a flat
// templateFieldName -> value map, produced by each form's own schema layer.
(function (global) {
  "use strict";

  var MM2PT = 72 / 25.4;
  var MM_PER_PT = 25.4 / 72;
  var GRID_FONT_SIZE_PT = 9;

  function place(xMm, yMm, cal, H) {
    return [
      (xMm * cal.scale + cal.dx) * MM2PT,
      H - (yMm * cal.scale + cal.dy) * MM2PT,
    ];
  }

  function pageSizePt(template) {
    return [template.page.widthMm * MM2PT, template.page.heightMm * MM2PT];
  }

  async function embedDrawFonts(doc) {
    var helveticaBold = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    var courier = await doc.embedFont(PDFLib.StandardFonts.Courier);
    return { helveticaBold: helveticaBold, courier: courier };
  }

  async function initFontsMetrics() {
    var doc = await PDFLib.PDFDocument.create();
    return embedDrawFonts(doc);
  }

  function fitTextSize(font, text, wPt, preferredPt) {
    var size = preferredPt;
    while (size > 4 && font.widthOfTextAtSize(text, size) > wPt) size -= 0.25;
    return Math.max(size, 4);
  }

  function computeMaxLen(fieldDef, fontsMetrics) {
    var wPt = fieldDef.w * MM2PT;
    var n = 1;
    while (fontsMetrics.helveticaBold.widthOfTextAtSize("M".repeat(n + 1), 6) <= wPt) n++;
    return Math.max(n, 1);
  }

  function computeRenderPlan(template, fieldValues, fontsMetrics) {
    var ops = [];
    Object.keys(template.fields).forEach(function (name) {
      var f = template.fields[name];
      var v = fieldValues[name];
      if (f.kind === "tick") {
        ops.push({ name: name, kind: "tick", x: f.x, y: f.y, on: !!v });
      } else if (f.kind === "grid") {
        if (v) {
          ops.push({ name: name, kind: "grid", x: f.x, y: f.y, h: f.h,
            pitch: f.pitch, cells: f.cells, chars: String(v).split("") });
        }
      } else if (f.kind === "text") {
        if (v) {
          var text = String(v);
          var size = fontsMetrics
            ? fitTextSize(fontsMetrics.helveticaBold, text, f.w * MM2PT, f.size)
            : f.size;
          ops.push({ name: name, kind: "text", x: f.x, y: f.y, w: f.w,
            text: text, sizePt: size, overflow: size < f.size });
        }
      }
    });
    return ops;
  }

  // ---- canvas (mm-space, no flip, no calibration -- see build spec section 3) ----

  function drawFieldCanvas(ctx, op) {
    if (op.kind === "tick") {
      if (!op.on) return;
      var arm = 1.3;
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 0.9 * MM_PER_PT;
      ctx.beginPath();
      ctx.moveTo(op.x - arm, op.y - arm);
      ctx.lineTo(op.x + arm, op.y + arm);
      ctx.moveTo(op.x - arm, op.y + arm);
      ctx.lineTo(op.x + arm, op.y - arm);
      ctx.stroke();
    } else if (op.kind === "grid") {
      ctx.fillStyle = "#111";
      ctx.font = (GRID_FONT_SIZE_PT * MM_PER_PT) + 'px "Courier New", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      for (var i = 0; i < op.cells; i++) {
        var ch = op.chars[i];
        if (!ch) continue;
        var cx = op.x + i * op.pitch + op.pitch / 2;
        var by = op.y + op.h - 0.85;
        ctx.fillText(ch, cx, by);
      }
    } else if (op.kind === "text") {
      ctx.fillStyle = op.overflow ? "#a1260e" : "#111";
      ctx.font = "bold " + (op.sizePt * MM_PER_PT) + "px Arial, Helvetica, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(op.text, op.x, op.y);
    }
  }

  function drawWireCanvas(ctx, template) {
    ctx.strokeStyle = "#c7cbd1";
    ctx.lineWidth = 0.15;
    template.wire.forEach(function (r) {
      ctx.strokeRect(r[0], r[1], r[2], r[3]);
    });
  }

  // Renders wire + fields for `template`/`fieldValues` onto `canvas`, whose
  // pixel width/height are assumed already sized to the template's aspect
  // ratio by the caller. Returns the render plan (callers use it for
  // overflow-warning inspection etc).
  function renderPreviewToCanvas(canvas, template, fieldValues, fontsMetrics) {
    var ctx = canvas.getContext("2d");
    var pxPerMm = canvas.width / template.page.widthMm;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(pxPerMm, pxPerMm);

    drawWireCanvas(ctx, template);

    var plan = computeRenderPlan(template, fieldValues, fontsMetrics);
    plan.forEach(function (op) { drawFieldCanvas(ctx, op); });

    ctx.restore();
    return plan;
  }

  // ---- PDF (place() flips to bottom-left origin + applies calibration) ----

  function drawFieldPdf(page, fonts, cal, H, op) {
    if (op.kind === "tick") {
      if (!op.on) return;
      var arm = 1.3;
      var p1 = place(op.x - arm, op.y - arm, cal, H);
      var p2 = place(op.x + arm, op.y + arm, cal, H);
      var p3 = place(op.x - arm, op.y + arm, cal, H);
      var p4 = place(op.x + arm, op.y - arm, cal, H);
      page.drawLine({ start: { x: p1[0], y: p1[1] }, end: { x: p2[0], y: p2[1] }, thickness: 0.9, color: PDFLib.rgb(0, 0, 0) });
      page.drawLine({ start: { x: p3[0], y: p3[1] }, end: { x: p4[0], y: p4[1] }, thickness: 0.9, color: PDFLib.rgb(0, 0, 0) });
    } else if (op.kind === "grid") {
      for (var i = 0; i < op.cells; i++) {
        var ch = op.chars[i];
        if (!ch) continue;
        var cx = op.x + i * op.pitch + op.pitch / 2;
        var by = op.y + op.h - 0.85;
        var pt = place(cx, by, cal, H);
        var w = fonts.courier.widthOfTextAtSize(ch, GRID_FONT_SIZE_PT);
        page.drawText(ch, { x: pt[0] - w / 2, y: pt[1], size: GRID_FONT_SIZE_PT, font: fonts.courier, color: PDFLib.rgb(0, 0, 0) });
      }
    } else if (op.kind === "text") {
      var ptt = place(op.x, op.y, cal, H);
      page.drawText(op.text, { x: ptt[0], y: ptt[1], size: op.sizePt, font: fonts.helveticaBold, color: PDFLib.rgb(0, 0, 0) });
    }
  }

  async function generateSingleRecordPdf(template, fieldValues, cal, fontsMetrics) {
    var doc = await PDFLib.PDFDocument.create();
    var fonts = await embedDrawFonts(doc);
    var size = pageSizePt(template);
    var page = doc.addPage(size);
    var plan = computeRenderPlan(template, fieldValues, fontsMetrics);
    plan.forEach(function (op) { drawFieldPdf(page, fonts, cal, size[1], op); });
    return doc.save();
  }

  // entries: [{template, fieldValues}, ...] -- one page per entry, sized
  // from that entry's own template, so a queue mixing page sizes (e.g. one
  // Letter form and one A4 form) produces a PDF with correctly-sized pages
  // throughout.
  async function generateQueuePdf(entries, cal, fontsMetrics) {
    var doc = await PDFLib.PDFDocument.create();
    var fonts = await embedDrawFonts(doc);
    entries.forEach(function (entry) {
      var size = pageSizePt(entry.template);
      var page = doc.addPage(size);
      var plan = computeRenderPlan(entry.template, entry.fieldValues, fontsMetrics);
      plan.forEach(function (op) { drawFieldPdf(page, fonts, cal, size[1], op); });
    });
    return doc.save();
  }

  async function generateBlankPdf(template) {
    var doc = await PDFLib.PDFDocument.create();
    doc.addPage(pageSizePt(template));
    return doc.save();
  }

  async function generateAlignmentSheetPdf(template, cal) {
    var doc = await PDFLib.PDFDocument.create();
    var font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    var size = pageSizePt(template);
    var H = size[1];
    var page = doc.addPage(size);
    var grey = PDFLib.rgb(0.55, 0.55, 0.55);
    var black = PDFLib.rgb(0, 0, 0);

    template.wire.forEach(function (r) {
      var x = r[0], y = r[1], w = r[2], h = r[3];
      var bl = place(x, y + h, cal, H);
      page.drawRectangle({
        x: bl[0], y: bl[1],
        width: w * cal.scale * MM2PT, height: h * cal.scale * MM2PT,
        borderColor: grey, borderWidth: 0.25,
      });
    });

    var armMm = 8;
    var c1 = place(20 - armMm, 20, cal, H), c2 = place(20 + armMm, 20, cal, H);
    var c3 = place(20, 20 - armMm, cal, H), c4 = place(20, 20 + armMm, cal, H);
    page.drawLine({ start: { x: c1[0], y: c1[1] }, end: { x: c2[0], y: c2[1] }, thickness: 0.5, color: black });
    page.drawLine({ start: { x: c3[0], y: c3[1] }, end: { x: c4[0], y: c4[1] }, thickness: 0.5, color: black });
    var crossLabel = place(20 + 2, 20 + 10, cal, H);
    page.drawText("Crosshair centre should measure 20.00mm from the top edge and 20.00mm from the left edge.",
      { x: crossLabel[0], y: crossLabel[1], size: 7, font: font, color: black });

    var barY = 250;
    var b1 = place(30, barY, cal, H), b2 = place(180, barY, cal, H);
    page.drawLine({ start: { x: b1[0], y: b1[1] }, end: { x: b2[0], y: b2[1] }, thickness: 0.5, color: black });
    for (var mm = 0; mm <= 150; mm += 10) {
      var tall = mm % 50 === 0;
      var half = tall ? 3 : 1.5;
      var t1 = place(30 + mm, barY - half, cal, H), t2 = place(30 + mm, barY + half, cal, H);
      page.drawLine({ start: { x: t1[0], y: t1[1] }, end: { x: t2[0], y: t2[1] }, thickness: 0.5, color: black });
    }
    var barLabel = place(30, barY + 8, cal, H);
    page.drawText("Bar should measure exactly 150.00mm end to end (ticks every 10mm, tall every 50mm).",
      { x: barLabel[0], y: barLabel[1], size: 7, font: font, color: black });

    return doc.save();
  }

  global.FormEngine = {
    MM2PT: MM2PT,
    MM_PER_PT: MM_PER_PT,
    GRID_FONT_SIZE_PT: GRID_FONT_SIZE_PT,
    place: place,
    pageSizePt: pageSizePt,
    embedDrawFonts: embedDrawFonts,
    initFontsMetrics: initFontsMetrics,
    fitTextSize: fitTextSize,
    computeMaxLen: computeMaxLen,
    computeRenderPlan: computeRenderPlan,
    drawFieldCanvas: drawFieldCanvas,
    drawWireCanvas: drawWireCanvas,
    renderPreviewToCanvas: renderPreviewToCanvas,
    drawFieldPdf: drawFieldPdf,
    generateSingleRecordPdf: generateSingleRecordPdf,
    generateQueuePdf: generateQueuePdf,
    generateBlankPdf: generateBlankPdf,
    generateAlignmentSheetPdf: generateAlignmentSheetPdf,
  };
})(window);
