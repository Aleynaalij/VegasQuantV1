"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { socialUrl } from "@/lib/community";
import {
  BIO_MAX,
  TAGLINE_MAX,
  US_STATES,
  type MemberProfileData,
} from "@/lib/member-profile";

type Draft = {
  avatar: string | null;
  tagline: string;
  bio: string;
  state: string;
  instagram_url: string;
  x_url: string;
};

/** Square-crop a chosen photo to a 256px JPEG data URL (the stored avatar format, under 120 KB). */
async function prepareAvatar(file: File): Promise<string> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw Error("Choose a JPG, PNG or WebP under 5 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
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
    for (const q of [0.82, 0.7, 0.55]) {
      const data = canvas.toDataURL("image/jpeg", q);
      if (data.length <= 120000) return data;
    }
    throw Error();
  } catch (e) {
    throw e instanceof Error && e.message
      ? e
      : Error("Could not prepare that photo. Try another.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Edit profile sheet, opened from your own profile: photo, tagline, bio, state and Instagram/X links.
 * Saves straight to your own community_profiles row (row-level security allows only your row).
 */
export default function ProfileEditor({
  profile,
  uid,
  onClose,
  onSaved,
}: {
  profile: MemberProfileData;
  uid: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Draft>({
    avatar: profile.avatar,
    tagline: profile.tagline ?? "",
    bio: profile.bio ?? "",
    state: profile.state ?? "",
    instagram_url: profile.instagram_url ?? "",
    x_url: profile.x_url ?? "",
  });
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    setNotice("");
    try {
      const avatar = await prepareAvatar(file);
      setDraft((d) => ({ ...d, avatar }));
    } catch (e) {
      setNotice((e as Error).message);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    let instagram: string | null, x: string | null;
    try {
      instagram = socialUrl(draft.instagram_url, "instagram");
      x = socialUrl(draft.x_url, "x");
    } catch (err) {
      setNotice((err as Error).message);
      return;
    }
    setBusy(true);
    setNotice("");
    const r = await supabase
      .from("community_profiles")
      .update({
        avatar: draft.avatar,
        tagline: draft.tagline.trim(),
        bio: draft.bio.trim(),
        state: draft.state,
        instagram_url: instagram,
        x_url: x,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", uid);
    setBusy(false);
    if (r.error) {
      setNotice(
        /harmful|guaranteed/i.test(r.error.message)
          ? "Remove harmful content, links or guaranteed-return claims from your tagline or bio."
          : "Could not save your profile. Please try again.",
      );
      return;
    }
    window.dispatchEvent(new Event("vq-community-changed"));
    onSaved();
  }

  return (
    <dialog
      ref={dialog}
      className="vq-profile-editor"
      aria-labelledby="vq-profile-editor-title"
      onCancel={onClose}
    >
      <form onSubmit={save}>
        <header>
          <h2 id="vq-profile-editor-title">Edit profile</h2>
          <button
            type="button"
            className="vq-profile-editor-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <fieldset disabled={busy}>
          <label className="vq-profile-editor-photo">
            <span className="vq-profile-avatar">
              {draft.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.avatar} alt="Your profile photo" />
              ) : (
                <span aria-hidden="true">
                  {profile.username.slice(0, 2).toUpperCase()}
                </span>
              )}
            </span>
            <span className="vq-profile-editor-photo-cta">
              <Camera size={16} aria-hidden="true" /> Change photo
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => void choosePhoto(e.target.files?.[0])}
            />
          </label>
          <label>
            <span>
              Tagline{" "}
              <small>
                {draft.tagline.length}/{TAGLINE_MAX}
              </small>
            </span>
            <input
              value={draft.tagline}
              maxLength={TAGLINE_MAX}
              placeholder="NFL unders. NHL totals. Patience."
              onChange={(e) =>
                setDraft((d) => ({ ...d, tagline: e.target.value }))
              }
            />
          </label>
          <label>
            <span>
              Bio{" "}
              <small>
                {draft.bio.length}/{BIO_MAX}
              </small>
            </span>
            <textarea
              value={draft.bio}
              maxLength={BIO_MAX}
              rows={4}
              placeholder="Tell The Zone what you follow and how you research."
              onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
            />
          </label>
          <label>
            <span>Location (state)</span>
            <select
              value={draft.state}
              onChange={(e) =>
                setDraft((d) => ({ ...d, state: e.target.value }))
              }
            >
              <option value="">Not shown</option>
              {Object.entries(US_STATES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Instagram profile link</span>
            <input
              type="url"
              inputMode="url"
              value={draft.instagram_url}
              placeholder="https://instagram.com/yourname"
              onChange={(e) =>
                setDraft((d) => ({ ...d, instagram_url: e.target.value }))
              }
            />
          </label>
          <label>
            <span>X (Twitter) profile link</span>
            <input
              type="url"
              inputMode="url"
              value={draft.x_url}
              placeholder="https://x.com/yourname"
              onChange={(e) =>
                setDraft((d) => ({ ...d, x_url: e.target.value }))
              }
            />
          </label>
          {notice ? (
            <p className="vq-profile-error" role="status">
              {notice}
            </p>
          ) : null}
          <div className="vq-profile-editor-actions">
            <button type="button" className="vq-profile-edit" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="vq-profile-follow">
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </fieldset>
      </form>
    </dialog>
  );
}
