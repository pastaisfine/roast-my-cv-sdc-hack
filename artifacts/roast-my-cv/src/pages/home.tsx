import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ArrowDown, ArrowRight, Check, CircleHelp, FileText, LockKeyhole, ShieldCheck, Sparkles, Upload, X } from "lucide-react";
import { analyzeCv, labourReference, scoreMethod, type Assessment, type RankedRole } from "@/lib/analyze";
import { mycolUrl } from "@/lib/roles";
import { matchRadar, type RadarMatch } from "@workspace/api-client-react";
import { keywordMatch } from "@workspace/radar-data/matching";
import { RadarSection } from "@/components/radar/radar-section";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const SAMPLE_CV = `SYNTHETIC SAMPLE — AINA
Fictional candidate, Malaysia | aina@example.com

PROFILE
Business Analytics graduate from Universiti Malaya (CGPA 3.62). Curious, practical analyst who enjoys turning messy information into useful decisions. Seeking an entry-level data or business analyst role.

EDUCATION
Bachelor of Business Analytics, Universiti Malaya | 2022–2025
Relevant work: statistics, database management, business analysis, research methods

PROJECTS
Retail sales dashboard | Final year project
• Cleaned and analysed 8,400 sales records using Excel and SQL.
• Built a Power BI dashboard to track monthly revenue, product mix and customer retention.
• Presented three recommendations to a panel of lecturers and a local retailer.

Customer churn analysis | University analytics society
• Used Python and pandas to explore a synthetic customer dataset and visualise churn patterns.
• Collaborated with four students; documented findings and presented results.

EXPERIENCE
Marketing intern, Kecil Studio | Jan–Apr 2025
• Coordinated social media campaign calendar and weekly reporting.
• Prepared content, tracked campaign analytics and shared performance updates with stakeholders.
• Improved newsletter click-through rate by 14% through A/B testing.

SKILLS
Excel, SQL, Power BI, Python, pandas, statistics, data visualisation, dashboard design, business analysis, stakeholder communication, presentation, project coordination

ACTIVITIES
Volunteer tutor, Projek Buku | 2023–2024. Coordinated a small team and tracked weekly attendance.`;

const MAX_CHARS = 12000;
const localMatch = (text: string) => keywordMatch(text.slice(0, MAX_CHARS), "keyword-local", "Matched in this browser with the fixed skills list. Nothing was sent.");
const MODE_LABEL: Record<RadarMatch["mode"], string> = { "keyword-local": "Keyword match · in this browser", "keyword-fallback": "Keyword fallback · server", semantic: "Semantic match · server" };

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

async function extractLocalPdf(file: File) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    useSystemFonts: true,
  });
  try {
    const document = await loadingTask.promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      page.cleanup();
    }
    return pages.join("\n").replace(/\s+/g, " ").trim();
  } finally {
    await loadingTask.destroy();
  }
}

function RankRows({ rows, prefix }: { rows: RankedRole[]; prefix: string }) {
  return <div>{rows.map((item, index) => <div className="role-card" key={item.role.title} data-testid={`role-result-${prefix}-${index + 1}`}>
    <span className="role-rank">{String(index + 1).padStart(2, "0")}</span>
    <div>
      <div className="role-title" data-testid={`role-title-${prefix}-${index + 1}`}>{item.role.title}</div>
      <div className="role-meta">{item.role.sector} · {item.matched.length ? `Matched: ${item.matched.slice(0, 4).join(", ")}` : "Start with one relevant proof project"}</div>
    </div>
    <div className="fit-score">{item.score}<small>/100</small>{item.role.mycolCritical && <span className="critical-badge"><Check size={10} /> MyCOL critical</span>}</div>
  </div>)}</div>;
}

