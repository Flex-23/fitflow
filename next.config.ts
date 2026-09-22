import type { NextConfig } from "next";

/**
 * The app itself never handles large uploads or long-lived sockets: exercise
 * videos go from the browser straight to Supabase Storage, and WhatsApp runs
 * in a worker on the gym computer. So nothing here needs raising — a hosted
 * function caps request and response bodies at 4.5 MB regardless.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
