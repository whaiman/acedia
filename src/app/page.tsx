"use client";

import { useState, type FormEvent, useEffect } from "react";
import Link from "next/link";
import { exampleScenarios } from "@/lib/acedia/examples";

type EngineResult =
  | { kind: "action"; obligationId: string; title: string; action: string; doneWhen: string; reason: string[]; deadlineNote?: string; deferred: DeferredItem[]; uncertainty: string[] }
  | { kind: "needs-info"; question: string; reason: string }
  | { kind: "all-done" };

type DeferredItem =
  | { kind: "waiting"; id: string; title: string; reason: string; reviewWhen: string }
  | { kind: "safe"; id: string; title: string; reason: string; reviewAt: string; reconsiderIf: string }
  | { kind: "not-justified"; id: string; title: string; reason: string };

type Obligation = {
  id: string;
  title: string;
  deadline?: string;
  dependsOn: string[];
  effort?: "tiny" | "small" | "medium" | "large";
  irreversible?: boolean;
  firstStep?: string;
  doneWhen?: string;
  sourceQuote?: string;
  done?: boolean;
};

type CompileResponse = {
  obligations: Obligation[];
  result: EngineResult;
  today: string;
  usedModel: boolean;
  warnings: string[];
  model?: string;
};

const DEFAULT_TASK =
  "I need to submit a university report by Friday. I have notes, but no structure yet.";

const STATIC_EXAMPLES = [
  {
    label: "University report",
    text: DEFAULT_TASK,
  },
  {
    label: "Customs paperwork",
    text: "I need to collect a parcel, but customs says I may need extra documents. I don't know exactly which documents are required yet.",
  },
  {
    label: "Software feature",
    text: "I need to add CSV export to my project. I have not started and the task feels too large.",
  },
];

