// Declarative field schema for Form 5 (English) -- child below 5 years old.
// Structurally more different from Form 1/3 than they are from each other:
//
//  - Section 6 supports both parents simultaneously (separate name+Aadhaar
//    for mother AND father, each independently fillable) plus a legal
//    guardian as a third alternative -- there is no single "hofName"/
//    "hofAadhaar" pair like Form 1/3 have, so this schema uses its own
//    motherName/motherAadhaar, fatherName/fatherAadhaar, guardianName/
//    guardianAadhaar paths instead. recordShape.sharedTop therefore does
//    NOT include any of them -- "reuse address" from a Form 1/3 queue entry
//    seeds address + POA only, not HoF details, since there's no principled
//    automatic mapping from one adult HoF to a specific parent slot here.
//  - "Relationship with the child" is genuinely multi-select ("Mother
//    AND/OR Father OR Legal guardian" -- both parents can be ticked
//    together), unlike Form 1/3's mutually-exclusive relationship. Modeled
//    as a checkboxGroup, not a radioGroup; confirmed correct against the
//    real PDF with tools/proof.py (both mother and father ticks rendered
//    simultaneously).
//  - Page size is A4 (210x297mm), not Letter -- the engine and canvas
//    sizing already handle this per-template, no schema-level change
//    needed for that.
window.SCHEMA_FORM5_EN = {
  id: "form5-en",
  templateGlobal: "FORM5_EN_TEMPLATE",
  focusFieldId: "f5-name",

  fields: [
    { id: "purpose", widget: "radioGroup", name: "f5-purpose", path: "purpose",
      templateMap: { enrolment: "purpose_enrolment", update: "purpose_update" } },
    { id: "status", widget: "radioGroup", name: "f5-status", path: "status",
      templateMap: { resident: "status_resident", nri: "status_nri" } },

    { id: "name", widget: "text", domId: "f5-name", path: "name", template: "name", role: "name" },
    { id: "gender", widget: "radioGroup", name: "f5-gender", path: "gender",
      templateMap: { female: "gender_female", male: "gender_male", third: "gender_third" } },
    { id: "dob", widget: "text", domId: "f5-dob", path: "dob", template: "dob",
      digits: true, maxlen: 8, role: "dob" },
    { id: "age", widget: "text", domId: "f5-age", path: "age", template: "age",
      digits: true, maxlen: 3 },
    { id: "dobBasis", widget: "radioGroup", name: "f5-dobBasis", path: "dobBasis",
      templateMap: { verified: "dob_verified", declared: "dob_declared", approximate: "dob_approximate" } },
    { id: "email", widget: "text", domId: "f5-email", path: "email", template: "email",
      requiredWhen: { path: "status", equals: "nri" } },
    { id: "mobile", widget: "text", domId: "f5-mobile", path: "mobile", template: "mobile",
      digits: true, maxlen: 10 },

    { id: "basis", widget: "radioGroup", name: "f5-basis", path: "basis",
      templateMap: { document: "basis_document", hof: "basis_hof" } },

    { id: "addrHouse", widget: "text", domId: "f5-house", path: "addr.house", template: "addr_house" },
    { id: "addrStreet", widget: "text", domId: "f5-street", path: "addr.street", template: "addr_street" },
    { id: "addrLandmark", widget: "text", domId: "f5-landmark", path: "addr.landmark", template: "addr_landmark" },
    { id: "addrWard", widget: "text", domId: "f5-ward", path: "addr.ward", template: "addr_ward" },
    { id: "addrArea", widget: "text", domId: "f5-area", path: "addr.area", template: "addr_area" },
    { id: "addrVillage", widget: "text", domId: "f5-village", path: "addr.village", template: "addr_village" },
    { id: "addrPostOffice", widget: "text", domId: "f5-post-office", path: "addr.postOffice", template: "addr_post_office" },
    { id: "addrPin", widget: "text", domId: "f5-pin", path: "addr.pin", template: "addr_pin",
      digits: true, maxlen: 6 },
    { id: "addrSubdistrict", widget: "text", domId: "f5-subdistrict", path: "addr.subdistrict", template: "addr_subdistrict" },
    { id: "addrDistrict", widget: "text", domId: "f5-district", path: "addr.district", template: "addr_district" },
    { id: "addrState", widget: "text", domId: "f5-state", path: "addr.state", template: "addr_state" },

    { id: "docPoi", widget: "text", domId: "f5-poi", path: "docPoi", template: "doc_poi" },
    { id: "docPoa", widget: "text", domId: "f5-poa", path: "docPoa", template: "doc_poa" },
    { id: "docPdb", widget: "text", domId: "f5-pdb", path: "docPdb", template: "doc_pdb" },

    { id: "motherName", widget: "text", domId: "f5-mother-name", path: "motherName", template: "mother_name" },
    { id: "motherAadhaar", widget: "text", domId: "f5-mother-aadhaar", path: "motherAadhaar",
      template: ["mother_aadhaar_1", "mother_aadhaar_2", "mother_aadhaar_3"], split: 4,
      digits: true, maxlen: 12, role: "aadhaar" },
    { id: "fatherName", widget: "text", domId: "f5-father-name", path: "fatherName", template: "father_name" },
    { id: "fatherAadhaar", widget: "text", domId: "f5-father-aadhaar", path: "fatherAadhaar",
      template: ["father_aadhaar_1", "father_aadhaar_2", "father_aadhaar_3"], split: 4,
      digits: true, maxlen: 12, role: "aadhaar" },
    { id: "otherParentAbsent", widget: "radioGroup", name: "f5-other-parent-absent", path: "otherParentAbsent",
      templateMap: { yes: "other_parent_absent_yes", no: "other_parent_absent_no" } },
    { id: "guardianName", widget: "text", domId: "f5-guardian-name", path: "guardianName", template: "guardian_name" },
    { id: "guardianAadhaar", widget: "text", domId: "f5-guardian-aadhaar", path: "guardianAadhaar",
      template: ["guardian_aadhaar_1", "guardian_aadhaar_2", "guardian_aadhaar_3"], split: 4,
      digits: true, maxlen: 12, role: "aadhaar" },
    { id: "relationship", widget: "checkboxGroup", name: "f5-relationship", path: "relationship",
      templateMap: { mother: "rel_mother", father: "rel_father", guardian: "rel_guardian" } },
    { id: "docPor", widget: "text", domId: "f5-por", path: "docPor", template: "doc_por" },

    { id: "applicantAadhaar", widget: "text", domId: "f5-applicant-aadhaar", path: "applicantAadhaar",
      template: ["applicant_aadhaar_1", "applicant_aadhaar_2", "applicant_aadhaar_3"], split: 4,
      digits: true, maxlen: 12, role: "aadhaar", dupCheck: true },
    { id: "updates", widget: "checkboxGroup", name: "f5-upd", path: "updates",
      templateMap: {
        biometric: "upd_biometric", name: "upd_name", dob: "upd_dob", gender: "upd_gender",
        address: "upd_address", mobile: "upd_mobile", email: "upd_email", poiPoa: "upd_poi_poa",
      } },
  ],

  recordShape: {
    addr: ["house", "street", "landmark", "ward", "area", "village", "postOffice",
      "pin", "subdistrict", "district", "state"],
    sharedTop: ["docPoa"],
    aadhaarPaths: ["motherAadhaar", "fatherAadhaar", "guardianAadhaar", "applicantAadhaar"],
  },

  summary: { namePath: "name", subtitlePath: "relationship", aadhaarPath: "applicantAadhaar" },
};
