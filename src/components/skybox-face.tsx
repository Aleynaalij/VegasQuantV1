import type { ReactNode } from "react";
import type { Sport } from "@/lib/sports";

/** Content identity stays stable even if a face's position changes later. */
export type SkyboxFaceId = "overview" | Sport;

type SkyboxFaceProps = {
  faceId: SkyboxFaceId;
  presentation?: "standard" | "skybox";
  children: ReactNode;
};

/**
 * One real HTML screen. Readers and schedule state belong to the caller, so each future sport
 * face can receive its own content without fetching here or creating hidden duplicate screens.
 */
export default function SkyboxFace({
  faceId,
  presentation = "skybox",
  children,
}: SkyboxFaceProps) {
  const skybox = presentation === "skybox";
  return (
    <div
      className="vq-tonight-board"
      data-skybox-face={skybox ? faceId : undefined}
      style={skybox ? undefined : { display: "contents" }}
    >
      {children}
    </div>
  );
}
