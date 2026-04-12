/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: process.env.NEXT_UI_CAPTURE !== "1",
  distDir: process.env.NEXT_DIST_DIR || ".next"
};

export default nextConfig;