function Report({ assessment, radar, radarPending, sentRemotely }: { assessment: Assessment; radar: RadarMatch | null; radarPending: boolean; sentRemotely: boolean }) {
  const top = assessment.rankedRoles[0];
  const sdgs = top?.role.sdgs ?? [];
  return <div aria-live="polite" data-testid="analysis-report">
    <div className="report-actions"><span className="section-kicker" data-testid="status-analysis">{sentRemotely ? "Readiness scored locally · radar text sent to server with consent" : "Private, local analysis · no upload"}</span></div>
    <div className="report-top">
      <section className="score-card" aria-label="Readiness score">
        <div className="score-label">CV readiness / 100</div>
        <div className="score-value" data-testid="score-readiness">{assessment.score}<small> / 100</small></div>
        <div className="score-verdict">{assessment.score >= 70 ? "A solid base. Now make the evidence sharper." : assessment.score >= 45 ? "Promising ingredients. The proof needs to be louder." : "A starting point, not a verdict. Let's make the next step clear."}</div>
      </section>
      <section className="score-explain" aria-label="Score explanation">
        <h3>Why this number?</h3>
        <div className="score-row"><span>Distinct relevant keywords found</span><strong data-testid="score-matched-count">{assessment.matchedSkills.length} found</strong></div>
        <div className="meter"><div className="meter-fill" style={{ width: `${Math.min(100, assessment.matchedSkills.length * 7)}%` }} /></div>
        <div className="score-row"><span>CV text length</span><strong>{assessment.text.length > 550 ? "+6 points" : "No length bonus"}</strong></div>
        <p className="input-hint" style={{ margin: "10px 0 0" }}>A keyword is a clue, not proof of skill. Recruiters will look for what you actually did.</p>
        <details className="score-method" data-testid="score-method">
          <summary>Show the score formula</summary>
          <p>{scoreMethod}</p>
        </details>
      </section>
    </div>

    <section className="report-section">
      <div className="section-head"><h3>What your CV signals</h3><span className="section-kicker">Keyword matches</span></div>
      <p className="section-intro">Transparent matching against a small role library. Add a skill only if you can back it up with an example.</p>
      <div className="split-label">Present in your text · {assessment.matchedSkills.length}</div>
      <div className="skill-list" data-testid="list-matched-skills">{assessment.matchedSkills.slice(0, 16).map((skill) => <span className="skill-chip" key={skill} data-testid={`skill-match-${skill.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}><Check size={11} />{skill}</span>)}</div>
      <div className="split-label">Potential next skills · not detected</div>
      <div className="skill-list" data-testid="list-skill-gaps">{assessment.gaps.slice(0, 8).map((skill) => <span className="skill-chip gap" key={skill} data-testid={`skill-gap-${skill.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}><ArrowRight size={11} />{skill}</span>)}</div>
    </section>

    <section className="report-section">
      <div className="section-head"><h3>Roles worth exploring</h3><span className="section-kicker">Ranked by skill overlap</span></div>
      <p className="section-intro">These are possible directions, not a promise of a job. “MyCOL critical” marks only role titles verified in MyCOL 2024/2025; it is not a vacancy count.</p>
      <RankRows rows={assessment.rankedRoles.slice(0, 4)} prefix="primary" />
    </section>

    <RadarSection match={radar} pending={radarPending} modeLabel={radar ? MODE_LABEL[radar.mode] : "Not matched yet"} />
    {radar && (radar.mode !== "keyword-local" || radar.truncated) && <p className="limitations" style={{ marginTop: -6, marginBottom: 16 }} data-testid="text-radar-reason"><strong>Radar matching:</strong> {radar.reason}{radar.truncated ? " Partial evidence only: analysis is bounded to 12,000 characters and 48 clauses; clauses over 350 characters are skipped. Some skills may be missed." : ""}{radar.mode === "semantic" && !radar.liveVerified ? " Live endpoint not yet verified." : ""}</p>}

    <section className="report-section">
      <div className="section-head"><h3>Your next 30 days</h3><span className="section-kicker">A practical pathway</span></div>
      <p className="section-intro">Based on the top legacy role match above (radar role pathways live inside the radar). Use it as a direction, then build evidence you can show.</p>
      <div className="pathway">{assessment.pathway.map((step, index) => <article className="path-step" key={step.phase} data-testid={`pathway-step-${index + 1}`}>
        <div className="path-num">{step.phase}</div><h4>{step.title}</h4>
        <p><strong>Learn:</strong> {step.learn}</p><p style={{ marginTop: 5 }}><strong>Do:</strong> {step.do}</p>
        <span className="path-evidence">Evidence → {step.evidence}</span>
      </article>)}</div>
    </section>

    <section className="report-section">
      <div className="section-head"><h3>Two possible AI futures</h3><span className="section-kicker">Product heuristics, not forecasts</span></div>
      <p className="section-intro">Same CV, two assumptions. Treat the change as a prompt to diversify evidence, not a prediction about hiring.</p>
      <div className="scenario-grid" data-testid="scenario-comparison">{assessment.scenarios.map((scenario, index) => <article className={`scenario-card ${index === 0 ? "co" : "auto"}`} key={scenario.label} data-testid={`scenario-${index === 0 ? "copilot" : "automation"}`}>
        <div className="scenario-head"><h4>{scenario.label}</h4><span>Top matches</span></div>
        {scenario.roles.slice(0, 3).map((item, rank) => <div className="scenario-role" key={item.role.title} data-testid={`scenario-role-${index}-${rank}`}><span>{rank + 1}. {item.role.title}</span><strong>{item.score}</strong></div>)}
        <p className="assumption">{scenario.note}</p>
      </article>)}</div>
    </section>

    <section className="report-section">
      <div className="section-head"><h3>Where this work could connect</h3><span className="section-kicker">Potential SDG relevance</span></div>
      <p className="section-intro">Based on the top role’s typical contribution. These are potential links only, not certification or a claim of impact.</p>
      <div className="sdg-list" data-testid="list-sdg-links">{sdgs.map((sdg) => <div className="sdg-pill" key={sdg.number} data-testid={`sdg-link-${sdg.number}`}><strong>SDG {String(sdg.number).padStart(2, "0")} · {sdg.title}</strong>{sdg.relevance}</div>)}</div>
    </section>

    <section className="report-section">
      <div className="section-head"><h3>Evidence behind the context</h3><span className="section-kicker">Dated sources</span></div>
      <div className="snapshot-strip" data-testid="labour-snapshot">
        {labourReference.metrics.map((metric) => <div className="snapshot-stat" key={metric.label} data-testid={`labour-metric-${metric.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}><strong>{metric.value}</strong>{metric.label} · {metric.note}</div>)}
      </div>
      <div className="evidence-grid">
        <div className="source-card"><h4>DOSM · Employment Statistics</h4><p>Q2 2026 · released 13 Aug 2026. Broad employment statistics: 9.25m total jobs and 195.7k vacancies. Manufacturing’s 114.0k vacancies are 58.3% of all vacancies; Services counts jobs and jobs created. These are sector figures, not occupation-level shortage counts.</p><a href={labourReference.sourceUrl} target="_blank" rel="noreferrer" data-testid="source-link-dosm">Open DOSM release <ArrowRight size={11} /></a></div>
        <div className="source-card"><h4>TalentCorp · MyCOL 2024/2025</h4><p>66 critical occupations across 18 sectors, based on employer evidence. Only role titles supported by this report carry the MyCOL critical label here.</p><a href={mycolUrl} target="_blank" rel="noreferrer" data-testid="source-link-mycol">Open MyCOL report <ArrowRight size={11} /></a></div>
      </div>
      <div className="limitations" data-testid="text-limitations"><strong>Limits, plainly:</strong> this prototype uses keyword matching (and, only with your consent, server-side matching for the radar) and a small curated role library. It cannot verify skill level, CV quality, hiring odds, current openings or personal fit. Sector vacancies are not role shortages. AI scenario shifts and skill-to-role mapping are explicit product heuristics. Sources have their own dates and may not reflect current openings.</div>
    </section>
  </div>;
}

export default function Home() {
  const [cvText, setCvText] = useState(SAMPLE_CV);
  const [assessment, setAssessment] = useState<Assessment | null>(() => analyzeCv(SAMPLE_CV));
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Synthetic sample loaded. Edit it or use another fictional CV.");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [radar, setRadar] = useState<RadarMatch | null>(() => localMatch(SAMPLE_CV));
  const [radarPending, setRadarPending] = useState(false);
  const [sentRemotely, setSentRemotely] = useState(false);
  const [syntheticOk, setSyntheticOk] = useState(false);
  const [remoteOk, setRemoteOk] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const revisionRef = useRef(0);
  const remote = syntheticOk && remoteOk;

  const cancelRemote = () => {
    revisionRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setRadarPending(false);
    setLoading(false);
  };
  useEffect(() => () => abortRef.current?.abort(), []);

  const runReview = () => {
    if (!syntheticOk) {
      setError("Confirm that this is a synthetic CV with no real personal data before reviewing.");
      return;
    }
    const trimmed = cvText.trim();
    if (trimmed.length < 60) {
      setError("Add a little more CV text first — at least a few sentences works best.");
      setStatus("More CV text needed.");
      return;
    }
    setError("");
    cancelRemote();
    setLoading(true);
    setStatus("Matching keywords locally…");
    const text = trimmed.slice(0, MAX_CHARS);
      setAssessment(analyzeCv(trimmed));
      setLoading(false);
      if (!remote) {
        setRadar(localMatch(text));
        setSentRemotely(false);
        setStatus("Review ready in this browser. Nothing was uploaded.");
      } else {
        const controller = new AbortController();
        abortRef.current = controller;
        setRadar(null);
        setRadarPending(true);
        setSentRemotely(true);
        setStatus("Readiness ready locally. Sending synthetic CV text to the server for radar matching…");
        matchRadar({ text, syntheticOnly: true, remoteConsent: true }, { signal: controller.signal })
          .then((result) => {
            if (controller.signal.aborted) return;
            if (result.version !== localMatch("").version) throw new Error("Reference version changed");
            setRadar(result);
            setStatus(result.mode === "semantic" ? "Radar matched on the server. This app did not retain the text." : "Server used keyword fallback for the radar. This app did not retain the text.");
          })
          .catch(() => {
            if (controller.signal.aborted) return;
            setRadar(keywordMatch(text, "keyword-fallback", "Server matching failed or its reference version changed. Keyword fallback ran in this browser. The request may have reached the server or RunPod before failure."));
            setStatus("Server matching failed. Radar fell back to local keyword matching.");
          })
          .finally(() => { if (abortRef.current === controller) { abortRef.current = null; setRadarPending(false); } });
      }
      document.getElementById("analysis-report")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const loadSample = () => {
    cancelRemote();
    setCvText(SAMPLE_CV);
    setAssessment(analyzeCv(SAMPLE_CV));
    setRadar(localMatch(SAMPLE_CV));
    setSentRemotely(false);
    setError("");
    setStatus("Synthetic sample loaded. Edit it or use another fictional CV.");
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Choose a PDF file.");
      event.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("This prototype accepts PDFs up to 10 MB.");
      event.target.value = "";
      return;
    }
    cancelRemote();
    const importRevision = revisionRef.current;
    setLoading(true);
    setAssessment(null);
    setRadar(null);
    setStatus("Reading PDF on this device…");
    try {
      const text = await extractLocalPdf(file);
      if (revisionRef.current !== importRevision) return;
      if (text.length < 40) throw new Error("No selectable text found.");
      setCvText(text.slice(0, MAX_CHARS));
      setStatus(`Extracted text from ${file.name} on this device${text.length > MAX_CHARS ? " (trimmed to 12,000 characters)" : ""}. Review it, then run the roast.`);
    } catch {
      if (revisionRef.current !== importRevision) return;
      setError("We couldn’t read selectable text in this PDF. Try a text-based PDF or paste your CV. Scanned PDFs are not supported.");
      setStatus("PDF could not be read.");
    } finally {
      if (revisionRef.current === importRevision) setLoading(false);
      event.target.value = "";
    }
  };

  const clearCv = () => {
    cancelRemote();
    setCvText("");
    setAssessment(null);
    setRadar(null);
    setSentRemotely(false);
    setError("");
    setStatus("CV text cleared from this page.");
  };

  return <main className="app-shell">
    <header className="masthead">
      <a className="brand" href="/" aria-label="Roast My CV home" data-testid="link-home"><span className="brand-mark">r</span><span>roast my cv</span></a>
      <div className="top-note"><span className="live-dot" />Private prototype · Malaysia</div>
    </header>
    <div className="page-wrap">
      <section className="hero">
        <div>
          <div className="eyebrow">A kinder kind of career reality check</div>
          <h1>Less scorecard.<br /><em>More next step.</em></h1>
          <p className="hero-copy">A blunt-but-kind CV coach for Malaysian fresh grads. See what your CV already proves, where the gaps are, and one practical move to make next.</p>
        </div>
        <aside className="hero-aside">
          <div className="privacy-line"><LockKeyhole className="privacy-icon" size={17} /><span>Local by default. Synthetic CVs only.</span></div>
          By default, text matching and PDF extraction happen locally in your browser and nothing is sent. Only if you tick both boxes below and run a review is your synthetic CV text sent to our server for radar matching; this app does not retain it. If configured, RunPod processes eligible phrases under its own policies. This prototype is for synthetic (made-up) CVs only.
        </aside>
      </section>

      <div className="workspace">
        <section className="panel input-panel" aria-labelledby="cv-heading">
          <div className="panel-heading"><div><div className="eyebrow">Start here</div><h2 id="cv-heading">Bring your CV.</h2></div><span className="step-no">01 / INPUT</span></div>
          <p className="input-hint">Paste the text or import a text-based PDF (read on this device). Up to 12,000 characters.</p>
          <p className="synthetic-banner" data-testid="text-synthetic-only">Prototype: use a synthetic CV only. Do not paste a real person's CV, even locally.</p>
          <label className="sr-only" htmlFor="cv-text">CV text</label>
          <textarea id="cv-text" className="cv-input" value={cvText} maxLength={MAX_CHARS} onChange={(event) => { cancelRemote(); setRadar(null); setCvText(event.target.value.slice(0, MAX_CHARS)); setAssessment(null); setError(""); setStatus("CV edited. Run the review to refresh results."); }} placeholder="Paste your CV text here…" data-testid="input-cv-text" />
          <div className="input-actions">
            <button className="button-primary" type="button" onClick={runReview} disabled={loading} data-testid="button-run-review">{loading ? <><Sparkles size={15} />{remote ? "Working…" : "Working locally…"}</> : <>Roast my CV <ArrowRight size={15} /></>}</button>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <input className="file-input" ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={handleFile} data-testid="input-pdf-file" />
              <button className="button-quiet file-label" type="button" onClick={() => fileRef.current?.click()} disabled={loading} data-testid="button-import-pdf"><Upload size={14} /> Import PDF</button>
            </div>
          </div>
          <div className="input-actions" style={{ marginTop: 3 }}>
            <button className="button-quiet" type="button" onClick={loadSample} data-testid="button-load-sample"><FileText size={14} /> Load sample</button>
            <button className="button-quiet" type="button" onClick={clearCv} data-testid="button-clear-cv"><X size={14} /> Clear</button>
            <span className="char-count" data-testid="text-character-count">{cvText.length.toLocaleString()} / 12,000 chars</span>
          </div>
          <div className="consent" data-testid="panel-consent">
            <label><input type="checkbox" checked={syntheticOk} onChange={(e) => { cancelRemote(); setSyntheticOk(e.target.checked); }} data-testid="checkbox-synthetic-only" />I confirm this CV is synthetic and contains no real personal data.</label>
            <label><input type="checkbox" checked={remoteOk} onChange={(e) => { cancelRemote(); setRemoteOk(e.target.checked); }} data-testid="checkbox-remote-consent" />Send my synthetic text to this app’s server when I run a review. If approved and configured, bounded evidence phrases also go to RunPod, an external embedding provider. This app does not log or persist CV text or CV vectors; provider processing is subject to its own policies. Use fictional data only.</label>
            <div className="consent-mode" data-testid="status-processing-mode">Next review: <strong>{remote ? "server matching for radar (readiness stays local)" : "fully local, nothing sent"}</strong></div>
          </div>
          {error && <p className="input-error" role="alert" data-testid="status-input-error">{error}</p>}
          <div className="status-line" role="status" data-testid="status-input">{status}</div>
          <div className="privacy-note"><ShieldCheck size={14} /><span>{remote ? "No account. Server matching is on for the next review; this app does not retain CV text. Refresh and your pasted CV is gone." : "No account. No upload in local mode. Refresh the page and your pasted CV is gone."}</span></div>
        </section>

        <section className="report" id="analysis-report" aria-label="CV analysis report">
          {assessment ? <Report assessment={assessment} radar={radar} radarPending={radarPending} sentRemotely={sentRemotely} /> : <div className="report-empty" data-testid="empty-report">
            <div className="empty-stamp"><CircleHelp size={25} /></div><h3>Your report starts here.</h3><p>Add a synthetic CV, then run a review (local unless you opt in). We’ll turn keywords into possible directions and a doable next move.</p><div className="example-cue"><ArrowDown size={12} /> local by default · server only with your consent</div>
          </div>}
        </section>
      </div>
    </div>
  </main>;
}
