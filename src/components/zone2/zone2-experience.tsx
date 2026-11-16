"use client";
import CommunityFeed from "@/components/community-feed";
/** Caller provides an isolated route; all social authorization stays in the existing feed. */
export default function Zone2Experience({
  basePath = "/community",
}: {
  basePath?: string;
}) {
  return <CommunityFeed experience="zone2" basePath={basePath} />;
}
