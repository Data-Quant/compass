"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  relationships,
  calculateScore,
  type PilotConfig,
  type Rating,
  type Evidence,
  type Rubric,
} from "@/lib/ai-evaluations/domain";
import { Action, api, fieldClass, Status } from "./shared";

type Person = { id: string; name: string; position: string | null };
type Cycle = {
  id: string;
  name: string;
  startDate: string;
  status: string;
  revision: number;
  config: PilotConfig;
};
type Artifact = {
  id: string;
  evaluateeId: string;
  kind: string;
  status: string;
  createdAt: string;
  content: {
    ratings?: Rating[];
    score?: { overall: number | null };
    claims?: Array<{
      relationship: string;
      type: string;
      text: string;
      sourceIds: string[];
    }>;
  };
  reviews: Array<{ action: string; reason: string; ratings?: Rating[] }>;
};
type Theme = {
  id: string;
  evaluateeId: string;
  text: string;
  sourceIds: string[];
  status: string;
  corrections: Array<{ text: string }>;
};
type Data = {
  cycles: Cycle[];
  people: Person[];
  rubricDrafts: Rubric[];
  mappings: Array<{
    evaluatorId: string;
    evaluateeId: string;
    relationshipType: PilotConfig["assignments"][number]["relationship"];
  }>;
  observations: Evidence[];
  artifacts: Artifact[];
  jobs: Array<{
    id: string;
    operation: string;
    status: string;
    error: string | null;
    attempts: number;
  }>;
  themes: Theme[];
  inferenceConfigured: boolean;
  checkIns: Array<{
    id: string;
    week: number;
    evaluateeId: string;
    evaluatorId: string;
    status: string;
    answer: string;
    clarificationAnswer: string;
  }>;
};
const endpoint = "/api/admin/ai-evaluations";
const emptyConfig: PilotConfig = {
  members: [],
  assignments: [],
  rubric: [],
  weeklyBudget: 2,
  minObservations: 2,
  minWeeks: 2,
};
const lensName = (value: string) => value.toLowerCase().replaceAll("_", " ");

