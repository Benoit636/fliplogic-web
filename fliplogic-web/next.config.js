/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: [
      'fliplogic-photos.s3.amazonaws.com',
      'lh3.googleusercontent.com',
    ],
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
