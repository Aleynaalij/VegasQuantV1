"use client";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { regions, socialUrl, type CommunityProfile } from "@/lib/community";
import { Avatar } from "./community-home";
const blank: CommunityProfile = {
  username: "",
  region: "",
  avatar: null,
  visible: true,
};
export default function CommunitySettings({ uid }: { uid: string }) {
  const [draft, setDraft] = useState<CommunityProfile>(blank),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(false);
  async function load() {
    const r = await supabase
      .from("community_profiles")
      .select("username,region,avatar,visible,instagram_url,x_url")
      .eq("user_id", uid)
      .maybeSingle();
    if (r.error) {
      setFailed(true);
      setNotice("Could not load profile settings. Try again.");
    } else {
      setDraft(r.data || blank);
      setFailed(false);
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, [uid]);
  async function photo(file?: File) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5_000_000
    ) {
      setNotice("Choose a JPG, PNG or WebP under 5 MB.");
      return;
    }
    setBusy(true);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const c = canvas.getContext("2d");
      if (!c) throw Error();
      const side = Math.min(img.width, img.height);
      c.drawImage(
        img,
        (img.width - side) / 2,
        (img.height - side) / 2,
        side,
        side,
        0,
        0,
        256,
        256,
      );
      const avatar = canvas.toDataURL("image/jpeg", 0.8);
      if (avatar.length > 120000) throw Error();
      setDraft((v) => ({ ...v, avatar }));
    } catch {
      setNotice("Could not prepare that photo. Try a smaller image.");
    } finally {
      URL.revokeObjectURL(url);
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!uid || busy) return;
    setBusy(true);
    setNotice("");
    let instagram: string | null, x: string | null;
    try {
      instagram = socialUrl(draft.instagram_url || "", "instagram");
      x = socialUrl(draft.x_url || "", "x");
    } catch (e) {
      setNotice((e as Error).message);
      setBusy(false);
      return;
    }
    const r = await supabase.from("community_profiles").upsert(
      {
        user_id: uid,
        ...draft,
        instagram_url: instagram,
        x_url: x,
        username: draft.username.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (r.error)
      setNotice(
        r.error.code === "23505"
          ? "That username is taken. Try another."
          : "Could not save your profile. Try again.",
      );
    else {
      await load();
      window.dispatchEvent(new Event("vq-community-changed"));
      setNotice(
        draft.visible
          ? "Profile saved. You appear automatically in Community for challenges you join."
          : "Profile saved. Your community profile is hidden.",
      );
    }
    setBusy(false);
  }
  if (loading) return <p>Loading profile settings…</p>;
  if (failed)
    return (
      <button className="secondary" onClick={() => void load()}>
        Retry profile settings
      </button>
    );
  return (
    <form className="member-form" onSubmit={save} id="community-settings">
      <h2 id="community-profile-title">Your community identity</h2>
      <Avatar profile={draft} />
      <label>
        Username
        <input
          required
          pattern="[A-Za-z0-9_]{3,24}"
          minLength={3}
          maxLength={24}
          value={draft.username}
          onChange={(e) => setDraft({ ...draft, username: e.target.value })}
        />
      </label>
      <small>
        3–24 letters, numbers or underscores. Choose a nickname; no real name
        needed.
      </small>
      <label>
        Region (optional)
        <select
          value={draft.region}
          onChange={(e) => setDraft({ ...draft, region: e.target.value })}
        >
          <option value="">Keep private</option>
          {regions.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label>
        Photo (optional)
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => void photo(e.target.files?.[0])}
        />
      </label>
      {draft.avatar && (
        <button
          type="button"
          className="text-link"
          onClick={() => setDraft({ ...draft, avatar: null })}
        >
          Remove photo
        </button>
      )}
      <label>
        Instagram profile URL (optional)
        <input
          type="url"
          placeholder="https://instagram.com/yourname"
          value={draft.instagram_url || ""}
          onChange={(e) =>
            setDraft({ ...draft, instagram_url: e.target.value })
          }
        />
      </label>
      <label>
        X profile URL (optional)
        <input
          type="url"
          placeholder="https://x.com/yourname"
          value={draft.x_url || ""}
          onChange={(e) => setDraft({ ...draft, x_url: e.target.value })}
        />
      </label>
      <label className="entry-confirm">
        <input
          type="checkbox"
          checked={draft.visible}
          onChange={(e) => setDraft({ ...draft, visible: e.target.checked })}
        />
        Show my username, photo, region, social links, stage wins, joins and
        check-ins to signed-in community members.
      </label>
      <small>
        On by default for new profiles. Your email, bets, stakes and balance
        stay private. Turn this off to hide your profile from the roster and
        activity. Once you join a challenge, your visible profile appears
        automatically.
      </small>
      {notice && <p role="alert">{notice}</p>}
      <button className="primary" disabled={busy}>
        {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
