/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server bundle for the docker image.
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  // Proxy /api/backend/* to the Python backend so the browser sees a same-origin
  // request and CORS never enters the picture.
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${
          process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8000"
        }/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
