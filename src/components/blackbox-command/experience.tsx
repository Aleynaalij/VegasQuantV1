"use client";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleDot,
  Command,
  FileCheck2,
  Fingerprint,
  Layers3,
  LockKeyhole,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  evidence,
  fixtureStamp,
  memories,
  searchMemory,
  resolveView,
  tasks,
  type EvidenceId,
} from "./model";
import s from "./experience.module.css";

type View = "command" | "operations" | "memory" | "security";
const views = [
  { id: "command", label: "Command", icon: Command },
  { id: "operations", label: "Operations", icon: Layers3 },
  { id: "memory", label: "Memory", icon: BookOpen },
  { id: "security", label: "Control", icon: ShieldCheck },
] as const;
function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <span className={`${s.badge} ${s[tone] || ""}`}>
      <span />
      {children}
    </span>
  );
}
export function CommandExperience() {
  const [view, setView] = useState<View>("command");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<EvidenceId | null>(null);
  const [scenario, setScenario] = useState("ready");
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const onHash = () => {
      setView(resolveView(location.hash));
      dialog.current?.close();
      setSelected(null);
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  function navigate(next: View) {
    setView(next);
    location.hash = next;
    requestAnimationFrame(() => heading.current?.focus());
  }
  function openEvidence(id: EvidenceId) {
    returnFocus.current = document.activeElement as HTMLElement;
    setSelected(id);
  }
  useEffect(() => {
    if (selected) {
      dialog.current?.showModal();
      dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }, [selected]);
  function closeEvidence() {
    dialog.current?.close();
    setSelected(null);
    returnFocus.current?.focus();
  }
  const ref = (id: EvidenceId) => (
    <button
      className={s.evidence}
      onClick={() => openEvidence(id)}
      aria-label={`Inspect evidence ${id}`}
    >
      <FileCheck2 size={14} />
      {id}
      <ArrowUpRight size={13} />
    </button>
  );
  const title = {
    command: "Clarity. Before action.",
    operations: "The work, in focus.",
    memory: "Intelligence that compounds.",
    security: "Control is deliberate.",
  }[view];
  return (
    <div className={s.root}>
      <a className={s.skip} href="#command-main">
        Skip to workspace
      </a>
      <aside className={s.sidebar} aria-label="Blackbox navigation">
        <div className={s.brand}>
          <div className={s.brandMark}>
            <Layers3 size={23} />
          </div>
          <div>
            BLACKBOX<span>COMMAND / VEGAS QUANT</span>
          </div>
        </div>
        <div className={s.workspaceLabel}>EXECUTIVE WORKSPACE</div>
        <nav>
          {views.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={(e) => {
                e.preventDefault();
                navigate(id);
              }}
              aria-current={view === id ? "page" : undefined}
              className={view === id ? s.activeNav : ""}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "security" && <small>01</small>}
            </a>
          ))}
        </nav>
        <div className={s.sidebarBottom}>
          <div className={s.mode}>
            <LockKeyhole size={16} />
            <span>
              Human authority
              <br />
              <small>No autonomous execution</small>
            </span>
          </div>
          <div className={s.person}>
            <span className={s.avatar}>MA</span>
            <div>
              Mike Anderson<small>CEO · illustrative identity</small>
            </div>
          </div>
        </div>
      </aside>
      <div className={s.body}>
        <header className={s.topbar}>
          <span className={s.mobileBrand}>
            BLACKBOX<span> / COMMAND</span>
          </span>
          <span className={s.breadcrumb}>
            WORKSPACE <ChevronRight size={13} /> {view.toUpperCase()}
          </span>
          <span className={s.environment}>
            <span /> DESIGN PREVIEW
          </span>
        </header>
        <div className={s.synthetic}>
          <Fingerprint size={15} />
          <span>
            <strong>SYNTHETIC DATA</strong> · Interactive design demonstration.
            No live monitoring, permissions, or execution.
          </span>
        </div>
        <main id="command-main" className={s.main}>
          <div className={s.pageHeading}>
            <div>
              <p className={s.eyebrow}>
                {view === "command"
                  ? "YOUR EXECUTIVE BRIEF"
                  : `BLACKBOX / ${view === "security" ? "SECURITY & APPROVALS" : view.toUpperCase()}`}
              </p>
              <h1 ref={heading} tabIndex={-1}>
                {title}
              </h1>
              <p className={s.subtitle}>
                Evidence first. Clear ownership. Human decisions.
              </p>
            </div>
            <div className={s.timestamp}>
              <span>FIXTURE SNAPSHOT</span>
              {fixtureStamp}
            </div>
          </div>
          <div className={s.stateTools}>
            <label>
              <SlidersHorizontal size={14} /> Preview state{" "}
              <select
                aria-label="Preview state"
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
              >
                <option value="ready">Ready</option>
                <option value="loading">Loading</option>
                <option value="empty">Empty</option>
                <option value="error">Unavailable</option>
                <option value="disabled">Emergency disabled</option>
              </select>
            </label>
            <span>No changes are saved</span>
          </div>
          {scenario !== "ready" ? (
            <section className={s.statePanel} aria-live="polite">
              <LockKeyhole size={32} />
              <p className={s.eyebrow}>SYNTHETIC STATE</p>
              <h2>
                {
                  {
                    loading: "Gathering the evidence",
                    empty: "A clean workspace",
                    error: "Evidence is unavailable",
                    disabled: "Operations are disabled",
                  }[scenario]
                }
              </h2>
              <p>
                {
                  {
                    loading:
                      "Loading is not proof of platform health. This demonstration remains here until you choose Ready.",
                    empty:
                      "No items are available in this example. An empty queue does not prove that production has no incidents.",
                    error:
                      "The source could not be read. Preserve the last verified state and investigate before taking action.",
                    disabled:
                      "The emergency-disable state blocks all operational actions. This preview has not changed a real permission or switch.",
                  }[scenario]
                }
              </p>
              <button
                className={s.primary}
                onClick={() => setScenario("ready")}
              >
                Return to ready preview <ArrowRight size={16} />
              </button>
            </section>
          ) : (
            <>
              {view === "command" && (
                <>
                  <div className={s.commandGrid}>
                    <section className={`${s.panel} ${s.briefing}`}>
                      <div className={s.sectionTop}>
                        <span className={s.sectionLabel}>
                          <CircleDot size={17} /> DIRECTOR BRIEFING
                        </span>
                        <Badge tone="gold">Attention required</Badge>
                      </div>
                      <h2>
                        One contradiction.
                        <br />
                        <span>One clear next move.</span>
                      </h2>
                      <p>
                        A publication record conflicts with its journal.
                        Reconcile the evidence before a release decision.
                        Engineering can continue within staging.
                      </p>
                      <div className={s.briefLinks}>
                        {ref("EV-021")}
                        {ref("EV-023")}
                      </div>
                      <div className={s.briefFooter}>
                        <span className={s.directorIcon}>E</span>
                        <div>
                          Elo / Director
                          <small>Evidence-linked summary · synthetic</small>
                        </div>
                        <button
                          onClick={() => navigate("operations")}
                          className={s.textButton}
                        >
                          Open investigation <ArrowRight size={17} />
                        </button>
                      </div>
                    </section>
                    <section className={`${s.panel} ${s.health}`}>
                      <div className={s.sectionTop}>
                        <span className={s.sectionLabel}>
                          PLATFORM CONFIDENCE
                        </span>
                        <Activity size={17} />
                      </div>
                      <div className={s.healthGlyph}>
                        <span />
                        <span />
                        <span />
                        <LockKeyhole size={25} />
                      </div>
                      <h2>Not yet established</h2>
                      <p>
                        No live health telemetry is connected to this design.
                      </p>
                      <div className={s.healthRows}>
                        <span>
                          Source coverage<strong>Fixture only</strong>
                        </span>
                        <span>
                          Production health<strong>Unknown</strong>
                        </span>
                        <span>
                          Autonomous execution<strong>Off</strong>
                        </span>
                      </div>
                      {ref("EV-025")}
                    </section>
                  </div>
                  <div className={s.metrics}>
                    <button onClick={() => navigate("operations")}>
                      <span>PRIORITY INCIDENTS</span>
                      <strong>
                        01 <ArrowUpRight size={20} />
                      </strong>
                      <small>Evidence contradiction</small>
                    </button>
                    <button onClick={() => navigate("operations")}>
                      <span>ENGINEERING PACKAGES</span>
                      <strong>
                        03 <ArrowUpRight size={20} />
                      </strong>
                      <small>One active · one review · one blocked</small>
                    </button>
                    <button onClick={() => navigate("security")}>
                      <span>DECISION QUEUE</span>
                      <strong>
                        01 <ArrowUpRight size={20} />
                      </strong>
                      <small>Not ready for authorization</small>
                    </button>
                  </div>
                  <div className={s.twoCol}>
                    <section className={s.panel}>
                      <div className={s.sectionTop}>
                        <h2>Needs attention</h2>
                        <span className={s.muted}>01 / PRIORITY</span>
                      </div>
                      <div className={s.incident}>
                        <div>
                          <Badge tone="red">Evidence conflict</Badge>
                          <span className={s.mono}>BB-041</span>
                        </div>
                        <h3>A post exists. The journal says failed.</h3>
                        <p>
                          Two sources disagree for the same slate. Publication
                          remains visible; the contradiction remains open.
                        </p>
                        <div className={s.contradiction}>
                          <span>
                            <small>DEALER RECORD</small>
                            <strong>
                              Published <Check size={15} />
                            </strong>
                          </span>
                          <span>
                            <small>RUN JOURNAL</small>
                            <strong>
                              Failed <X size={15} />
                            </strong>
                          </span>
                        </div>
                        <div className={s.rowFooter}>
                          {ref("EV-021")}
                          <span>Owner / Codex</span>
                        </div>
                      </div>
                    </section>
                    <section className={s.panel}>
                      <div className={s.sectionTop}>
                        <h2>Engineering movement</h2>
                        <span className={s.muted}>ILLUSTRATIVE</span>
                      </div>
                      <div className={s.timeline}>
                        {[
                          {
                            time: "09:40",
                            who: "Claude",
                            text: "Verification package awaits independent review",
                            id: "EV-022",
                          },
                          {
                            time: "09:38",
                            who: "Codex",
                            text: "Contradictory publication evidence attached",
                            id: "EV-021",
                          },
                          {
                            time: "09:35",
                            who: "Elo",
                            text: "Production decision held behind review",
                            id: "EV-023",
                          },
                        ].map((x) => (
                          <div key={x.time}>
                            <span className={s.timelineDot} />
                            <small>{x.time} ET</small>
                            <h3>{x.who}</h3>
                            <p>{x.text}</p>
                            {ref(x.id as EvidenceId)}
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </>
              )}
              {view === "operations" && (
                <>
                  <section className={`${s.panel} ${s.operationBanner}`}>
                    <div>
                      <p className={s.eyebrow}>EXECUTION BOUNDARY</p>
                      <h2>
                        Staging moves forward.
                        <br />
                        Production waits for evidence.
                      </h2>
                    </div>
                    <Badge tone="gold">Independent review required</Badge>
                  </section>
                  <div className={s.agentGrid}>
                    {[
                      {
                        name: "Codex",
                        initial: "C",
                        role: "Engineering",
                        work: "1 investigation",
                        color: "blue",
                      },
                      {
                        name: "Claude",
                        initial: "CL",
                        role: "Architecture & review",
                        work: "1 review package",
                        color: "gold",
                      },
                      {
                        name: "Elo",
                        initial: "E",
                        role: "Operations director",
                        work: "1 decision packet",
                        color: "green",
                      },
                    ].map((a) => (
                      <section key={a.name} className={s.agent}>
                        <span className={`${s.agentAvatar} ${s[a.color]}`}>
                          {a.initial}
                        </span>
                        <div>
                          <h2>{a.name}</h2>
                          <p>{a.role}</p>
                          <strong>{a.work}</strong>
                          <small>Fixture role · presence unknown</small>
                        </div>
                      </section>
                    ))}
                  </div>
                  <div className={s.sectionTop}>
                    <h2>Execution packages</h2>
                    <span className={s.muted}>
                      DEPENDENCY ORDER · 03 PACKAGES
                    </span>
                  </div>
                  <div className={s.packages}>
                    {tasks.map((task, i) => (
                      <section className={s.package} key={task.id}>
                        <div className={s.packageIndex}>0{i + 1}</div>
                        <div className={s.packageContent}>
                          <div className={s.sectionTop}>
                            <span className={s.mono}>
                              {task.id} / {task.discipline}
                            </span>
                            <Badge tone={task.tone}>{task.state}</Badge>
                          </div>
                          <h2>{task.title}</h2>
                          <p>{task.summary}</p>
                          <div className={s.packageMeta}>
                            <span>
                              OWNER <strong>{task.owner}</strong>
                            </span>
                            <span>
                              DEPENDENCY <strong>{task.dependency}</strong>
                            </span>
                          </div>
                          <details>
                            <summary>
                              Investigation plan & acceptance{" "}
                              <ChevronRight size={16} />
                            </summary>
                            <ol>
                              {task.steps.map((step) => (
                                <li key={step}>{step}</li>
                              ))}
                            </ol>
                            <p>
                              Completion requires independent, revision-bound
                              evidence. This example has not executed a task.
                            </p>
                          </details>
                          <div className={s.rowFooter}>
                            {ref(task.evidence)}
                            <span>Read-only package</span>
                          </div>
                        </div>
                      </section>
                    ))}
                  </div>
                </>
              )}
              {view === "memory" && (
                <>
                  <section className={`${s.panel} ${s.memoryHero}`}>
                    <BookOpen size={30} />
                    <div>
                      <h2>
                        Keep the lesson.
                        <br />
                        <span>Keep the provenance.</span>
                      </h2>
                      <p>
                        Verified resolutions, proposed improvements and
                        hypotheses stay visibly distinct.
                      </p>
                    </div>
                  </section>
                  <label className={s.search}>
                    <Search size={19} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search lessons, classifications, evidence…"
                      aria-label="Search organizational memory"
                    />
                    <kbd>/ MEMORY</kbd>
                  </label>
                  <div className={s.memoryCount} aria-live="polite">
                    {searchMemory(query).length} of {memories.length} synthetic
                    records
                  </div>
                  <div className={s.memoryGrid}>
                    {searchMemory(query).map((m) => (
                      <article className={s.memoryCard} key={m.id}>
                        <div className={s.sectionTop}>
                          <Badge tone={m.tone}>{m.type}</Badge>
                          <span className={s.mono}>{m.id}</span>
                        </div>
                        <span className={s.memoryTag}>{m.tag}</span>
                        <h2>{m.title}</h2>
                        <p>{m.text}</p>
                        <details>
                          <summary>
                            Provenance & review <ChevronRight size={16} />
                          </summary>
                          <p>
                            {m.type === "Verified resolution"
                              ? "Synthetic independent review linked to a source incident and immutable revision. Not an actual production resolution."
                              : "No verified resolution is asserted. Requires corroboration and independent review before promotion to organizational knowledge."}
                          </p>
                        </details>
                        {ref(m.evidence)}
                      </article>
                    ))}
                  </div>
                  {!searchMemory(query).length && (
                    <div className={s.empty}>
                      <Search size={24} />
                      <h2>No matching lessons</h2>
                      <p>Try “publishing,” “date,” or “hypothesis.”</p>
                      <button
                        className={s.textButton}
                        onClick={() => setQuery("")}
                      >
                        Clear search
                      </button>
                    </div>
                  )}
                  <div className={s.note}>
                    <FileCheck2 size={18} />
                    <p>
                      <strong>
                        History is never rewritten to look successful.
                      </strong>{" "}
                      This view contains examples, not a closure report for any
                      actual incident.
                    </p>
                  </div>
                </>
              )}
              {view === "security" && (
                <>
                  <div className={s.controlHeader}>
                    <div>
                      <ShieldCheck size={32} />
                      <h2>
                        Authority is a boundary.
                        <br />
                        <span>Not a button.</span>
                      </h2>
                    </div>
                    <p>
                      A proposed action, an approval and an executed action are
                      different events. This design preserves that distinction.
                    </p>
                  </div>
                  <div className={s.twoCol}>
                    <section className={s.panel}>
                      <div className={s.sectionTop}>
                        <h2>Decision packet</h2>
                        <Badge tone="red">Blocked</Badge>
                      </div>
                      <h3 className={s.decisionTitle}>
                        Authorize a production release
                      </h3>
                      <p className={s.muted}>
                        Synthetic request · BB-043 · owner Elo
                      </p>
                      <div className={s.checklist}>
                        <div>
                          <Check size={17} />
                          <span>Staging evidence attached</span>
                        </div>
                        <div>
                          <CircleDot size={17} />
                          <span>Independent review pending</span>
                        </div>
                        <div>
                          <CircleDot size={17} />
                          <span>Exact production acceptance unavailable</span>
                        </div>
                        <div>
                          <LockKeyhole size={17} />
                          <span>CEO authorization not recorded</span>
                        </div>
                      </div>
                      {ref("EV-023")}
                      <button className={s.disabledAction} disabled>
                        Production authorization unavailable{" "}
                        <LockKeyhole size={16} />
                      </button>
                      <p className={s.caption}>
                        Display only. No approval, permission or release will be
                        created.
                      </p>
                    </section>
                    <section className={s.panel}>
                      <div className={s.sectionTop}>
                        <h2>Approval history</h2>
                        <Badge>Illustrative</Badge>
                      </div>
                      <div className={s.approvalStep}>
                        <span>01</span>
                        <div>
                          <h3>Proposed</h3>
                          <p>
                            Scope and evidence assembled. Nothing authorized.
                          </p>
                        </div>
                      </div>
                      <div className={s.approvalStep}>
                        <span>02</span>
                        <div>
                          <h3>Staging approved</h3>
                          <p>Bounded testing only. No production rights.</p>
                        </div>
                      </div>
                      <div className={s.approvalStep}>
                        <span>03</span>
                        <div>
                          <h3>Awaiting independent review</h3>
                          <p>The author cannot approve their own work.</p>
                        </div>
                      </div>
                      <div className={`${s.approvalStep} ${s.pendingStep}`}>
                        <span>04</span>
                        <div>
                          <h3>Production authorization required</h3>
                          <p>No execution event exists.</p>
                        </div>
                      </div>
                      {ref("EV-023")}
                    </section>
                  </div>
                  <section className={`${s.panel} ${s.semantics}`}>
                    <div className={s.sectionTop}>
                      <h2>Status language</h2>
                      <span className={s.muted}>
                        TEXT + COLOR, NEVER COLOR ALONE
                      </span>
                    </div>
                    <div>
                      {[
                        {
                          label: "Proposed action",
                          tone: "blue",
                          meaning: "An idea, not permission.",
                        },
                        {
                          label: "Awaiting review",
                          tone: "gold",
                          meaning: "Independent evidence review outstanding.",
                        },
                        {
                          label: "Approved staging",
                          tone: "green",
                          meaning:
                            "Only the stated staging scope is authorized.",
                        },
                        {
                          label: "Production authorization required",
                          tone: "gold",
                          meaning: "CEO decision still needed.",
                        },
                        {
                          label: "Permission revoked",
                          tone: "red",
                          meaning:
                            "Authority withdrawn; actions must remain blocked.",
                        },
                        {
                          label: "Failed verification",
                          tone: "red",
                          meaning: "Acceptance evidence failed. Investigate.",
                        },
                        {
                          label: "Emergency disabled",
                          tone: "red",
                          meaning: "Operational execution unavailable.",
                        },
                      ].map((x) => (
                        <div key={x.label}>
                          <Badge tone={x.tone}>{x.label}</Badge>
                          <p>{x.meaning}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className={s.panel}>
                    <div className={s.sectionTop}>
                      <h2>Recovery boundary</h2>
                      <Badge tone="gold">Conceptual only</Badge>
                    </div>
                    <p>
                      An agent-disabled or permission-revoked task stays
                      blocked. Recovery requires a new revision-bound plan and
                      independent review; restoring access never automatically
                      resumes execution.
                    </p>
                    <button className={s.disabledAction} disabled>
                      Task recovery unavailable in preview{" "}
                      <LockKeyhole size={16} />
                    </button>
                  </section>
                  <div className={s.emergency}>
                    <div>
                      <LockKeyhole size={21} />
                      <span>
                        <strong>Emergency disable</strong>
                        <small>
                          Visible, explicit, separate from normal workflow.
                        </small>
                      </span>
                    </div>
                    <button disabled>Not connected in preview</button>
                  </div>
                </>
              )}
            </>
          )}
          <footer className={s.footer}>
            <span>
              BLACKBOX / COMMAND <small>DESIGN SYSTEM 01</small>
            </span>
            <span>Clarity over activity. Evidence over confidence.</span>
          </footer>
        </main>
        <nav className={s.mobileNav} aria-label="Mobile workspace">
          {views.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={(e) => {
                e.preventDefault();
                navigate(id);
              }}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon size={20} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
      </div>
      <dialog
        ref={dialog}
        className={s.dialog}
        onCancel={(e) => {
          e.preventDefault();
          closeEvidence();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeEvidence();
        }}
        aria-labelledby="evidence-title"
      >
        <div className={s.drawer}>
          {selected && (
            <>
              <div className={s.sectionTop}>
                <span className={s.eyebrow}>EVIDENCE REGISTER</span>
                <button
                  className={s.close}
                  aria-label="Close evidence"
                  onClick={closeEvidence}
                >
                  <X size={22} />
                </button>
              </div>
              <Badge tone="gold">Synthetic source</Badge>
              <h2 id="evidence-title">{evidence[selected].title}</h2>
              <span className={s.mono}>{selected} / REVISION 01</span>
              <dl>
                <dt>Source</dt>
                <dd>{evidence[selected].source}</dd>
                <dt>Observed</dt>
                <dd>{evidence[selected].observed}</dd>
                <dt>Classification</dt>
                <dd>{evidence[selected].confidence}</dd>
              </dl>
              <div className={s.drawerConclusion}>
                <p className={s.eyebrow}>WHAT THIS SUPPORTS</p>
                <p>{evidence[selected].conclusion}</p>
              </div>
              <h3>Limits & provenance</h3>
              <p>{evidence[selected].detail}</p>
              <div className={s.note}>
                <LockKeyhole size={17} />
                <p>
                  Read-only evidence. Viewing this record does not approve or
                  execute an action.
                </p>
              </div>
              <button className={s.primary} onClick={closeEvidence}>
                Return to workspace <ArrowDownRight size={17} />
              </button>
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}
