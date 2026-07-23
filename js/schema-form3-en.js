// Declarative field schema for Form 3 (English) -- child aged 5-18. Same
// structure as Form 1 (js/schema-form1-en.js) except relationship has only
// 3 options (Mother/Father/Legal guardian, no Spouse/Child/Sibling -- this
// form is for a minor, not an adult with their own family).
window.SCHEMA_FORM3_EN = {
  id: "form3-en",
  templateGlobal: "FORM3_EN_TEMPLATE",
  focusFieldId: "f3-name",

  fields: [
    { id: "purpose", widget: "radioGroup", name: "f3-purpose", path: "purpose",
      templateMap: { enrolment: "purpose_enrolment", update: "purpose_update" } },
    { id: "status", widget: "radioGroup", name: "f3-status", path: "status",
      templateMap: { resident: "status_resident", nri: "status_nri" } },

    { id: "name", widget: "text", domId: "f3-name", path: "name", template: "name", role: "name" },
    { id: "gender", widget: "radioGroup", name: "f3-gender", path: "gender",
      templateMap: { female: "gender_female", male: "gender_male", third: "gender_third" } },
    { id: "dob", widget: "text", domId: "f3-dob", path: "dob", template: "dob",
      digits: true, maxlen: 8, role: "dob" },
    { id: "age", widget: "text", domId: "f3-age", path: "age", template: "age",
      digits: true, maxlen: 3 },
    { id: "dobBasis", widget: "radioGroup", name: "f3-dobBasis", path: "dobBasis",
      templateMap: { verified: "dob_verified", declared: "dob_declared", approximate: "dob_approximate" } },
    { id: "email", widget: "text", domId: "f3-email", path: "email", template: "email",
      requiredWhen: { path: "status", equals: "nri" } },
    { id: "mobile", widget: "text", domId: "f3-mobile", path: "mobile", template: "mobile",
      digits: true, maxlen: 10 },

    { id: "basis", widget: "radioGroup", name: "f3-basis", path: "basis",
      templateMap: { document: "basis_document", hof: "basis_hof" } },

    { id: "addrHouse", widget: "text", domId: "f3-house", path: "addr.house", template: "addr_house" },
    { id: "addrStreet", widget: "text", domId: "f3-street", path: "addr.street", template: "addr_street" },
    { id: "addrLandmark", widget: "text", domId: "f3-landmark", path: "addr.landmark", template: "addr_landmark" },
    { id: "addrWard", widget: "text", domId: "f3-ward", path: "addr.ward", template: "addr_ward" },
    { id: "addrArea", widget: "text", domId: "f3-area", path: "addr.area", template: "addr_area" },
    { id: "addrVillage", widget: "text", domId: "f3-village", path: "addr.village", template: "addr_village" },
    { id: "addrPostOffice", widget: "text", domId: "f3-post-office", path: "addr.postOffice", template: "addr_post_office" },
    { id: "addrPin", widget: "text", domId: "f3-pin", path: "addr.pin", template: "addr_pin",
      digits: true, maxlen: 6 },
    { id: "addrSubdistrict", widget: "text", domId: "f3-subdistrict", path: "addr.subdistrict", template: "addr_subdistrict" },
    { id: "addrDistrict", widget: "text", domId: "f3-district", path: "addr.district", template: "addr_district" },
    { id: "addrState", widget: "text", domId: "f3-state", path: "addr.state", template: "addr_state" },

    { id: "docPoi", widget: "text", domId: "f3-poi", path: "docPoi", template: "doc_poi" },
    { id: "docPoa", widget: "text", domId: "f3-poa", path: "docPoa", template: "doc_poa" },
    { id: "docPdb", widget: "text", domId: "f3-pdb", path: "docPdb", template: "doc_pdb" },

    { id: "hofName", widget: "text", domId: "f3-hof-name", path: "hofName", template: "hof_name" },
    { id: "hofAadhaar", widget: "text", domId: "f3-hof-aadhaar", path: "hofAadhaar",
      template: ["hof_aadhaar_1", "hof_aadhaar_2", "hof_aadhaar_3"], split: 4,
      digits: true, maxlen: 12, role: "aadhaar" },
    { id: "relationship", widget: "radioGroup", name: "f3-relationship", path: "relationship",
      templateMap: { mother: "rel_mother", father: "rel_father", guardian: "rel_guardian" } },
    { id: "docPor", widget: "text", domId: "f3-por", path: "docPor", template: "doc_por" },

    { id: "applicantAadhaar", widget: "text", domId: "f3-applicant-aadhaar", path: "applicantAadhaar",
      template: ["applicant_aadhaar_1", "applicant_aadhaar_2", "applicant_aadhaar_3"], split: 4,
      digits: true, maxlen: 12, role: "aadhaar", dupCheck: true },
    { id: "updates", widget: "checkboxGroup", name: "f3-upd", path: "updates",
      templateMap: {
        biometric: "upd_biometric", name: "upd_name", dob: "upd_dob", gender: "upd_gender",
        address: "upd_address", mobile: "upd_mobile", email: "upd_email", poiPoa: "upd_poi_poa",
      } },
  ],

  recordShape: {
    addr: ["house", "street", "landmark", "ward", "area", "village", "postOffice",
      "pin", "subdistrict", "district", "state"],
    sharedTop: ["docPoa", "hofName", "hofAadhaar"],
    aadhaarPaths: ["hofAadhaar", "applicantAadhaar"],
  },

  summary: { namePath: "name", subtitlePath: "relationship", aadhaarPath: "applicantAadhaar" },
};
