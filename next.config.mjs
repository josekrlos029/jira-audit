/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "secure.gravatar.com" },
      { protocol: "https", hostname: "avatar-management--avatars.us-west-2.prod.public.atl-paas.net" },
      { protocol: "https", hostname: "api.atlassian.com" },
    ],
  },
};

export default nextConfig;
