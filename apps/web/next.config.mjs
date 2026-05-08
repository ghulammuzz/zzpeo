/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  compress: false, // SSE streams: let nginx handle compression; dev server buffering breaks EventSource

  async rewrites() {
    const apiUrl = process.env.API_URL ?? "http://localhost:8080"
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ]
  },
}
export default nextConfig;
