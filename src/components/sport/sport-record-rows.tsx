"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SPORTS } from "@/lib/sports";

type Counts = {
  selections: number;
  win: number;
  loss: number;
  push: number;
  void: number;
  pending: number;
};

/**
 * NHL and college basketball rows for Performance's "By sport" table, from sports_records. Their
 * selections are qualitative editorial without stakes, so units, ROI and CLV stay blank.
 */
export default function SportRecordRows() {
  const [rows, setRows] = useState<
    Partial<Record<"nhl" | "ncaab", Counts | null>>
  >({});
  useEffect(() => {
    let live = true;
    for (const sport of ["nhl", "ncaab"] as const)
      void supabase.rpc("sports_records", { p_sport: sport }).then((r) => {
        if (live)
          setRows((all) => ({
            ...all,
            [sport]: r.error ? null : (r.data as Counts),
          }));
      });
    return () => {
      live = false;
    };
  }, []);
  return (["nhl", "ncaab"] as const).map((sport) => {
    const c = rows[sport];
    return (
      <tr key={sport}>
        <td>{SPORTS[sport].label}</td>
        <td>
          {c
            ? `${c.selections - c.pending}/${c.selections}`
            : c === null
              ? "Unavailable"
              : "…"}
        </td>
        <td>{c ? `${c.win}–${c.loss}${c.push ? `–${c.push}` : ""}` : "—"}</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
      </tr>
    );
  });
}
