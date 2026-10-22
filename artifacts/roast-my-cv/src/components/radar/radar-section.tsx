import { useMemo, useState } from "react";
import { ArrowRight, Check, LayoutGrid, List } from "lucide-react";
import type { RadarGroup, RadarMatch } from "@workspace/api-client-react";
import { useRadarReference } from "@/hooks/use-radar";
import { demandColor, layoutTreemap, qoq } from "./treemap-layout";
import { RoleDetails } from "./role-details";
import "./radar.css";

type Layer = "demand" | "ai" | "sdg";
const W = 100, H = 68;

const pct = (n: number | null) => n == null ? "Unavailable" : `${n > 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;
const fmt = (n: number | null) => n == null ? "No verified count" : n.toLocaleString("en-MY");

export function RadarSection({ match, pending, modeLabel }: { match: RadarMatch | null; pending: boolean; modeLabel: string }) {
  const { reference, source, skill } = useRadarReference();
  const [layer, setLayer] = useState<Layer>("demand");
  const [view, setView] = useState<"map" | "list">("map");
  const [goal, setGoal] = useState<number | null>(null);
  const [groupId, setGroupId] = useState<string>(reference.groups[0]?.id ?? "");
  const [roleId, setRoleId] = useState<string | null>(null);
  const snap = reference.snapshot;

  const scaled = reference.groups.filter((g) => g.current != null && g.current > 0);
  const unscaled = reference.groups.filter((g) => !(g.current != null && g.current > 0));
  // Area depends only on verified group counts: stable across layers and CVs.
  const rects = useMemo(() => layoutTreemap(scaled.map((g) => ({ id: g.id, value: g.current as number })), W, H), [scaled]);

  const goals = useMemo(() => [...new Set(reference.roles.flatMap((r) => r.sdgs.map((s) => s.goal)))].sort((a, b) => a - b), [reference]);
  const matchedRoleIds = useMemo(() => new Set((match?.roles ?? []).filter((r) => r.matchedSkillIds.length > 0).map((r) => r.roleId)), [match]);
  const scoreByRole = useMemo(() => new Map((match?.roles ?? []).map((r) => [r.roleId, r])), [match]);
  // Occupations the embedding model ranked closest to the evidenced skill profile.
  const closest = useMemo(() => (match?.roles ?? []).filter(r => r.matchScore != null).slice(0, 5), [match]);
  const groupInfo = (g: RadarGroup) => {
    const roles = reference.roles.filter((r) => r.groupId === g.id);
    return {
      roles,
      cvCount: roles.filter((r) => matchedRoleIds.has(r.id)).length,
      sdgCount: goal == null ? 0 : roles.filter((r) => r.sdgs.some((s) => s.goal === goal)).length,
      change: qoq(g.current, g.previous),
    };
  };
  const tileStyle = (g: RadarGroup) => {
    const info = groupInfo(g);
    if (layer === "demand") return info.change == null ? undefined : { background: demandColor(info.change) };
    if (layer === "sdg" && goal != null && info.sdgCount > 0) return { background: "hsl(194 38% 84%)" };
    return { background: "#ece8dc" };
  };
  const tileClass = (g: RadarGroup) => {
    const info = groupInfo(g);
    return ["rt-tile", info.cvCount ? "has-cv" : "", g.id === groupId ? "is-selected" : "",
      layer === "demand" && info.change == null ? "is-unavailable" : "",
      layer === "sdg" && goal != null && info.sdgCount > 0 ? "is-sdg" : ""].join(" ");
  };
  const selectGroup = (id: string) => { setGroupId(id); setRoleId(null); };
  const group = reference.groups.find((g) => g.id === groupId) ?? reference.groups[0];
  const gInfo = group ? groupInfo(group) : null;
  const role = reference.roles.find((r) => r.id === roleId) ?? null;
  const skillLabel = (id: string) => skill.get(id)?.label ?? id;

  const tileBody = (g: RadarGroup) => {
    const info = groupInfo(g);
    return <>
      <span className="rt-num">MASCO {g.id}</span>
      <span className="rt-title">{g.title}</span>
      <span className="rt-meta">
        {layer === "demand" && <>{fmt(g.current)} · {pct(info.change)}</>}
        {layer === "ai" && <>{info.roles.length} curated roles · scores in details</>}
        {layer === "sdg" && <>{goal == null ? "Pick a goal" : info.sdgCount ? `${info.sdgCount} curated role${info.sdgCount > 1 ? "s" : ""} linked` : "No curated role linked"}</>}
      </span>
      {info.cvCount > 0 && <span className="rt-cv"><Check size={10} />{info.cvCount} CV match{info.cvCount > 1 ? "es" : ""}</span>}
    </>;
  };

  return <section className="report-section radar" data-testid="section-radar" aria-labelledby="radar-heading">
    <div className="section-head"><h3 id="radar-heading">Future skills radar</h3><span className="section-kicker" data-testid="status-radar-mode">{pending ? "Matching…" : modeLabel}</span></div>
    <p className="section-intro">Where Malaysian online job offerings sat in {snap.currentPeriod}, by broad occupation group. Tap a block to see curated roles and what your CV already evidences. Separate from the readiness score above.</p>

    <div className="rt-controls">
      <div className="rt-seg" role="group" aria-label="Colour layer">
        {(["demand", "ai", "sdg"] as Layer[]).map((l) => <button key={l} type="button" aria-pressed={layer === l} onClick={() => setLayer(l)} data-testid={`button-layer-${l}`}>{l === "demand" ? "Demand change" : l === "ai" ? "AI exposure" : "SDG links"}</button>)}
      </div>
      <div className="rt-seg" role="group" aria-label="Display">
        <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")} data-testid="button-view-map"><LayoutGrid size={12} /> Map</button>
        <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")} data-testid="button-view-list"><List size={12} /> List</button>
      </div>
    </div>

    {layer === "sdg" && <div className="rt-goals" role="group" aria-label="Sustainable Development Goal">
      {goals.map((n) => <button key={n} type="button" aria-pressed={goal === n} onClick={() => setGoal(goal === n ? null : n)} data-testid={`button-sdg-${n}`}>SDG {String(n).padStart(2, "0")}</button>)}
    </div>}

    <div className="rt-legend" data-testid="text-radar-legend">
      {layer === "demand" && <><span className="sw" style={{ background: demandColor(-0.2) }} />Fewer offerings than {snap.previousPeriod}<span className="sw" style={{ background: demandColor(0.1) }} />More<span className="sw hatch" />Comparison unavailable</>}
      {layer === "ai" && <>Group blocks stay neutral on purpose. Exposure is estimated per role, never averaged per group. Open a role to see its status and rationale.</>}
      {layer === "sdg" && <><span className="sw" style={{ background: "hsl(194 38% 84%)" }} />Group contains at least one curated role linked to the goal. Not every occupation in a highlighted group shares that link.</>}
      <span className="rt-legend-cv"><span className="sw cv" />Thick inked border and badge = CV match (independent of colour)</span>
    </div>

    {view === "map" ? <div className="rt-map" data-testid="radar-treemap">
      {rects.map((r) => { const g = reference.groups.find((x) => x.id === r.id)!; return <button key={r.id} type="button" className={tileClass(g)} aria-pressed={g.id === groupId}
        style={{ left: `${(r.x / W) * 100}%`, top: `${(r.y / H) * 100}%`, width: `${(r.w / W) * 100}%`, height: `${(r.h / H) * 100}%`, ...tileStyle(g) }}
        onClick={() => selectGroup(g.id)} data-testid={`tile-group-${g.id}`}
        aria-label={`${g.title}. ${fmt(g.current)} offerings. Change ${pct(groupInfo(g).change)}. ${groupInfo(g).cvCount} roles with CV evidence.`}>{tileBody(g)}</button>; })}
    </div> : <ul className="rt-list" data-testid="radar-list">
      {reference.groups.map((g) => { const info = groupInfo(g); return <li key={g.id}><button type="button" className={g.id === groupId ? "is-selected" : ""} aria-pressed={g.id === groupId} onClick={() => selectGroup(g.id)} data-testid={`row-group-${g.id}`}>
        <span className="rt-num">MASCO {g.id}</span><strong>{g.title}</strong>
        <span>{fmt(g.current)} in {snap.currentPeriod} · was {fmt(g.previous)} · {pct(info.change)}</span>
        <span>{info.roles.length} curated roles{info.cvCount ? ` · ${info.cvCount} with CV evidence` : ""}{layer === "sdg" && goal != null ? ` · ${info.sdgCount} linked to SDG ${goal}` : ""}</span>
      </button></li>; })}
    </ul>}

    {closest.length > 0 && <div className="rt-closest" data-testid="radar-closest">
      <div className="split-label">Closest occupations to your evidenced skills</div>
      <p className="rd-small">Ranked by topical fit from the embedding model, blended with skill overlap and demand direction. Topical fit is not a qualification score and not a probability.</p>
      <ul>
        {closest.map((r) => { const target = reference.roles.find(x => x.id === r.roleId); return <li key={r.roleId}>
          <button type="button" onClick={() => { if (target?.groupId) selectGroup(target.groupId); setRoleId(r.roleId); }} data-testid={`row-closest-${r.roleId}`}>
            <span>{target?.title ?? r.roleId}</span>
            <span className="rd-mono" data-testid={`text-closest-score-${r.roleId}`}>{r.matchScore}/100</span>
            <span>{Math.round(r.overlapScore * 100)}% of its skills named{r.demandChange == null ? "" : ` · demand ${r.demandChange > 0 ? "+" : ""}${(r.demandChange * 100).toFixed(1)}%`}</span>
          </button>
        </li>; })}
      </ul>
    </div>}

    {unscaled.length > 0 && <div className="rt-unscaled" data-testid="list-unscaled-groups">
      <div className="split-label">No verified count · shown unscaled</div>
      {unscaled.map((g) => <button key={g.id} type="button" className={g.id === groupId ? "is-selected" : ""} onClick={() => selectGroup(g.id)} data-testid={`button-unscaled-${g.id}`}>{g.title}<small>{g.missingReason ?? "Count not verified"}</small></button>)}
    </div>}

    <p className="rt-coverage" data-testid="text-radar-coverage">{snap.coverageNote} {snap.comparisonNote} {snap.attribution}. {snap.currentPeriod}{snap.currentPublished ? ` published ${snap.currentPublished}` : ""}; {snap.previousPeriod}{snap.previousPublished ? ` published ${snap.previousPublished}` : ""}.{" "}
      {snap.sources.map((s, i) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" data-testid={`link-radar-source-${i}`}>{s.title}<ArrowRight size={9} /></a>)}
      {source === "bundled" && <span className="rt-fallback" data-testid="status-radar-reference"> Showing the bundled reference copy ({reference.version}).</span>}
    </p>

    {group && gInfo && <div className="rt-detail" data-testid={`panel-group-${group.id}`}>
      <div className="rt-detail-head">
        <h4>{group.title}</h4>
        <span className="rd-mono">{fmt(group.current)} · {pct(gInfo.change)} vs {snap.previousPeriod}</span>
      </div>
      {group.missingReason && <p className="rd-small">{group.missingReason}</p>}
      <div className="rt-roles" role="group" aria-label={`Roles in ${group.title}`}>
        {gInfo.roles.length === 0 && <p className="rd-small">No curated roles in this group yet.</p>}
        {gInfo.roles.map((r) => { const cv = matchedRoleIds.has(r.id); const sdg = layer === "sdg" && goal != null && r.sdgs.some((s) => s.goal === goal); const fit = scoreByRole.get(r.id); return <button key={r.id} type="button" aria-pressed={roleId === r.id}
          className={`rt-role ${cv ? "has-cv" : ""} ${sdg ? "is-sdg" : ""}`} onClick={() => setRoleId(roleId === r.id ? null : r.id)} data-testid={`button-role-${r.id}`}>
          <span>{r.title}</span>
          <span className="rt-role-tags">
            {cv && <em className="tag cv"><Check size={9} />CV</em>}
            {fit?.matchScore != null && <em className="tag fit" data-testid={`tag-role-fit-${r.id}`}>Fit {fit.matchScore}</em>}
            {sdg && <em className="tag sdg">SDG {goal}</em>}
            {r.laterCareer && <em className="tag later">Later career</em>}
            {layer === "ai" && <em className="tag">{r.exposure.status === "reviewed" && r.exposure.score != null ? `AI ${r.exposure.score}/10` : r.exposure.status === "draft" ? "AI draft" : "AI n/a"}</em>}
          </span>
        </button>; })}
      </div>
      {role && <RoleDetails role={role} reference={reference} match={match} skillLabel={skillLabel} />}
    </div>}
  </section>;
}
