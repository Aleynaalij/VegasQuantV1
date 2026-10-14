"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
type Me = { username: string; avatar: string | null } | null;
/** Top-bar identity: your photo links to your profile once signed in; otherwise Login. */
export default function AccountLink() {
  const [signedIn, setSignedIn] = useState(false);
  const [me, setMe] = useState<Me>(null);
  useEffect(() => {
    let active = true;
    async function load(userId: string | undefined) {
      if (!active) return;
      setSignedIn(Boolean(userId));
      if (!userId) return setMe(null);
      const { data } = await supabase
        .from("community_profiles")
        .select("username,avatar")
        .eq("user_id", userId)
        .maybeSingle();
      if (active) setMe(data?.username ? data : null);
    }
    const refresh = () => {
      void supabase.auth
        .getSession()
        .then(({ data }) => load(data.session?.user.id));
    };
    refresh();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void load(session?.user.id);
    });
    window.addEventListener("vq-community-changed", refresh);
    return () => {
      active = false;
      data.subscription.unsubscribe();
      window.removeEventListener("vq-community-changed", refresh);
    };
  }, []);
  if (signedIn && me)
    return (
      <Link
        href={`/community/${encodeURIComponent(me.username)}`}
        className="admin-link top-profile"
        aria-label={`Your profile, ${me.username}`}
        title="Your profile and activity"
      >
        {me.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatar} alt="" width={36} height={36} />
        ) : (
          <span aria-hidden="true">
            {me.username.slice(0, 2).toUpperCase()}
          </span>
        )}
      </Link>
    );
  return (
    <Link href="/membership" className="admin-link">
      {signedIn ? "Account" : "Login"}
    </Link>
  );
}
