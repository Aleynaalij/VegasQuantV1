"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
export default function AccountLink() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return (
    <Link href="/membership" className="admin-link">
      {signedIn ? "Account" : "Login"}
    </Link>
  );
}
