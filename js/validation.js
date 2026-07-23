// Verhoeff checksum + UIDAI-specific input validation helpers.
(function (global) {
  "use strict";

  var D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];

  var P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];

  function verhoeffValid(digitString) {
    var c = 0;
    var digits = digitString.split("").reverse();
    for (var i = 0; i < digits.length; i++) {
      var digit = parseInt(digits[i], 10);
      if (isNaN(digit)) return false;
      c = D[c][P[i % 8][digit]];
    }
    return c === 0;
  }

  var TITLES = [
    "MR", "MRS", "MS", "SHRI", "SMT", "KUMARI", "THIRU", "DR", "PROF",
    "ADV", "ER", "CA", "IAS", "IPS", "IFS", "SIR",
  ];
  var TITLE_RE = new RegExp("\\b(" + TITLES.join("|") + ")\\b", "i");

  function detectTitles(name) {
    var cleaned = name.replace(/[.,]/g, " ");
    var match = cleaned.match(TITLE_RE);
    return match ? match[1].toUpperCase() : null;
  }

  global.Validation = {
    verhoeffValid: verhoeffValid,
    detectTitles: detectTitles,
  };
})(window);
