/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // schlankes Produktions-Image (Docker)
  output: "standalone",
  // PocketBase laeuft im selben Container und ist nur ueber /pb erreichbar.
  // Lokal (ohne Docker) spricht die App PocketBase weiterhin direkt auf :8090 an.
  async rewrites() {
    return [{ source: "/pb/:path*", destination: "http://127.0.0.1:8090/:path*" }];
  },
};
