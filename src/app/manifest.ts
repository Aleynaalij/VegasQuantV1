import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Vegas Quant",
    short_name: "Vegas Quant",
    description: "NFL research, live scores and transparent picks",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#07080b",
    theme_color: "#07080b",
    icons: [
      {
        src: "/icons/vq-lounge-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/vq-lounge-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/vq-lounge-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
