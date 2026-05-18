/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: process.env.NEXT_UI_CAPTURE !== "1",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [
      {
        // SharedArrayBuffer-backed probe capture only runs in patch workspace.
        // COOP/COEP must apply to the document route that creates the SAB;
        // scoping this only to /wasm or /worklets would leave the page non-isolated.
        source: "/patch-workspace/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" }
        ]
      }
    ];
  }
};

export default nextConfig;