export function AdminPilot() {
  const [data, setData] = useState<Data>(),
    [cycleId, setCycleId] = useState(""),
    [error, setError] = useState(""),
    [tab, setTab] = useState("setup");
  const requestSequence = useRef(0),
    selectedCycle = useRef(cycleId);
  selectedCycle.current = cycleId;
  const reload = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const result = await api<Data>(
        endpoint + (cycleId ? `?cycleId=${encodeURIComponent(cycleId)}` : ""),
      );
      if (
        sequence === requestSequence.current &&
        selectedCycle.current === cycleId
      ) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (
        sequence === requestSequence.current &&
        selectedCycle.current === cycleId
      )
        setError((e as Error).message);
    }
  }, [cycleId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const act = async (body: unknown) => {
    const result = await api(endpoint, body);
    await reload();
    return result;
  };
  const cycle = data?.cycles.find((c) => c.id === cycleId);
  const person = (id: string) =>
    data?.people.find((p) => p.id === id)?.name ?? "Employee";
  return (
    <div className="mx-auto max-w-6xl space-y-7 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            AI evaluation pilot
          </h1>
          <p className="mt-2 max-w-prose text-muted-foreground">
            Weekly evidence. Fixed expectations. Reviewed assessments.
          </p>
        </div>
        <Action variant="outline" onClick={reload}>
          Refresh
        </Action>
      </header>
      <p className="rounded-lg bg-muted p-4 text-sm">
        Development pilot · Existing evaluations remain authoritative. Source
        feedback is restricted to HR; employees see only released themes.
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading pilot workspace…</p>}
      {data && (
        <>
          {!data.inferenceConfigured && (
            <p role="status" className="rounded-lg border p-4 text-sm">
              Fireworks is not configured. You can prepare the cycle; inference
              jobs will wait for server configuration and an HR retry.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-4">
            <label className="min-w-0 flex-1 space-y-2">
              <span className="text-sm font-medium">Cycle</span>
              <select
                className={fieldClass}
                value={cycleId}
                onChange={(e) => {
                  ++requestSequence.current;
                  setData(undefined);
                  setCycleId(e.target.value);
                }}
              >
                <option value="">Create a new cycle</option>
                {data.cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.status.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            {cycle && <Status>{cycle.status}</Status>}
            <Action onClick={() => act({ action: "runDue" })}>
              Run due work
            </Action>
          </div>
          <nav
            aria-label="Pilot workspace"
            className="flex flex-wrap gap-2 border-b pb-3"
          >
            {[
              ["setup", "Cycle setup"],
              ["evidence", "Evidence & profiles"],
              ["review", "Quarterly review"],
              ["themes", "Development themes"],
              ["jobs", "Processing"],
            ].map(([id, label]) => (
              <Button
                key={id}
                variant={tab === id ? "default" : "ghost"}
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </Button>
            ))}
          </nav>
          {tab === "setup" && (
            <CycleEditor
              key={`${cycleId}:${cycle?.revision ?? 0}`}
              cycle={cycle}
              data={data}
              save={async (body) => {
                const result = await api<Cycle>(endpoint, body);
                if (cycleId !== result.id) {
                  ++requestSequence.current;
                  setData(undefined);
                  setCycleId(result.id);
                } else await reload();
              }}
              activate={async () => {
                await act({
                  action: "activate",
                  id: cycle!.id,
                  revision: cycle!.revision,
                });
              }}
            />
          )}
          {tab !== "setup" && !cycle && (
            <p>
              Select a saved cycle to see its evidence and processing status.
            </p>
          )}
          {cycle && tab === "evidence" && (
            <section className="space-y-6">
              <h2 className="text-xl font-semibold">Relationship evidence</h2>
              <p className="text-sm text-muted-foreground">
                Claims remain linked to the original submitted words. Multiple
                accounts of one event count as corroboration, not extra
                incidents.
              </p>
              {cycle.config.members.map((m) => (
                <details key={m.employeeId} className="rounded-lg border p-5">
                  <summary className="cursor-pointer font-semibold">
                    {person(m.employeeId)} ·{" "}
                    {
                      data.observations.filter(
                        (o) => o.evaluateeId === m.employeeId,
                      ).length
                    }{" "}
                    observations
                  </summary>
                  <div className="mt-5 space-y-5">
                    <Action
                      variant="outline"
                      onClick={() =>
                        act({
                          action: "artifact",
                          cycleId,
                          evaluateeId: m.employeeId,
                          kind: "profile",
                        })
                      }
                    >
                      Refresh profile
                    </Action>
                    {data.artifacts
                      .filter(
                        (a) =>
                          a.evaluateeId === m.employeeId &&
                          a.kind === "PROFILE",
                      )
                      .slice(0, 1)
                      .map((a) => (
                        <div key={a.id}>
                          <Status>{a.status}</Status>
                          {a.content.claims?.map((claim, i) => (
                            <div key={i} className="mt-4">
                              <p className="text-sm font-medium">
                                {lensName(claim.relationship)} · {claim.type}
                              </p>
                              <p className="mt-1">{claim.text}</p>
                              <Sources
                                ids={claim.sourceIds}
                                evidence={data.observations}
                              />
                            </div>
                          ))}
                        </div>
                      ))}
                    {data.observations
                      .filter((o) => o.evaluateeId === m.employeeId)
                      .map((o) => (
                        <article key={o.id} className="border-t pt-4">
                          <p className="text-sm font-medium">
                            Week {o.week} · {lensName(o.relationship)} ·{" "}
                            {person(o.evaluatorId)}
                          </p>
                          <p className="mt-2">{o.text}</p>
                          <blockquote className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
                            {o.sourceQuote}
                          </blockquote>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {o.concrete
                              ? "Concrete observation"
                              : "General feedback — does not establish a rating"}
                          </p>
                          <MergeIncident
                            row={o}
                            evidence={data.observations.filter(
                              (e) => e.evaluateeId === m.employeeId,
                            )}
                            act={act}
                            cycleId={cycleId}
                          />
                        </article>
                      ))}
                    <details>
                      <summary className="cursor-pointer text-sm font-medium">
                        Original check-in responses
                      </summary>
                      {data.checkIns
                        .filter(
                          (c) =>
                            c.evaluateeId === m.employeeId &&
                            c.status === "SUBMITTED",
                        )
                        .map((c) => (
                          <div
                            key={c.id}
                            className="mt-3 whitespace-pre-wrap border-t pt-3 text-sm"
                          >
                            <p>
                              Week {c.week} · {person(c.evaluatorId)}
                            </p>
                            <p>{c.answer || "No relevant interaction"}</p>
                            {c.clarificationAnswer && (
                              <p>{c.clarificationAnswer}</p>
                            )}
                          </div>
                        ))}
                    </details>
                  </div>
                </details>
              ))}
            </section>
          )}
          {cycle && tab === "review" && (
            <section className="space-y-6">
              <h2 className="text-xl font-semibold">Quarterly assessments</h2>
              <p className="max-w-prose text-sm text-muted-foreground">
                Scoring opens after week 12. Check the evidence against the
                rubric before approval. Every override needs a reason; original
                AI proposals are retained.
              </p>
              {cycle.config.members.map((m) => (
                <div
                  key={m.employeeId}
                  className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"
                >
                  <span className="font-medium">{person(m.employeeId)}</span>
                  <Action
                    variant="outline"
                    onClick={() =>
                      act({
                        action: "artifact",
                        cycleId,
                        evaluateeId: m.employeeId,
                        kind: "assessment",
                      })
                    }
                  >
                    Generate assessment
                  </Action>
                </div>
              ))}
              {data.artifacts
                .filter((a) => a.kind === "ASSESSMENT")
                .map((a) => (
                  <Assessment
                    key={a.id + a.status}
                    artifact={a}
                    cycle={cycle}
                    name={person(a.evaluateeId)}
                    evidence={data.observations}
                    act={act}
                  />
                ))}
            </section>
          )}
          {cycle && tab === "themes" && (
            <section className="space-y-6">
              <h2 className="text-xl font-semibold">
                Reviewed development themes
              </h2>
              <p className="max-w-prose text-sm text-muted-foreground">
                Write actionable guidance supported by evidence. Before release,
                remove identifying details about evaluators and avoid quotations
                that reveal a confidential source.
              </p>
              <ThemeEditor
                cycle={cycle}
                people={data.people}
                evidence={data.observations}
                act={act}
              />
              {data.themes.map((t) => (
                <ThemeEditor
                  key={t.id + t.status + t.text}
                  theme={t}
                  cycle={cycle}
                  people={data.people}
                  evidence={data.observations}
                  act={act}
                />
              ))}
            </section>
          )}
          {cycle && tab === "jobs" && (
            <section className="space-y-5">
              <h2 className="text-xl font-semibold">Processing</h2>
              <p className="text-sm text-muted-foreground">
                Each run processes one queued operation. Scheduled runs continue
                the queue. Failed operations retain submitted feedback.
              </p>
              {!data.jobs.length && <p>No processing jobs yet.</p>}
              {data.jobs.map((j) => (
                <div
                  key={j.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"
                >
                  <div>
                    <p className="font-medium">{lensName(j.operation)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {j.attempts} attempts
                      {j.error ? ` · ${lensName(j.error)}` : ""}
                    </p>
                  </div>
                  <Status>{j.status}</Status>
                  {j.status === "FAILED" && (
                    <Action
                      variant="outline"
                      onClick={() => act({ action: "retry", id: j.id })}
                    >
                      Retry operation
                    </Action>
                  )}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function CycleEditor({
  cycle,
  data,
  save,
  activate,
}: {
  cycle?: Cycle;
  data: Data;
  save: (body: unknown) => Promise<void>;
  activate: () => Promise<void>;
}) {
  const [name, setName] = useState(cycle?.name ?? ""),
    [startDate, setStartDate] = useState(
      cycle
        ? new Date(new Date(cycle.startDate).getTime() + 5 * 3600000)
            .toISOString()
            .slice(0, 10)
        : "",
    );
  const [config, setConfig] = useState<PilotConfig>(
    cycle?.config ?? emptyConfig,
  );
  const locked = cycle?.status === "ACTIVE";
  const updateMember = (
    i: number,
    values: Partial<PilotConfig["members"][number]>,
  ) =>
    setConfig((c) => ({
      ...c,
      members: c.members.map((m, n) => (n === i ? { ...m, ...values } : m)),
    }));
  return (
    <section className="space-y-7">
      <h2 className="text-xl font-semibold">
        {locked ? "Frozen cycle settings" : "Prepare the 12-week cycle"}
      </h2>
      <fieldset disabled={locked} className="space-y-7 disabled:opacity-80">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium">Cycle name</span>
            <input
              className={fieldClass}
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">
              Start date · Asia/Karachi
            </span>
            <input
              className={fieldClass}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
        </div>
        <div>
          <h3 className="mb-3 font-semibold">Pilot cohort</h3>
          <div className="grid max-h-64 gap-2 overflow-auto rounded-lg border p-4 sm:grid-cols-2">
            {data.people.map((p) => (
              <label key={p.id} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={config.members.some((m) => m.employeeId === p.id)}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      members: e.target.checked
                        ? [
                            ...c.members,
                            {
                              employeeId: p.id,
                              expectations: p.position || "",
                              weights: {},
                            },
                          ]
                        : c.members.filter((m) => m.employeeId !== p.id),
                      assignments: e.target.checked
                        ? c.assignments
                        : c.assignments.filter((a) => a.evaluateeId !== p.id),
                    }))
                  }
                />
                {p.name}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="font-semibold">Working relationships</h3>
          <p className="text-sm text-muted-foreground">
            Evaluator roles describe their relationship to the evaluatee.
            Include only people who can observe the work.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setConfig((c) => {
                const assignments = data.mappings
                  .filter((m) =>
                    c.members.some((p) => p.employeeId === m.evaluateeId),
                  )
                  .map((m) => ({
                    evaluatorId: m.evaluatorId,
                    evaluateeId: m.evaluateeId,
                    relationship: m.relationshipType,
                  }));
                return { ...c, assignments };
              })
            }
          >
            Import current mappings for cohort
          </Button>
          {config.assignments.map((a, i) => (
            <div
              key={i}
              className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-4"
            >
              {(["evaluatorId", "evaluateeId"] as const).map((key) => (
                <label key={key} className="space-y-1 text-sm">
                  <span>
                    {key === "evaluatorId" ? "Evaluator" : "Evaluatee"}
                  </span>
                  <select
                    className={fieldClass}
                    value={a[key]}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        assignments: c.assignments.map((v, n) =>
                          n === i ? { ...v, [key]: e.target.value } : v,
                        ),
                      }))
                    }
                  >
                    <option value="">Choose person</option>
                    {data.people
                      .filter(
                        (p) =>
                          key === "evaluatorId" ||
                          config.members.some((m) => m.employeeId === p.id),
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
              <label className="space-y-1 text-sm">
                <span>Relationship</span>
                <select
                  className={fieldClass}
                  value={a.relationship}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      assignments: c.assignments.map((v, n) =>
                        n === i
                          ? {
                              ...v,
                              relationship: e.target
                                .value as typeof a.relationship,
                            }
                          : v,
                      ),
                    }))
                  }
                >
                  {relationships.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    assignments: c.assignments.filter((_, n) => n !== i),
                  }))
                }
              >
                Remove assignment
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setConfig((c) => ({
                ...c,
                assignments: [
                  ...c.assignments,
                  {
                    evaluatorId: "",
                    evaluateeId: c.members[0]?.employeeId ?? "",
                    relationship: "PEER",
                  },
                ],
              }))
            }
          >
            Add relationship
          </Button>
        </div>
        <div className="space-y-5">
          <h3 className="font-semibold">Expectations and weights</h3>
          <p className="text-sm text-muted-foreground">
            Enter percentages totaling 100 for each employee. Self-feedback must
            stay at 0.
          </p>
          {config.members.map((m, i) => (
            <div key={m.employeeId} className="space-y-3 border-t pt-4">
              <h4 className="font-medium">
                {data.people.find((p) => p.id === m.employeeId)?.name}
              </h4>
              <label className="block space-y-2 text-sm">
                <span>Role expectations</span>
                <textarea
                  className={fieldClass}
                  rows={2}
                  value={m.expectations}
                  maxLength={4000}
                  onChange={(e) =>
                    updateMember(i, { expectations: e.target.value })
                  }
                />
              </label>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  ...new Set(
                    config.assignments
                      .filter((a) => a.evaluateeId === m.employeeId)
                      .map((a) => a.relationship),
                  ),
                ].map((r) => (
                  <label key={r} className="space-y-1 text-sm">
                    <span>{lensName(r)} (%)</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      className={fieldClass}
                      value={
                        m.weights[r] === undefined
                          ? ""
                          : Math.round(m.weights[r] * 100)
                      }
                      onChange={(e) =>
                        updateMember(i, {
                          weights: {
                            ...m.weights,
                            [r]: Number(e.target.value) / 100,
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <h3 className="font-semibold">Behavioral rubric</h3>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setConfig((c) => ({
                ...c,
                rubric: [
                  ...c.rubric,
                  ...data.rubricDrafts.filter(
                    (r) =>
                      c.assignments.some(
                        (a) => a.relationship === r.relationship,
                      ) && !c.rubric.some((existing) => existing.id === r.id),
                  ),
                ],
              }))
            }
          >
            Import existing rating descriptions
          </Button>
          <p className="text-sm text-muted-foreground">
            Complete all four anchors before activation. Every assigned
            relationship needs a rubric.
          </p>
          {config.rubric.map((r, i) => (
            <details key={r.id} className="rounded-lg border p-4">
              <summary className="cursor-pointer font-medium">
                {r.name || "New competency"} · {lensName(r.relationship)}
              </summary>
              <div className="mt-4 space-y-3">
                <label className="block space-y-1 text-sm">
                  <span>Competency</span>
                  <input
                    className={fieldClass}
                    value={r.name}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        rubric: c.rubric.map((v, n) =>
                          n === i ? { ...v, name: e.target.value } : v,
                        ),
                      }))
                    }
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span>Relationship</span>
                  <select
                    className={fieldClass}
                    value={r.relationship}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        rubric: c.rubric.map((v, n) =>
                          n === i
                            ? {
                                ...v,
                                relationship: e.target
                                  .value as Rubric["relationship"],
                              }
                            : v,
                        ),
                      }))
                    }
                  >
                    {relationships.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
                {r.anchors.map((anchor, index) => (
                  <label key={index} className="block space-y-1 text-sm">
                    <span>Rating {index + 1}: observable behavior</span>
                    <textarea
                      className={fieldClass}
                      rows={2}
                      value={anchor}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          rubric: c.rubric.map((v, n) =>
                            n === i
                              ? {
                                  ...v,
                                  anchors: v.anchors.map((s, k) =>
                                    k === index ? e.target.value : s,
                                  ) as Rubric["anchors"],
                                }
                              : v,
                          ),
                        }))
                      }
                    />
                  </label>
                ))}
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() =>
                    setConfig((c) => ({
                      ...c,
                      rubric: c.rubric.filter((_, n) => n !== i),
                    }))
                  }
                >
                  Remove competency
                </Button>
              </div>
            </details>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setConfig((c) => ({
                ...c,
                rubric: [
                  ...c.rubric,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    relationship: "PEER",
                    anchors: ["", "", "", ""],
                  },
                ],
              }))
            }
          >
            Add competency
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["weeklyBudget", "Evaluatees per week", 1, 5],
              ["minObservations", "Minimum distinct incidents", 2, 12],
              ["minWeeks", "Minimum evidence weeks", 2, 12],
            ] as const
          ).map(([key, label, min, max]) => (
            <label key={key} className="space-y-1 text-sm">
              <span>{label}</span>
              <input
                className={fieldClass}
                type="number"
                min={min}
                max={max}
                value={config[key]}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, [key]: Number(e.target.value) }))
                }
              />
            </label>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Evidence thresholds are pilot rules, not a statistical guarantee.
        </p>
        {!locked && (
          <Action
            disabled={!name || !startDate}
            onClick={() =>
              save({
                action: "saveCycle",
                ...(cycle ? { id: cycle.id, revision: cycle.revision } : {}),
                name,
                startDate,
                config,
              })
            }
          >
            Save cycle draft
          </Action>
        )}
      </fieldset>
      {cycle?.status === "DRAFT" && (
        <div className="space-y-3 border-t pt-5">
          <p className="text-sm">
            Activation validates and freezes the saved cohort, rubric,
            expectations, and weights. Save any edits first.
          </p>
          <Action onClick={activate}>Activate saved cycle</Action>
        </div>
      )}
    </section>
  );
}

