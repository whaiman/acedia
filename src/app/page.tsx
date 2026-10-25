"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import "./globals.css";

type ObligationResult = {
  action: string;
  completion: string;
  rationale: string;
  deadlineNote: string;
  source: string;
};

const DEFAULT_TASK =
  "I need to submit a university report by Friday. I have notes, but no structure yet.";

const EXAMPLES = [
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

function compileObligation(input: string): ObligationResult {
  const text = input.trim();
  const normalized = text.toLocaleLowerCase();

  let action: string;
  let completion: string;
  let rationale: string;

  if (
    /(submit|submission|send|deliver|turn in|hand in|сдать|отправить|подать|представить|подача)/i.test(
      normalized,
    )
  ) {
    action =
      "Find the official submission requirements and list what must be delivered.";
    completion =
      "A checklist names the required format, materials, submission channel, and exact deadline.";
    rationale =
      "This clarifies what “done” means before you spend time polishing the work.";
  } else if (
    /(customs|paperwork|document|application|passport|tax|form|parcel|заявлен|документ|паспорт|тамож|налог|анкета|справк|посылк)/i.test(
      normalized,
    )
  ) {
    action =
      "Confirm the exact document list with the authority handling the procedure.";
    completion =
      "You have a checklist of required documents, where each requirement came from, and what is still missing.";
    rationale =
      "Confirming the requirements first reduces the risk of making a wasted trip or preparing the wrong documents.";
  } else if (
    /(code|bug|feature|implement|develop|software|program|repository|код|ошибк|функци|разработ|программ|репозитор)/i.test(
      normalized,
    )
  ) {
    action =
      "Define one observable behaviour and identify the smallest place to implement it.";
    completion =
      "One sentence describes the expected behaviour, and one relevant file or module is identified.";
    rationale =
      "A small, testable slice is easier to implement and verify than an entire feature at once.";
  } else if (
    /(report|essay|article|lecture|study|exam|write|notes|report|учить|экзамен|лекци|конспект|отч[её]т|стат[ьи]|написать|подготов)/i.test(
      normalized,
    )
  ) {
    action = "Create a rough outline with three to five section headings.";
    completion =
      "The document has a title and three to five headings. No polishing is required yet.";
    rationale =
      "An outline makes the work visible and gives you a structure to fill in one section at a time.";
  } else {
    action = "Write one sentence describing the finished outcome.";
    completion =
      "One sentence states the expected result and a condition that proves the task is finished.";
    rationale =
      "Making the outcome observable is the smallest step from a vague obligation to actionable work.";
  }

  const deadlineMentioned =
    /\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|deadline|due|asap)\b|сегодня|завтра|дедлайн|срок|до\s+\w+/i.test(
      normalized,
    );

  return {
    action,
    completion,
    rationale,
    deadlineNote: deadlineMentioned
      ? "Deadline language was found. Confirm the exact date; this prototype does not calculate dates."
      : "No explicit deadline was detected. Add one if timing affects priority.",
    source: text.length > 150 ? `${text.slice(0, 147).trimEnd()}…` : text,
  };
}

export default function Home() {
  const [task, setTask] = useState(DEFAULT_TASK);
  const [result, setResult] = useState<ObligationResult | null>(() =>
    compileObligation(DEFAULT_TASK),
  );
  const [resultMode, setResultMode] = useState<"example" | "compiled">(
    "example",
  );
  const [isComplete, setIsComplete] = useState(false);

  function handleCompile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!task.trim()) return;

    setResult(compileObligation(task));
    setResultMode("compiled");
    setIsComplete(false);
  }

  function handleTaskChange(value: string) {
    setTask(value);
    setResult(null);
    setIsComplete(false);
    setResultMode("compiled");
  }

  function loadExample(example: (typeof EXAMPLES)[number]) {
    setTask(example.text);
    setResult(null);
    setIsComplete(false);
    setResultMode("compiled");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Application sidebar">
        <Link className="brand-mark" href="/" aria-label="Obligation Compiler home">
          oc<span>.</span>
        </Link>

        <div className="sidebar-divider" />

        <div className="sidebar-nav" aria-label="Current section">
          <div
            className="nav-item nav-item-active"
            aria-current="page"
            title="Compiler"
          >
            <span className="nav-icon" aria-hidden="true">
              ↳
            </span>
          </div>
        </div>

        <div className="sidebar-bottom">
          <span className="sidebar-status-dot" />
          <span>LOCAL</span>
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
                    >
                      {example.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="editor-footer">
                <div className="privacy-note">
                  <span className="status-dot" />
                  <span>Processed in this browser</span>
                </div>

                <button
                  className="compile-button"
                  type="submit"
                  disabled={!task.trim()}
                >
                  <span>Compile obligation</span>
                  <span className="button-arrow" aria-hidden="true">
                    ↗
                  </span>
                </button>
              </div>
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
                <div className="result-topline">
                  <span className="result-mode">
                    {resultMode === "example"
                      ? "EXAMPLE OUTPUT"
                      : "RULE-BASED OUTPUT"}
                  </span>

                  <span
                    className={`priority-badge ${isComplete ? "priority-badge-complete" : ""}`}
                  >
                    <span className="priority-dot" />
                    {isComplete ? "COMPLETED" : "START HERE"}
                  </span>
                </div>

                <h3 className={`action-title ${isComplete ? "action-title-complete" : ""}`}>
                  {result.action}
                </h3>

                <div className="focus-hint">
                  <span className="focus-hint-symbol" aria-hidden="true">
                    ↳
                  </span>
                  ONE STEP. THEN REASSESS.
                </div>

                <div className="detail-card">
                  <div className="detail-label">
                    <span className="detail-label-symbol" aria-hidden="true">
                      ✓
                    </span>
                    DONE WHEN
                  </div>
                  <p>{result.completion}</p>
                </div>

                <div className="detail-card">
                  <div className="detail-label">
                    <span className="detail-label-symbol" aria-hidden="true">
                      ↗
                    </span>
                    WHY THIS FIRST
                  </div>
                  <p>{result.rationale}</p>
                </div>

                <div className="constraint-note">
                  <div className="constraint-label">CONSTRAINT CHECK</div>
                  <p>{result.deadlineNote}</p>
                </div>

                <div className="source-context">
                  <div className="source-label">BASED ON YOUR INPUT</div>
                  <blockquote>“{result.source}”</blockquote>
                </div>

                <button
                  type="button"
                  className={`complete-button ${isComplete ? "complete-button-done" : ""}`}
                  onClick={() => setIsComplete(true)}
                  disabled={isComplete}
                >
                  <span>{isComplete ? "Step completed" : "Mark step complete"}</span>
                  <span aria-hidden="true">{isComplete ? "✓" : "→"}</span>
                </button>
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

            <div className="output-footer">
              <span className="output-footer-dot" />
              <span>RULE-BASED PROTOTYPE</span>
              <span className="output-footer-separator">/</span>
              <span>NO AI MODEL CONNECTED</span>
            </div>
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
