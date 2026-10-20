# Future Skills Radar: reference provenance

Reference version: `radar-2026q2-v1`. Sources retrieved on 20 October 2026.
Only public reference facts are persisted in `lib/radar-data/`; no CV material is part of these modules.

## Verified official releases and tables

- [DOSM Q1 2026 release](https://www.dosm.gov.my/portal-main/release-content/big-data-analytics-job-market-insights-q12026), published **25 June 2026**.
- [DOSM Q2 2026 release](https://www.dosm.gov.my/portal-main/release-content/big-data-analytics-job-market-insights-q22026), published **18 August 2026**.
- [Q1 data workbook](https://www.dosm.gov.my/portal-main/release-document-log?release_document_id=19819).
- [Q2 data workbook](https://www.dosm.gov.my/portal-main/release-document-log?release_document_id=20742).

Both data attachments were accessible, fetched and inspected. The workbook's **Table 2: Number of Job Offerings Advertised Online by Major Group Occupation** supplies the following mutually exclusive major-group rows. Use quarterly columns, not monthly or annual columns:

| Major group | Q1 2026 | Q2 2026 |
|---|---:|---:|
| 1 Managers | 99,447 | 87,950 |
| 2 Professionals | 315,768 | 285,907 |
| 3 Technicians and Associate Professionals | 93,987 | 86,512 |
| 4 Clerical Support Workers | 48,784 | 40,408 |
| 5 Service and Sales Workers | 42,094 | 32,511 |
| **Represented subset 1–5** | **600,080** | **533,288** |
| Reported all-group total | 626,861 | 555,509 |

Groups 6–9, retained only for reconciliation, are respectively Q1: 239, 6,094, 16,378, 4,070 and Q2: 101, 4,558, 12,916, 4,646. All nine rows reconcile exactly to both reported totals. No group count is inferred from a residual. There are no missing group 1–5 counts in this version.

Q1 values agree across the Q1 and Q2 workbooks. The release-page text agrees with workbook totals and groups 1–3. The [Q1 press statement](https://www.dosm.gov.my/portal-main/release-document-log?release_document_id=19887) also shows groups 4–5.

**Source conflict:** the [Q2 press statement](https://www.dosm.gov.my/portal-main/release-document-log?release_document_id=20743) Exhibit 1 is headed Q2 2026 & Q1 2026 but includes several earlier-period comparison figures (for example Managers 88,080 rather than Q1's 99,447). Its hottest-job exhibit also conflicts with narrative figures. Neither exhibit's comparison figures are used. Workbook Table 2 is the reproducible authority for group comparisons. No narrow-role counts are exported or allocated to our role catalogue. If later releases revise this data, review explicitly and publish a new module/version.

Quarter-on-quarter demand is `(current − previous) / previous × 100`. Missing or zero denominators must be unavailable, not zero growth. Area must always use current group counts, independently of colour, CV matches or selected roles.

**Attribution:** Source: Department of Statistics Malaysia.

These are job offerings advertised online on major private recruitment platforms, not all employment, unique vacancies or all Malaysian vacancies. This is not the Employment Statistics series already used by the legacy report. No OpenDOSM API endpoint for this series was verified in this work; the attachments are public reference snapshots, not a live feed.

## MASCO mappings

[Ministry of Human Resources, MASCO 2020 English](https://emasco.mohr.gov.my/system-api/storage/uploads/masco_2020_en.pdf) was fetched and inspected directly (PDF text extraction plus unit-group headings and examples). The introduction distinguishes one-digit major groups, four-digit unit groups and six-digit occupations. The catalogue explicitly labels which mapping level is used.

Verified unit headings:

- Group 1: 1121 Managing Directors and Chief Executives; 1211 Finance Managers; 1212 Human Resource Managers; 1221 Sales and Marketing Managers; **1511** Information and Communications Technology Managers.
- Group 2: 2141 Industrial and Production Engineers; 2144 Mechanical Engineers; 2411 Accountants and Auditors; 2421 Management and Organisation Analysts; 2431 Advertising and Marketing Professionals; 2511 Computer Systems Analysts; 2512 Software Developers; 2522 Information Technology System Administrators; **2531 Cybersecurity Professionals**.
- Unit 2524 Data Professionals lists **2524-01 Data Scientist** and **2524-03 Data Analyst** as exact occupations (printed page 82).
- Group 3: 3112 Civil Engineering Technicians; 3115 Mechanical Engineering Technicians; 3313 Accounting and Auditing Associate Professionals; 3341 Administrative Associate Professionals; 3512 Information and Communications Technology User Support Technicians; 3513 Computer Network and Systems Technicians.
- Group 4: 4111 General Office Clerks; 4132 Data Entry Clerks; 4222 Contact Centre Information Clerks; 4311 Accounting and Book-Keeping Clerks; 4321 Stock Clerks.
- Group 5: 5121 Cooks; 5223 Shop Sales Assistants; 5231 Cashiers and Ticket Clerks.

These are Malaysian mappings, not blindly substituted ISCO codes. In particular, do not replace ICT manager 1511 with ISCO 1330 or cybersecurity 2531 with an assumed generic systems code.

**Edition limitation:** MASCO 2020 is verified for the catalogue. The accessible JMI release pages/workbooks and press material do not explicitly state which MASCO edition underlies their statistics. Do not claim this statistical edition was verified. The chart joins only broad major-group labels 1–5, not narrow occupation totals.

Legacy mappings are limited to clear corresponding titles: Finance Manager, ICT Manager, Industrial & Production Engineer, Mechanical Engineer, Software Developer, IT System Administrator, Data Scientist and Data Analyst. Several are unit-family mappings, not claims that a legacy individual title is an exact six-digit code. No forced mapping is made for ambiguous Business Data Analyst, Manufacturing Professional, Project Coordinator, Marketing Coordinator, Information Security Officer, or compound Cybersecurity Analyst/Specialist titles.

## Editorial material, not official statistics

The 30 roles are a curated exploration subset spanning groups 1–5. They are not a ranking, a complete occupation list, an entry-level shortlist, or a claim that all have measured high demand. Managers are marked later-career destinations; skill similarity does not establish managerial readiness, professional registration or eligibility.

Skills and conservative English/Malay/Chinese aliases are a fixed editorial matching taxonomy. Product names retain their established names. Skill labels describe competencies, not a translation of a DOSM skills standard. An alias alone does not establish proficient use: downstream matching must retain CV evidence, detect negation/learning intent and avoid overinterpreting short strings.

SDG explanations describe conditional task-level contributions, not certified impact, an official DOSM SDG classification or a claim about every role in a highlighted major group. The learn/do/evidence exercises are role-specific editorial suggestions grounded in the MASCO task descriptions; they are not official course recommendations, credentials, job guarantees or substitutes for regulated training.

All exposure estimates are **draft and unreviewed**. `reviewedBy` and `reviewedAt` are null. No explicit human sign-off exists. The exported rubric describes the 0–10 draft task-exposure heuristic and its limitations. Never present these scores as reviewed or as job-loss probabilities; group AI colours must remain neutral. Changing status to reviewed requires a named human reviewer, explicit approval and review date, with a new catalogue version.

## Reproduce validation

From the workspace root, using the existing TypeScript installation:

```sh
pnpm exec tsc lib/radar-data/validate.ts --target ES2022 --module commonjs --moduleResolution node --strict --skipLibCheck --outDir /tmp/radar-reference-check
node /tmp/radar-reference-check/validate.js
```

This checks exact group values, period totals and reconciliation, 30 unique role/code mappings, skill references, major-group prefixes, managers' later-career status, SDG/pathway completeness and the absence of falsely reviewed scores. It is an integrity test, not independent proof of editorial quality.

Optional online source-byte drift check (Node 20+, no packages or Secrets):

```sh
node lib/radar-data/verify-sources.mjs
```

It fetches the official attachments and compares SHA-256 hashes with the inspected versions. HTTP failure or changed bytes is an explicit error requiring manual source review, not an automatic refresh. For manual reproduction, download each URL and run `sha256sum`; inspect spreadsheets with Excel/LibreOffice and the PDF with a viewer or `pdftotext -layout`.

| Source | SHA-256 of retrieved official bytes |
|---|---|
| Q1 workbook | `cbff5d0a62df0a92a6f018d93ba83a5e9b1727e6ec21ecd6b2f33f6ab5ddbb7f` |
| Q2 workbook | `965f2f20bcb33425eb43eac7f9edfcff186e7fa92048b8b26f8ee8bbe5d25764` |
| MASCO 2020 English PDF | `4ab3736cd6890afcad3ab2d5a87499e66c468f749cc6ed4ea96b22a20c2fc97e` |

No paid service, live embedding endpoint or application workflow is required for these public reference checks.