function Sources({ ids, evidence }: { ids: string[]; evidence: Evidence[] }) {
  return (
    <div className="mt-3 space-y-2">
      {ids.map((id) => {
        const source = evidence.find((e) => e.id === id);
        return source ? (
          <blockquote
            key={id}
            className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm"
          >
            <span className="mb-1 block font-medium">
              Week {source.week} · {lensName(source.relationship)}
            </span>
            {source.sourceQuote}
          </blockquote>
        ) : (
          <p key={id} className="text-destructive">
            Source unavailable
          </p>
        );
      })}
    </div>
  );
}
function Assessment({
  artifact,
  cycle,
  name,
  evidence,
  act,
}: {
  artifact: Artifact;
  cycle: Cycle;
  name: string;
  evidence: Evidence[];
  act: (body: unknown) => Promise<unknown>;
}) {
  const approvedRatings = [...artifact.reviews]
    .reverse()
    .find((r) => r.action === "APPROVED" && r.ratings)?.ratings;
  const [ratings, setRatings] = useState(
      approvedRatings ?? artifact.content.ratings ?? [],
    ),
    [reason, setReason] = useState("");
  const member = cycle.config.members.find(
    (m) => m.employeeId === artifact.evaluateeId,
  )!;
  const score = calculateScore(
    ratings,
    cycle.config.rubric.filter((r) => r.relationship in member.weights),
    member.weights,
  );
  return (
    <article className="rounded-xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{name}</h3>
        <Status>{artifact.status}</Status>
      </div>
      <p className="mt-2 font-medium">
        {score.overall === null
          ? "Overall score withheld — insufficient evidence"
          : `${approvedRatings ? "Reviewed" : "Proposed"} overall: ${score.overall.toFixed(2)} / 4`}
      </p>
      {ratings.map((r, i) => {
        const rubric = cycle.config.rubric.find(
          (c) => c.id === r.competencyId,
        )!;
        return (
          <div
            key={r.competencyId}
            className="mt-6 grid gap-5 border-t pt-5 lg:grid-cols-2"
          >
            <div>
              <h4 className="font-semibold">{rubric.name}</h4>
              <p className="text-sm text-muted-foreground">
                {lensName(rubric.relationship)}
              </p>
              <p className="mt-3">{r.rationale}</p>
              <label className="mt-3 block space-y-2 text-sm">
                <span>
                  Reviewed rating (AI proposed{" "}
                  {artifact.content.ratings?.[i].rating ??
                    "insufficient evidence"}
                  )
                </span>
                <select
                  className={fieldClass}
                  disabled={artifact.status !== "DRAFT"}
                  value={r.rating ?? ""}
                  onChange={(e) =>
                    setRatings((items) =>
                      items.map((item, index) =>
                        index === i
                          ? {
                              ...item,
                              rating: e.target.value
                                ? Number(e.target.value)
                                : null,
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="">Insufficient evidence</option>
                  {rubric.anchors.map((a, index) => (
                    <option key={index} value={index + 1}>
                      {index + 1} — {a}
                    </option>
                  ))}
                </select>
              </label>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer">
                  View rubric anchors
                </summary>
                {rubric.anchors.map((a, k) => (
                  <p key={k} className="mt-2">
                    {k + 1}. {a}
                  </p>
                ))}
              </details>
            </div>
            <div>
              <h5 className="text-sm font-semibold">Supporting evidence</h5>
              <Sources ids={r.sourceIds} evidence={evidence} />
              {!!r.conflictingSourceIds.length && (
                <>
                  <h5 className="mt-4 text-sm font-semibold">
                    Conflicting evidence
                  </h5>
                  <Sources ids={r.conflictingSourceIds} evidence={evidence} />
                </>
              )}
            </div>
          </div>
        );
      })}
      {artifact.status === "DRAFT" && (
        <div className="mt-6 space-y-3 border-t pt-4">
          <label className="block space-y-2 text-sm">
            <span>Review reason / rubric-based override explanation</span>
            <textarea
              className={fieldClass}
              rows={3}
              maxLength={4000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <Action
              disabled={!reason.trim() || score.overall === null}
              onClick={() =>
                act({
                  action: "review",
                  id: artifact.id,
                  decision: "APPROVED",
                  reason,
                  ratings,
                })
              }
            >
              Approve assessment
            </Action>
            <Action
              disabled={!reason.trim()}
              variant="outline"
              onClick={() =>
                act({
                  action: "review",
                  id: artifact.id,
                  decision: "RETURNED",
                  reason,
                })
              }
            >
              Return for correction
            </Action>
          </div>
        </div>
      )}
      {artifact.reviews.map((r, i) => (
        <div key={i} className="mt-4 rounded-md bg-muted p-3 text-sm">
          <p className="font-medium">{r.action.toLowerCase()}</p>
          <p>{r.reason}</p>
          {r.ratings && (
            <p>
              Reviewed overall:{" "}
              {calculateScore(
                r.ratings,
                cycle.config.rubric.filter(
                  (c) => c.relationship in member.weights,
                ),
                member.weights,
              ).overall?.toFixed(2) ?? "withheld"}{" "}
              / 4
            </p>
          )}
        </div>
      ))}
    </article>
  );
}
function ThemeEditor({
  theme,
  cycle,
  people,
  evidence,
  act,
}: {
  theme?: Theme;
  cycle: Cycle;
  people: Person[];
  evidence: Evidence[];
  act: (body: unknown) => Promise<unknown>;
}) {
  const [evaluateeId, setEvaluateeId] = useState(
      theme?.evaluateeId ?? cycle.config.members[0]?.employeeId ?? "",
    ),
    [text, setText] = useState(theme?.text ?? ""),
    [sources, setSources] = useState<string[]>(theme?.sourceIds ?? []);
  return (
    <article className="space-y-4 rounded-lg border p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-semibold">{theme ? "Edit theme" : "New theme"}</h3>
        {theme && <Status>{theme.status}</Status>}
      </div>
      <label className="block space-y-2 text-sm">
        <span>Employee</span>
        <select
          disabled={!!theme}
          className={fieldClass}
          value={evaluateeId}
          onChange={(e) => {
            setEvaluateeId(e.target.value);
            setSources([]);
          }}
        >
          {cycle.config.members.map((m) => (
            <option key={m.employeeId} value={m.employeeId}>
              {people.find((p) => p.id === m.employeeId)?.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-2 text-sm">
        <span>Development theme employees will see</span>
        <textarea
          className={fieldClass}
          rows={4}
          value={text}
          maxLength={6000}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          Supporting observations ({sources.length} selected)
        </summary>
        <div className="mt-3 max-h-64 space-y-3 overflow-auto">
          {evidence
            .filter((e) => e.evaluateeId === evaluateeId)
            .map((e) => (
              <label key={e.id} className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={sources.includes(e.id)}
                  onChange={(event) =>
                    setSources((s) =>
                      event.target.checked
                        ? [...s, e.id]
                        : s.filter((id) => id !== e.id),
                    )
                  }
                />
                <span>
                  Week {e.week}: {e.text}
                </span>
              </label>
            ))}
        </div>
      </details>
      <p className="text-sm text-muted-foreground">
        Withdrawing a released theme removes it from the employee view until you
        release it again.
      </p>
      <div className="flex flex-wrap gap-3">
        {[false, true].map((release) => (
          <Action
            key={String(release)}
            variant={release ? "default" : "outline"}
            disabled={!text.trim() || !sources.length}
            onClick={async () => {
              await act({
                action: "theme",
                cycleId: cycle.id,
                evaluateeId,
                ...(theme ? { id: theme.id } : {}),
                text,
                sourceIds: sources,
                release,
                withdraw: !release && theme?.status === "RELEASED",
              });
              if (!theme) {
                setText("");
                setSources([]);
              }
            }}
          >
            {release
              ? "Release reviewed theme"
              : theme?.status === "RELEASED"
                ? "Withdraw theme and save draft"
                : "Save draft"}
          </Action>
        ))}
      </div>
      {theme?.corrections.map((c, i) => (
        <blockquote key={i} className="rounded-md bg-muted p-3 text-sm">
          <strong>Employee context: </strong>
          {c.text}
        </blockquote>
      ))}
    </article>
  );
}
function MergeIncident({
  row,
  evidence,
  cycleId,
  act,
}: {
  row: Evidence;
  evidence: Evidence[];
  cycleId: string;
  act: (body: unknown) => Promise<unknown>;
}) {
  const [target, setTarget] = useState(""),
    [reason, setReason] = useState("");
  const candidates = evidence.filter(
    (e) =>
      e.id !== row.id &&
      e.competencyId === row.competencyId &&
      e.incidentKey !== row.incidentKey,
  );
  if (!candidates.length) return null;
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer">Group duplicate incident</summary>
      <div className="mt-3 space-y-3">
        <label className="block space-y-1">
          <span>Same event as</span>
          <select
            className={fieldClass}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">Select matching event</option>
            {candidates.map((e) => (
              <option key={e.id} value={e.id}>
                Week {e.week}: {e.text.slice(0, 120)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span>Reason</span>
          <input
            className={fieldClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <p>
          This marks existing profiles and assessments stale so they can be
          regenerated.
        </p>
        <Action
          variant="outline"
          disabled={!target || !reason.trim()}
          onClick={() =>
            act({
              action: "mergeIncident",
              cycleId,
              observationId: row.id,
              targetObservationId: target,
              reason,
            })
          }
        >
          Group as one incident
        </Action>
      </div>
    </details>
  );
}
