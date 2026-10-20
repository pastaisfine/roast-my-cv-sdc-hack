/** Factual transcription of DOSM JMI data attachment Table 2; see docs/radar-sources.md. */
export const version = "radar-2026q2-v1";

export const sourceUrls = {
  q1: "https://www.dosm.gov.my/portal-main/release-content/big-data-analytics-job-market-insights-q12026",
  q2: "https://www.dosm.gov.my/portal-main/release-content/big-data-analytics-job-market-insights-q22026",
  q1Data: "https://www.dosm.gov.my/portal-main/release-document-log?release_document_id=19819",
  q2Data: "https://www.dosm.gov.my/portal-main/release-document-log?release_document_id=20742",
  q1Press: "https://www.dosm.gov.my/portal-main/release-document-log?release_document_id=19887",
  q2Press: "https://www.dosm.gov.my/portal-main/release-document-log?release_document_id=20743",
  masco: "https://emasco.mohr.gov.my/system-api/storage/uploads/masco_2020_en.pdf",
} as const;

export const groups = [
  { id: "1", title: "Managers", current: 87950, previous: 99447, missingReason: null },
  { id: "2", title: "Professionals", current: 285907, previous: 315768, missingReason: null },
  { id: "3", title: "Technicians and Associate Professionals", current: 86512, previous: 93987, missingReason: null },
  { id: "4", title: "Clerical Support Workers", current: 40408, previous: 48784, missingReason: null },
  { id: "5", title: "Service and Sales Workers", current: 32511, previous: 42094, missingReason: null },
] satisfies { id: string; title: string; current: number | null; previous: number | null; missingReason: string | null }[];

export const snapshot = {
  currentPeriod: "Q2 2026",
  previousPeriod: "Q1 2026",
  currentPublished: "2026-08-18",
  previousPublished: "2026-06-25",
  currentTotal: 555509,
  previousTotal: 626861,
  sources: [
    { url: sourceUrls.q2, title: "DOSM Job Market Insights Q2 2026 (18 August 2026)" },
    { url: sourceUrls.q1, title: "DOSM Job Market Insights Q1 2026 (25 June 2026)" },
    { url: sourceUrls.q2Data, title: "Q2 2026 data attachment — Table 2, occupation groups" },
    { url: sourceUrls.q1Data, title: "Q1 2026 data attachment — Table 2, occupation groups" },
    { url: sourceUrls.masco, title: "Ministry of Human Resources — MASCO 2020, English" },
  ],
  coverageNote: "Area represents 533,288 online job offerings in MASCO major groups 1–5 (of 555,509 reported in Q2 2026). Q1 subset: 600,080 of 626,861. These are offerings advertised on major private recruitment platforms, not total employment, unique vacancies, or complete Malaysian vacancy coverage. The 30 curated occupations are examples within these groups, not an allocation of group totals.",
  attribution: "Source: Department of Statistics Malaysia",
  comparisonNote: "Quarter-on-quarter change = (Q2 2026 − Q1 2026) / Q1 2026 × 100, using the same occupation-group rows in Table 2 of both data attachments. Q1 counts agree across the two workbooks. The Q2 press PDF Exhibit 1 contains conflicting prior-quarter labels/values, so its comparison figures are not used. MASCO 2020 mappings are independently verified catalogue references; the accessible JMI pages/workbooks do not explicitly identify the classification edition.",
};

/** Other mutually exclusive rows in Table 2, retained for reproducible reconciliation only. */
export const excludedGroups = [
  { id: "6", previous: 239, current: 101 },
  { id: "7", previous: 6094, current: 4558 },
  { id: "8", previous: 16378, current: 12916 },
  { id: "9", previous: 4070, current: 4646 },
];
