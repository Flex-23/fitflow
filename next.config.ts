import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Baileys keeps a long-lived WhatsApp socket and loads native-ish deps
  // (libsignal, protobufjs); it must run from node_modules, not be bundled.
  serverExternalPackages: ["@whiskeysockets/baileys"],
  // Exercise videos are uploaded from the manager's device. The actual file
  // transfer goes through a streaming Route Handler (app/api/videos/upload),
  // but we raise the Server Action limit too so large multipart forms that
  // include a file don't get rejected outright.
  experimental: {
    serverActions: {
      bodySizeLimit: "512mb",
    },
  },
};

export default nextConfig;
