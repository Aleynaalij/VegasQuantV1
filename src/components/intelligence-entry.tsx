"use client";
import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import {
  books,
  inputSchemas,
  type IntelKind,
  type IntelMarket,
} from "@/lib/intelligence";
type Field = {
  key: string;
  label: string;
  optional?: boolean;
  options?: string[];
  numeric?: boolean;
  long?: boolean;
  date?: boolean;
  value?: string;
};
const common: Field[] = [
  {
    key: "observed_at",
    label: "Source timestamp · your local time",
    date: true,
  },
  { key: "source", label: "Source URL or exact handoff reference" },
  {
    key: "notes",
    label: "Notes / corrections to previous record",
    long: true,
    optional: true,
  },
];
const timeBasis: Field = {
  key: "time_basis",
  label: "What does this timestamp represent?",
  options: ["observed", "received", "published"],
};
const line: Field = {
  key: "line",
  label: "Line for selected outcome · blank only for moneyline",
  numeric: true,
  optional: true,
};
const book: Field = { key: "book", label: "Sportsbook", options: books };
const fieldSets: Record<IntelKind, Field[]> = {
  markets: [
    { key: "market_key", label: "Stable market key", value: "" },
    { key: "label", label: "Market name · e.g. player receiving yards" },
    {
      key: "market_type",
      label: "Market type",
      options: ["Side", "Moneyline", "Total", "Player Prop"],
    },
    { key: "selection", label: "Selected outcome · team name or Over/Under" },
    { key: "opposite", label: "Exact opposite outcome" },
    { key: "period", label: "Period", value: "Full game" },
    {
      key: "rules",
      label: "Settlement rules / comparability notes",
      long: true,
    },
  ],
  quotes: [
    book,
    line,
    { key: "odds", label: "Selected outcome American odds", numeric: true },
    {
      key: "opposite_odds",
      label: "Opposite outcome odds at the SAME line and time",
      numeric: true,
      optional: true,
    },
    timeBasis,
    ...common,
  ],
  splits: [
    book,
    line,
    {
      key: "ticket_pct",
      label: "Ticket % on selected outcome",
      numeric: true,
      optional: true,
    },
    {
      key: "handle_pct",
      label: "Handle % on selected outcome",
      numeric: true,
      optional: true,
    },
    {
      key: "sample_size",
      label: "Number of tickets · if supplied",
      numeric: true,
      optional: true,
    },
    { key: "sample_window", label: "Sample window / population · required" },
    timeBasis,
    ...common,
  ],
  news: [
    {
      key: "category",
      label: "Category",
      options: ["Injury", "Weather", "Team", "Other"],
    },
    { key: "headline", label: "Headline" },
    {
      key: "body",
      label: "News text · preserve the source wording",
      long: true,
    },
    timeBasis,
    ...common.filter((f) => f.key !== "notes"),
  ],
  models: [
    {
      key: "projection",
      label: "Exact analyst projection / range",
      long: true,
    },
    {
      key: "true_line",
      label: "Analyst true line · leave blank for a range",
      numeric: true,
      optional: true,
    },
    {
      key: "probability",
      label: "Analyst probability %",
      numeric: true,
      optional: true,
    },
    {
      key: "probability_line",
      label: "Line evaluated by that probability",
      numeric: true,
      optional: true,
    },
    {
      key: "sharp_fair_line",
      label: "Externally supplied sharp fair line · optional",
      numeric: true,
      optional: true,
    },
    {
      key: "sharp_method",
      label: "Sharp fair-line source and method · required if supplied",
      long: true,
      optional: true,
    },
    ...common,
  ],
};
export default function IntelligenceEntry({
  gameId,
  market,
  onSaved,
}: {
  gameId: string;
  market?: IntelMarket;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<IntelKind>("quotes"),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<Record<string, unknown>[] | null>(null),
    [importing, setImporting] = useState(false),
    [raw, setRaw] = useState("");
  function validate(rows: unknown[]) {
    if (!rows.length || rows.length > 100)
      throw new Error("Import 1–100 records at a time.");
    return rows.map((row) => {
      const parsed = inputSchemas[kind].safeParse(row);
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        );
      const data = parsed.data as Record<string, unknown>;
      if (
        ["quotes", "splits"].includes(kind) &&
        market &&
        (market.market_type === "Moneyline") !== (data.line === null)
      )
        throw new Error(
          "Moneylines use a blank line; all other markets need a line.",
        );
      return data;
    });
  }
  function prepare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice("");
    try {
      const scope = ["markets", "news"].includes(kind)
        ? { game_id: gameId }
        : { market_id: market?.id };
      if (!gameId || (!["markets", "news"].includes(kind) && !market))
        throw new Error("Choose a game and create/select its market first.");
      if (importing) {
        const rows = JSON.parse(raw);
        setPreview(
          validate(
            (Array.isArray(rows) ? rows : [rows]).map((row) => ({
              ...row,
              ...scope,
            })),
          ),
        );
        return;
      }
      const fd = new FormData(e.currentTarget),
        data: Record<string, unknown> = { ...scope };
      for (const f of fieldSets[kind]) {
        const v = String(fd.get(f.key) || "");
        data[f.key] = f.numeric
          ? v.trim() === ""
            ? null
            : Number(v)
          : f.date
            ? new Date(v).toISOString()
            : f.key === "sharp_method"
              ? v || null
              : v;
      }
      setPreview(validate([data]));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Review the supplied data.");
    }
  }
  async function save() {
    if (!preview || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from(`intelligence_${kind}`)
        .insert(preview);
      if (error) throw error;
      setNotice(
        `${preview.length} private record(s) saved. Previous records are retained.`,
      );
      setPreview(null);
      setRaw("");
      onSaved();
    } catch (e) {
      setNotice((e as { message?: string }).message || "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="admin-section intel-entry">
      <summary>Add private data / import</summary>
      <div className="notebook">
        <p>
          Only supplied observations belong here. Saving does not publish a pick
          or change the public analysis.
        </p>
        <label className="field">
          Record type
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as IntelKind);
              setPreview(null);
              setNotice("");
            }}
          >
            {Object.keys(fieldSets).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={importing}
            onChange={(e) => {
              setImporting(e.target.checked);
              setPreview(null);
            }}
          />
          Import structured JSON
        </label>
        <form
          key={`${kind}:${market?.id}:${gameId}:${importing}`}
          onSubmit={prepare}
          onChange={() => setPreview(null)}
        >
          {importing ? (
            <>
              <label className="field">
                JSON object or array · game/market assigned from current
                selection
                <textarea
                  rows={8}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  required
                />
              </label>
              <details>
                <summary>Field names and import rules</summary>
                <p>{fieldSets[kind].map((f) => f.key).join(", ")}</p>
                <p>
                  Include every listed field. Optional numeric fields are null;
                  notes can be empty. Timestamps must be ISO 8601 with a
                  timezone. Use observed only for a known quote observation
                  time. Maximum 100 records. Opposite odds must correspond to
                  the same event, period, line, rules and timestamp.
                </p>
              </details>
            </>
          ) : (
            <div className="form-grid">
              {fieldSets[kind].map((f) => (
                <label className={`field ${f.long ? "full" : ""}`} key={f.key}>
                  <span>
                    {f.label}
                    {!f.optional ? " *" : ""}
                  </span>
                  {f.options ? (
                    <select name={f.key} required defaultValue="">
                      <option value="" disabled>
                        Select…
                      </option>
                      {f.options.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : f.long ? (
                    <textarea name={f.key} rows={3} required={!f.optional} />
                  ) : (
                    <input
                      name={f.key}
                      type={f.date ? "datetime-local" : "text"}
                      inputMode={f.numeric ? "text" : undefined}
                      pattern={
                        f.numeric ? "[+\\-]?[0-9]+([.][0-9]+)?" : undefined
                      }
                      required={!f.optional}
                      defaultValue={f.value}
                    />
                  )}
                </label>
              ))}
            </div>
          )}
          <button className="secondary" disabled={busy}>
            Review private records
          </button>
        </form>
        {preview && (
          <div className="publishing-checks">
            <h3>Review {preview.length} record(s)</h3>
            <pre>{JSON.stringify(preview, null, 2)}</pre>
            <button className="primary" disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Confirm & save privately"}
            </button>
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
      </div>
    </details>
  );
}
