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
 * NBA, NHL and college basketball rows for Performance's "By sport" table, from the sport record RPCs. Their
 * selections are qualitative editorial without stakes, so units, ROI and CLV stay blank.
 */
export default function SportRecordRows() {
  const [rows, setRows] = useState<
    Partial<Record<"nba" | "nhl" | "ncaab", Counts | null>>
  >({});
  useEffect(() => {
    let live = true;
    for (const sport of ["nba", "nhl", "ncaab"] as const)
      void (
        sport === "nba"
          ? supabase.rpc("nba_editorial_records")
          : supabase.rpc("sports_records", { p_sport: sport })
      ).then((r) => {
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
  return (["nba", "nhl", "ncaab"] as const).map((sport) => {
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
