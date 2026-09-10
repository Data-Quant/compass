"use client";
import { useCallback, useEffect, useState } from "react";
import { Action, api, fieldClass, Status } from "./shared";

type CheckIn = {
  id: string;
  evaluateeName: string;
  relationship: string;
  week: number;
  question: string | null;
  answer: string;
  clarification: string | null;
  clarificationAnswer: string;
  noInteraction: boolean;
  revision: number;
  status: string;
  processingFailed?: boolean;
  cycle: { name: string; startDate: string; status: string };
};
type Theme = {
  id: string;
  text: string;
  releasedAt: string;
  corrections: Array<{ text: string; at: string }>;
  cycle: { name: string };
};
type Data = { checkIns: CheckIn[]; themes: Theme[] };
export function EmployeePilot() {
  const [data, setData] = useState<Data>(),
    [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      setData(await api<Data>("/api/ai-evaluations"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const pending =
    data?.checkIns.filter(
      (c) =>
        c.status !== "SUBMITTED" &&
        Date.now() <
          new Date(c.cycle.startDate).getTime() + c.week * 7 * 86400000,
    ).length ?? 0;
  return (
    <div className="mx-auto max-w-5xl space-y-10 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Weekly observations
          </h1>
          <p className="mt-2 max-w-prose text-muted-foreground">
            Share what happened and how it affected your work. You won’t be
            asked to give a score.
          </p>
        </div>
        <Action variant="outline" onClick={reload}>
          Refresh
        </Action>
      </header>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading your check-ins…</p>}
      {data && (
        <>
          <section aria-labelledby="checkins">
            <h2 id="checkins" className="mb-4 text-xl font-semibold">
              Your check-ins{" "}
              <span className="text-muted-foreground">({pending} pending)</span>
            </h2>
            <p className="mb-5 max-w-prose text-sm text-muted-foreground">
              Your source feedback is visible to authorized HR reviewers.
              Colleagues receive reviewed development themes. This is a
              development pilot; existing evaluations remain authoritative.
            </p>
            {!data.checkIns.length && (
              <p className="rounded-lg border p-6">
                No check-ins assigned yet. New weekly prompts will appear here
                when your pilot cycle starts.
              </p>
            )}
            <div className="space-y-5">
              {data.checkIns.map((c) => (
                <CheckInForm
                  key={`${c.id}:${c.revision}:${c.status}`}
                  row={c}
                  reload={reload}
                />
              ))}
            </div>
          </section>
          <section aria-labelledby="themes">
            <h2 id="themes" className="mb-4 text-xl font-semibold">
              Your development themes
            </h2>
            <p className="mb-5 text-sm text-muted-foreground">
              Reviewed by HR before sharing. Add context if something needs
              clarification.
            </p>
            {!data.themes.length && (
              <p>No reviewed themes have been released yet.</p>
            )}
            <div className="space-y-6">
              {data.themes.map((t) => (
                <ThemeCard
                  key={t.id + t.corrections.length}
                  theme={t}
                  reload={reload}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
function CheckInForm({
  row,
  reload,
}: {
  row: CheckIn;
  reload: () => Promise<void>;
}) {
  const [answer, setAnswer] = useState(row.answer),
    [clarificationAnswer, setClarification] = useState(row.clarificationAnswer),
    [noInteraction, setNoInteraction] = useState(row.noInteraction);
  const closed =
    Date.now() >=
    new Date(row.cycle.startDate).getTime() + row.week * 7 * 86400000;
  const editable =
    row.status === "DRAFT" && row.cycle.status === "ACTIVE" && !closed;
  const send = async (action: "save" | "clarify" | "submit") => {
    await api("/api/ai-evaluations", {
      action,
      id: row.id,
      revision: row.revision,
      answer,
      clarificationAnswer,
      noInteraction,
    });
    await reload();
  };
  return (
    <article className="rounded-xl border bg-card p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{row.evaluateeName}</h3>
        <Status>
          {closed && row.status !== "SUBMITTED"
            ? "CLOSED"
            : row.processingFailed
              ? "PROCESSING_FAILED"
              : row.status}
        </Status>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {row.cycle.name} · Week {row.week} ·{" "}
        {row.relationship.toLowerCase().replaceAll("_", " ")}
      </p>
      {row.processingFailed && (
        <p role="status" className="mt-4 text-sm">
          Processing could not finish. Your saved response is safe. HR can retry
          the failed operation.
        </p>
      )}
      {!row.question ? (
        <p className="mt-5" role="status">
          Your question is being prepared. Refresh to check progress; HR can
          resolve a failed generation.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          <label className="block space-y-2" htmlFor={`answer-${row.id}`}>
            <span className="font-medium">{row.question}</span>
            <textarea
              id={`answer-${row.id}`}
              className={fieldClass}
              rows={4}
              maxLength={8000}
              value={answer}
              disabled={!editable || noInteraction}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="What was agreed? What happened? What was the outcome?"
            />
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={noInteraction}
              disabled={!editable}
              onChange={(e) => setNoInteraction(e.target.checked)}
            />
            No relevant interaction to describe
          </label>
          {row.clarification && (
            <label
              className="block space-y-2"
              htmlFor={`clarification-${row.id}`}
            >
              <span className="font-medium">{row.clarification}</span>
              <textarea
                id={`clarification-${row.id}`}
                className={fieldClass}
                rows={3}
                value={clarificationAnswer}
                maxLength={4000}
                disabled={!editable || noInteraction}
                onChange={(e) => setClarification(e.target.value)}
              />
            </label>
          )}
          {row.status === "CLARIFYING" && (
            <p role="status">
              Preparing one follow-up question. Refresh shortly.
            </p>
          )}
          {editable && (
            <div className="flex flex-wrap gap-3">
              <Action
                onClick={() => send("submit")}
                disabled={!noInteraction && !answer.trim()}
              >
                Submit observation
              </Action>
              <Action variant="outline" onClick={() => send("save")}>
                Save draft
              </Action>
              {row.clarification === null && (
                <Action
                  variant="ghost"
                  disabled={!answer.trim() || noInteraction}
                  onClick={() => send("clarify")}
                >
                  Help me add detail
                </Action>
              )}
            </div>
          )}
          {row.status === "SUBMITTED" && (
            <p className="text-sm text-muted-foreground">
              Submitted. Your original observation has been preserved.
            </p>
          )}
        </div>
      )}
    </article>
  );
}
function ThemeCard({
  theme,
  reload,
}: {
  theme: Theme;
  reload: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  return (
    <article className="border-t pt-5">
      <p className="text-sm text-muted-foreground">
        {theme.cycle.name} · Reviewed theme
      </p>
      <p className="mt-3 max-w-prose whitespace-pre-wrap">{theme.text}</p>
      {theme.corrections.map((c, i) => (
        <blockquote key={i} className="mt-4 rounded-md bg-muted p-3 text-sm">
          Your context: {c.text}
        </blockquote>
      ))}
      <label className="mt-5 block space-y-2" htmlFor={`context-${theme.id}`}>
        <span className="text-sm font-medium">Add context for HR</span>
        <textarea
          id={`context-${theme.id}`}
          className={fieldClass}
          rows={2}
          maxLength={4000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="mt-3">
        <Action
          disabled={!text.trim()}
          variant="outline"
          onClick={async () => {
            await api("/api/ai-evaluations", {
              action: "correct",
              id: theme.id,
              text,
            });
            await reload();
          }}
        >
          Send context to HR
        </Action>
      </div>
    </article>
  );
}
