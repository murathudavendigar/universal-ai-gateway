/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@uag/core",
    "@uag/operator",
    "@uag/sdk",
    "@uag/provider-nvidia",
    "@uag/provider-openrouter",
  ],
  serverExternalPackages: [],
};

export default nextConfig;