export default function Home() {
  const [dynamicExamples, setDynamicExamples] = useState<typeof STATIC_EXAMPLES>([]);
  const [task, setTask] = useState(DEFAULT_TASK);
  const [result, setResult] = useState<CompileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Initialize dark mode from localStorage or system preference
  useEffect(() => {
    const stored = localStorage.getItem("acedia-theme");
    if (stored) {
      setIsDark(stored === "dark");
      document.documentElement.classList.toggle("dark", stored === "dark");
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  // Persist dark mode preference
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("acedia-theme", isDark ? "dark" : "light");
  }, [isDark]);

  // Generate dynamic examples on mount (client-side only)
  useEffect(() => {
    const today = new Date();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDynamicExamples(exampleScenarios(today));
  }, []);

  const EXAMPLES = [...STATIC_EXAMPLES, ...dynamicExamples];

  async function handleCompile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!task.trim()) return;

    setIsLoading(true);
    setError(null);
    setIsComplete(false);

    try {
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: task }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to compile");
      }

      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMarkComplete() {
    if (!result || result.result.kind !== "action") return;

    setIsLoading(true);
    setError(null);

    try {
      // Call the engine locally via API to get next recommendation
      // We send the updated obligations with the completed one marked as done
      const completedId = result.result.obligationId;
      const updatedObligations = result.obligations.map((o) =>
        o.id === completedId ? { ...o, done: true } : o
      );

      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: task, obligations: updatedObligations }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to get next step");
      }

      const data = await res.json();
      setResult(data);
      setIsComplete(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }

  function handleTaskChange(value: string) {
    setTask(value);
    setResult(null);
    setError(null);
    setIsComplete(false);
  }

  function loadExample(example: (typeof EXAMPLES)[number]) {
    setTask(example.text);
    setResult(null);
    setError(null);
    setIsComplete(false);
  }

  function formatDeferred(d: DeferredItem): React.ReactNode {
    switch (d.kind) {
      case "waiting":
        return (
          <span className="deferred-item deferred-waiting">
            <span className="deferred-badge">WAITING</span>
            <span>{d.title} — {d.reason} (review: {d.reviewWhen})</span>
          </span>
        );
      case "safe":
        return (
          <span className="deferred-item deferred-safe">
            <span className="deferred-badge">SAFE</span>
            <span>{d.title} — {d.reason} (reconsider by {d.reviewAt})</span>
          </span>
        );
      case "not-justified":
        return (
          <span className="deferred-item deferred-not-justified">
            <span className="deferred-badge">NOT JUSTIFIED</span>
            <span>{d.title} — {d.reason}</span>
          </span>
        );
    }
  }

  const modelName = result?.model ? result.model.split("/").pop() || result.model : null;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Application sidebar">
        <Link className="brand-mark" href="/" aria-label="Obligation Compiler home">
          oc<span>.</span>
        </Link>

        <div className="sidebar-divider" />

        <div className="sidebar-nav" aria-label="Current section">
          <div className="nav-item nav-item-active" aria-current="page" title="Compiler">
            <span className="nav-icon" aria-hidden="true">↳</span>
          </div>
        </div>

        <div className="sidebar-bottom">
          <span className="sidebar-status-dot" />
          <span>LOCAL</span>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setIsDark((prev) => !prev)}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Light mode" : "Dark mode"}
          >
            {isDark ? "☀️" : "🌙"}
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <span className="breadcrumb-muted">WORKSPACE</span>
            <span className="breadcrumb-slash">/</span>
            <span>Obligation Compiler</span>
          </div>

          <div className="local-pill">
            <span className="status-dot" />
            {result?.usedModel && modelName ? (
              <>
                <span className="model-badge">MODEL: {modelName}</span>
                <span className="local-pill-separator">/</span>
              </>
            ) : null}
            LOCAL PROTOTYPE
          </div>
        </header>

        <section className="hero">
          <div className="eyebrow">
            <span className="eyebrow-number">01</span>
            FROM OBLIGATION TO ACTION
          </div>

          <h1>
            Make the next step
            <br />
            <span>impossible to misunderstand.</span>
          </h1>

          <p className="hero-description">
            Turn a task, a deadline, or a pile of requirements into one
            concrete action. Do that first. Reassess everything else later.
          </p>
        </section>

        <div className="workspace-grid">
          <section className="panel input-panel" aria-labelledby="input-title">
            <div className="panel-heading">
              <div className="panel-heading-left">
                <span className="panel-index">01</span>
                <h2 id="input-title">The obligation</h2>
              </div>
              <span className="panel-tag">INPUT</span>
            </div>

            <form onSubmit={handleCompile} className="task-form">
              <label className="field-label" htmlFor="obligation">
                What needs to get done?
              </label>

              <textarea
                id="obligation"
                name="obligation"
                className="task-input"
                value={task}
                onChange={(event) => handleTaskChange(event.target.value)}
                placeholder="Describe the task, the deadline, or the requirements you have to deal with..."
                rows={7}
                required
                disabled={isLoading}
              />

              <div className="examples">
                <span className="examples-label">LOAD AN EXAMPLE</span>
                <div className="example-buttons">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example.label}
                      type="button"
                      className="example-button"
                      onClick={() => loadExample(example)}
                      disabled={isLoading}
                    >
                      {example.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}

              <div className="editor-footer">
                <div className="privacy-note">
                  <span className="status-dot" />
                  <span>
                    {result?.usedModel ? `LLM: ${modelName}` : "Processed locally (rule-based)"}
                    {result && !result.usedModel && result.warnings.some(w => w.includes("Model failed")) && (
                      <span className="fallback-badge"> ⚠ Model unavailable — using simple parser</span>
                    )}
                  </span>
                </div>

                <button
                  className="compile-button"
                  type="submit"
                  disabled={!task.trim() || isLoading}
                >
                  <span>{isLoading ? "Compiling…" : "Compile obligation"}</span>
                  <span className="button-arrow" aria-hidden="true">↗</span>
                </button>
              </div>

              {isLoading && (
                <div className="loading-indicator">
                  <div className="loading-spinner" aria-hidden="true" />
                  <span className="loading-text">Compiling…</span>
                  {result?.warnings?.length && (
                    <span className="loading-warning">⚠ {result.warnings[0]}</span>
                  )}
                </div>
              )}
            </form>
          </section>

          <section className="panel output-panel" aria-labelledby="output-title">
            <div className="panel-heading output-heading">
              <div className="panel-heading-left">
                <span className="panel-index output-index">02</span>
                <h2 id="output-title">The next step</h2>
              </div>
              <span className="panel-tag output-tag">OUTPUT</span>
            </div>

            {result ? (
              <div className="result-content" aria-live="polite">
                {result.result.kind === "action" ? (
                  <>
                    <div className="result-topline">
                      <span className="result-mode">
                        {result.usedModel ? `LLM + ENGINE` : "ENGINE OUTPUT"}
                      </span>

                      <span
                        className={`priority-badge ${isComplete ? "priority-badge-complete" : ""}`}
                      >
                        <span className="priority-dot" />
                        {isComplete ? "COMPLETED" : "START HERE"}
                      </span>
                    </div>

                    <h3 className={`action-title ${isComplete ? "action-title-complete" : ""}`}>
                      {result.result.action}
                    </h3>

                    <div className="focus-hint">
                      <span className="focus-hint-symbol" aria-hidden="true">↳</span>
                      ONE STEP. THEN REASSESS.
                    </div>

                    <div className="detail-card">
                      <div className="detail-label">
                        <span className="detail-label-symbol" aria-hidden="true">✓</span>
                        DONE WHEN
                      </div>
                      <p>{result.result.doneWhen}</p>
                    </div>

                    <div className="detail-card">
                      <div className="detail-label">
                        <span className="detail-label-symbol" aria-hidden="true">↗</span>
                        WHY THIS FIRST
                      </div>
                      <ul className="reason-list">
                        {result.result.reason.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>

                    {result.result.deadlineNote && (
                      <div className="constraint-note">
                        <div className="constraint-label">CONSTRAINT CHECK</div>
                        <p>{result.result.deadlineNote}</p>
                      </div>
                    )}

                    {result.result.uncertainty.length > 0 && (
                      <div className="constraint-note uncertainty-note">
                        <div className="constraint-label">UNCERTAINTY</div>
                        <ul className="uncertainty-list">
                          {result.result.uncertainty.map((u) => (
                            <li key={u}>{u}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {result.result.deferred.length > 0 && (
                      <div className="detail-card deferred-section">
                        <div className="detail-label">
                          <span className="detail-label-symbol" aria-hidden="true">📋</span>
                          OTHER ITEMS
                        </div>
                        <div className="deferred-list">
                          {result.result.deferred.map((d) => (
                            <div key={d.id} className="deferred-item-wrapper">{formatDeferred(d)}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="source-context">
                      <div className="source-label">BASED ON YOUR INPUT</div>
                      <blockquote>“{task.length > 150 ? `${task.slice(0, 147).trimEnd()}…` : task}”</blockquote>
                    </div>

                    <button
                      type="button"
                      className={`complete-button ${isComplete ? "complete-button-done" : ""}`}
                      onClick={handleMarkComplete}
                      disabled={isComplete || isLoading}
                    >
                      <span>{isLoading ? "Getting next step…" : isComplete ? "Step completed" : "Mark step complete"}</span>
                      <span aria-hidden="true">{isComplete ? "✓" : "→"}</span>
                    </button>
                  </>
                ) : result.result.kind === "needs-info" ? (
                  <div className="empty-state" aria-live="polite">
                    <div className="empty-symbol empty-symbol-warning" aria-hidden="true">
                      ?
                    </div>
                    <h3>Need more information</h3>
                    <p>{result.result.question}</p>
                    <p className="needs-info-reason">{result.result.reason}</p>
                  </div>
                ) : (
                  <div className="empty-state" aria-live="polite">
                    <div className="empty-symbol empty-symbol-success" aria-hidden="true">
                      ✓
                    </div>
                    <h3>All done!</h3>
                    <p>No open obligations remain.</p>
                  </div>
                )}

                <div className="output-footer">
                  <span className="output-footer-dot" />
                  <span>{result.usedModel ? `LLM: ${modelName} → ` : ""}ENGINE: parseText + recommend</span>
                  {result.warnings.length > 0 && (
                    <>
                      <span className="output-footer-separator">/</span>
                      <span className="output-warning">⚠ {result.warnings[0]}</span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty-state" aria-live="polite">
                <div className="empty-symbol" aria-hidden="true">
                  ↘
                </div>
                <h3>Your next step will appear here.</h3>
                <p>
                  Describe an obligation and compile it to get one action,
                  a finish line, and a reason to start there.
                </p>
                <div className="empty-caption">
                  ONE ACTION <span>·</span> ONE FINISH LINE
                </div>
              </div>
            )}
          </section>
        </div>

        <footer className="page-footer">
          <span>OBLIGATION COMPILER · PROTOTYPE 0.1</span>
          <span>Make progress visible. Keep the next step small.</span>
        </footer>
      </main>
    </div>
  );
}