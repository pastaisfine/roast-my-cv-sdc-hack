import { useMemo } from "react";
import { AlertTriangle, ArrowRight, Check, CircleDashed, Compass } from "lucide-react";
import type { RadarEvidenceKind, RadarMatch, RadarReference, RadarRole } from "@workspace/api-client-react";
import { makeRadarPathway } from "@workspace/radar-data/pathway";
import { MATCH_WEIGHTS, TOPICAL_RANGE } from "@workspace/radar-data/matching";

const KIND_LABEL: Record<RadarEvidenceKind, string> = {
  explicit: "Explicit claim",
  inferred: "Inferred",
  interest: "Learning interest",
  negated: "Negated",
  uncertain: "Uncertain",
};

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

export function RoleDetails({ role, reference, match, skillLabel }: {
  role: RadarRole;
  reference: RadarReference;
  match: RadarMatch | null;
  skillLabel: (id: string) => string;
}) {
  const roleMatch = match?.roles.find((r) => r.roleId === role.id);
  const matched = roleMatch?.matchedSkillIds ?? [];
  const missing = roleMatch?.missingSkillIds ?? role.skillIds.filter((id) => !matched.includes(id));
  const evidence = useMemo(() => (match?.evidence ?? []).filter((e) => role.skillIds.includes(e.skillId)), [match, role]);
  // Local pathway helper: selecting a role makes no network request.
  const pathway = useMemo(() => makeRadarPathway(role.id, matched), [role.id, matched]);
  const exp = role.exposure;
  const snap = reference.snapshot;
  const groupTitle = reference.groups.find(g => g.id === role.groupId)?.title ?? null;

  return <div className="rd" data-testid={`panel-role-${role.id}`}>
    <div className="rd-head">
      <div>
        <div className="rd-code" data-testid="text-role-masco">MASCO {role.mascoVersion} · {role.mascoCode}</div>
        <h4 data-testid="text-role-title">{role.title}</h4>
      </div>
      {matched.length > 0 && <span className="rd-cv-badge" data-testid="badge-role-cv"><Check size={11} /> CV evidence</span>}
    </div>

    {role.laterCareer && <p className="rd-warn" data-testid="text-later-career"><Compass size={13} />A later-career destination. Fresh graduates rarely start here; treat it as a direction for years from now, not a first application.</p>}

    <details className="rd-fold">
      <summary>Where this mapping comes from</summary>
      <p>{role.mappingNote}</p>
      <p className="rd-mono">Source: {role.mappingSource}{role.legacyRoleTitle ? ` · linked to earlier app role "${role.legacyRoleTitle}"` : ""}</p>
    </details>

    <div className="rd-block">
      <div className="split-label">Skills this role asks for · {matched.length} of {role.skillIds.length} evidenced</div>
      <ul className="rd-skills" data-testid="list-role-skills">
        {role.skillIds.map((id) => {
          const ev = evidence.filter((e) => e.skillId === id);
          const has = matched.includes(id);
          return <li key={id} className={has ? "is-match" : "is-gap"} data-testid={`row-role-skill-${slug(id)}`}>
            <div className="rd-skill-name">{has ? <Check size={12} /> : <CircleDashed size={12} />}{skillLabel(id)}<span>{has ? "matched" : "gap for this role"}</span></div>
            {ev.slice(0, 3).map((e, i) => <div className={`rd-ev kind-${e.kind}`} key={`${e.start}-${i}`} data-testid={`evidence-${slug(id)}-${i}`}>
              <span className="rd-kind">{KIND_LABEL[e.kind]} · {e.method}{e.similarity != null ? ` · similarity ${e.similarity.toFixed(2)} (not a probability)` : ""}</span>
              <q>{e.text}</q>
            </div>)}
          </li>;
        })}
      </ul>
      {missing.length === 0 && match && <p className="input-hint" style={{ margin: "8px 0 0" }}>No gaps in this role's skill list. Depth still matters: show it with outcomes.</p>}
      {!match && <p className="input-hint" style={{ margin: "8px 0 0" }}>Run a review to see which of these your CV evidences.</p>}
    </div>

    {roleMatch && <div className="rd-block" data-testid="panel-role-fit">
      <div className="split-label">Topical fit, skill overlap and demand</div>
      {roleMatch.matchScore != null
        ? <p className="rd-exp" data-testid="text-role-match-score"><strong>{roleMatch.matchScore}/100</strong> occupation match score</p>
        : <p className="rd-exp draft" data-testid="text-role-no-embedding"><strong>No topical fit computed</strong> The embedding model was not used for this review, so only keyword overlap and demand direction are known.</p>}
      <ul className="rd-small" data-testid="list-role-fit-terms">
        <li data-testid="text-role-topical">Topical fit {roleMatch.topicalScore == null ? "not computed" : roleMatch.topicalScore.toFixed(3)} — how close your evidenced skills sit to this occupation's skill profile. Topical fit only; never a qualification score or a probability.</li>
        <li data-testid="text-role-overlap">Skill overlap {Math.round(roleMatch.overlapScore * 100)}% — {matched.length} of {role.skillIds.length} of this occupation's skills are named in your CV.</li>
        <li data-testid="text-role-demand">Demand direction {roleMatch.demandChange == null ? "unavailable for this group" : `${roleMatch.demandChange > 0 ? "+" : ""}${(roleMatch.demandChange * 100).toFixed(1)}%`} — {groupTitle ? `${groupTitle} online job offerings, ${snap.previousPeriod} to ${snap.currentPeriod}` : `online job offerings, ${snap.previousPeriod} to ${snap.currentPeriod}`}.</li>
      </ul>
      <details className="rd-fold"><summary>How this score is calculated</summary>
        <p>Match score = {MATCH_WEIGHTS.topical} × topical fit + {MATCH_WEIGHTS.overlap} × skill overlap + {MATCH_WEIGHTS.demand} × demand direction. Topical credit starts at cosine {TOPICAL_RANGE.floor}.</p>
        <p>{snap.comparisonNote}</p>
      </details>
    </div>}

    <div className="rd-block">
      <div className="split-label">AI task exposure</div>
      {exp.status === "reviewed" && exp.score != null
        ? <p className="rd-exp" data-testid="text-exposure-reviewed"><strong>{exp.score}/10</strong> reviewed estimate{exp.reviewedBy ? ` · ${exp.reviewedBy}` : ""}{exp.reviewedAt ? `, ${exp.reviewedAt}` : ""}</p>
        : <p className="rd-exp draft" data-testid="text-exposure-unreviewed"><strong>{exp.status === "draft" ? "Draft, not reviewed" : "Unavailable"}</strong> No reviewed score is shown until a human review signs it off.</p>}
      <p className="rd-small">{exp.status === "draft" ? "Draft rationale: " : ""}{exp.rationale}</p>
      <details className="rd-fold"><summary>Exposure rubric</summary><p>{reference.exposureRubric}</p><p>Exposure describes how much of the task mix digital AI could assist or change. It is not a probability of job loss.</p></details>
    </div>

    {role.sdgs.length > 0 && <div className="rd-block">
      <div className="split-label">Possible SDG links</div>
      {role.sdgs.map((s) => <p className="rd-small" key={s.goal} data-testid={`text-role-sdg-${s.goal}`}><strong className="rd-mono">SDG {String(s.goal).padStart(2, "0")}</strong> {s.explanation}</p>)}
    </div>}

    <div className="rd-block" data-testid="panel-role-pathway">
      <div className="split-label">Pathway toward this role</div>
      {!pathway.available ? <p className="rd-small" data-testid="text-pathway-unavailable"><AlertTriangle size={12} /> {pathway.reason}</p>
        : pathway.noGaps ? <p className="rd-small" data-testid="text-pathway-no-gaps">{pathway.reason}</p> : null}
      {pathway.steps.length > 0 && <div className="pathway">{pathway.steps.map((step, i) => <article className="path-step" key={step.phase} data-testid={`radar-pathway-step-${i + 1}`}>
        <div className="path-num">{step.phase}</div><h4>{step.title}</h4>
        <p><strong>Learn:</strong> {step.learn}</p><p style={{ marginTop: 5 }}><strong>Do:</strong> {step.do}</p>
        <span className="path-evidence">Evidence <ArrowRight size={10} /> {step.evidence}</span>
      </article>)}</div>}
    </div>
  </div>;
}
