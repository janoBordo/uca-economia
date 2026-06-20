/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // pdfjs-dist necesita esto para no romper el build
    config.resolve.alias["canvas"] = false;
    return config;
  },
};
export default nextConfig;
