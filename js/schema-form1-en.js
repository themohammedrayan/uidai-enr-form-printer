// Declarative field schema for Form 1 (English) -- the wiring/record layer
// consumed generically by js/schema-runtime.js. templateGlobal names the
// window property holding this form's field-coordinate template
// (js/template-form1-en.js).
window.SCHEMA_FORM1_EN = {
  id: "form1-en",
  templateGlobal: "FORM1_EN_TEMPLATE",
  focusFieldId: "f-name",

  fields: [
    { id: "purpose", widget: "radioGroup", name: "purpose", path: "purpose",
      templateMap: { enrolment: "purpose_enrolment", update: "purpose_update" } },
    { id: "status", widget: "radioGroup", name: "status", path: "status",
      templateMap: { resident: "status_resident", nri: "status_nri" } },

    { id: "name", widget: "text", domId: "f-name", path: "name", template: "name", role: "name" },
    { id: "gender", widget: "radioGroup", name: "gender", path: "gender",
      templateMap: { female: "gender_female", male: "gender_male", third: "gender_third" } },
    { id: "dob", widget: "text", domId: "f-dob", path: "dob", template: "dob",
      digits: true, maxlen: 8, role: "dob" },
    { id: "age", widget: "text", domId: "f-age", path: "age", template: "age",
      digits: true, maxlen: 3 },
    { id: "dobBasis", widget: "radioGroup", name: "dobBasis", path: "dobBasis",
      templateMap: { verified: "dob_verified", declared: "dob_declared", approximate: "dob_approximate" } },
    { id: "email", widget: "text", domId: "f-email", path: "email", template: "email",
      requiredWhen: { path: "status", equals: "nri" } },
    { id: "mobile", widget: "text", domId: "f-mobile", path: "mobile", template: "mobile",
      digits: true, maxlen: 10 },

    { id: "basis", widget: "radioGroup", name: "basis", path: "basis",
      templateMap: { document: "basis_document", hof: "basis_hof" } },

    { id: "addrHouse", widget: "text", domId: "f-house", path: "addr.house", template: "addr_house" },
    { id: "addrStreet", widget: "text", domId: "f-street", path: "addr.street", template: "addr_street" },
    { id: "addrLandmark", widget: "text", domId: "f-landmark", path: "addr.landmark", template: "addr_landmark" },
    { id: "addrWard", widget: "text", domId: "f-ward", path: "addr.ward", template: "addr_ward" },
    { id: "addrArea", widget: "text", domId: "f-area", path: "addr.area", template: "addr_area" },
    { id: "addrVillage", widget: "text", domId: "f-village", path: "addr.village", template: "addr_village" },
    { id: "addrPostOffice", widget: "text", domId: "f-post-office", path: "addr.postOffice", template: "addr_post_office" },
    { id: "addrPin", widget: "text", domId: "f-pin", path: "addr.pin", template: "addr_pin",
      digits: true, maxlen: 6 },
    { id: "addrSubdistrict", widget: "text", domId: "f-subdistrict", path: "addr.subdistrict", template: "addr_subdistrict" },
    { id: "addrDistrict", widget: "text", domId: "f-district", path: "addr.district", template: "addr_district" },
    { id: "addrState", widget: "text", domId: "f-state", path: "addr.state", template: "addr_state" },

    { id: "docPoi", widget: "text", domId: "f-poi", path: "docPoi", template: "doc_poi" },
    { id: "docPoa", widget: "text", domId: "f-poa", path: "docPoa", template: "doc_poa" },
    { id: "docPdb", widget: "text", domId: "f-pdb", path: "docPdb", template: "doc_pdb" },

    { id: "hofName", widget: "text", domId: "f-hof-name", path: "hofName", template: "hof_name" },
    { id: "hofAadhaar", widget: "text", domId: "f-hof-aadhaar", path: "hofAadhaar",
      template: ["hof_aadhaar_1", "hof_aadhaar_2", "hof_aadhaar_3"], split: 4,
      digits: true, maxlen: 12, role: "aadhaar" },
    { id: "relationship", widget: "radioGroup", name: "relationship", path: "relationship",
      templateMap: {
        mother: "rel_mother", father: "rel_father", guardian: "rel_guardian",
        spouse: "rel_spouse", child: "rel_child", sibling: "rel_sibling",
      } },
    { id: "docPor", widget: "text", domId: "f-por", path: "docPor", template: "doc_por" },

    { id: "applicantAadhaar", widget: "text", domId: "f-applicant-aadhaar", path: "applicantAadhaar",
      template: ["applicant_aadhaar_1", "applicant_aadhaar_2", "applicant_aadhaar_3"], split: 4,
      digits: true, maxlen: 12, role: "aadhaar", dupCheck: true },
    { id: "updates", widget: "checkboxGroup", name: "upd", path: "updates",
      templateMap: {
        biometric: "upd_biometric", name: "upd_name", dob: "upd_dob", gender: "upd_gender",
        address: "upd_address", mobile: "upd_mobile", email: "upd_email", poiPoa: "upd_poi_poa",
      } },
  ],

  // Sub-shapes shared with other forms' schemas, so cross-form "reuse
  // address" and duplicate-Aadhaar checks work without per-pair adapters.
  recordShape: {
    addr: ["house", "street", "landmark", "ward", "area", "village", "postOffice",
      "pin", "subdistrict", "district", "state"],
    sharedTop: ["docPoa", "hofName", "hofAadhaar"],
    aadhaarPaths: ["hofAadhaar", "applicantAadhaar"],
  },

  summary: { namePath: "name", subtitlePath: "relationship", aadhaarPath: "applicantAadhaar" },
};
