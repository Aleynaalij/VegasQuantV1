"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Panel } from "./ui";
export default function AdminDeletionQueue() {
  const [rows, setRows] = useState<
      { id: string; user_id: string; status: string; requested_at: string }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    async function load() {
      const admin = await supabase.rpc("is_admin");
      if (!live || admin.data !== true) return;
      const r = await supabase
        .from("account_deletion_requests")
        .select("id,user_id,status,requested_at")
        .in("status", ["pending", "processing"])
        .order("requested_at")
        .limit(100);
      if (!live) return;
      if (r.error) setError("Could not load deletion requests.");
      else {
        setError("");
        setRows(r.data || []);
      }
    }
    void load();
    const t = setInterval(() => void load(), 60000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);
  return (
    <Panel title="Privacy · Deletion requests">
      <div className="notebook">
        <p>
          Legacy deletion requests remain here for review. Members can now
          complete authenticated deletion themselves from Account. This admin
          queue does not delete accounts or cancel billing.
        </p>
        {error ? (
          <p role="alert">{error}</p>
        ) : rows.length ? (
          rows.map((r) => (
            <p key={r.id}>
              Account {r.user_id}
              <br />
              Request {r.id} · {r.status} ·{" "}
              {new Date(r.requested_at).toLocaleString()}
            </p>
          ))
        ) : (
          <p>No pending requests.</p>
        )}
      </div>
    </Panel>
  );
}
