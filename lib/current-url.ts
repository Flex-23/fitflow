import "server-only";
import { appUrl } from "@/lib/app-url";

/**
 * The app's public base URL, used for a member's link and for the video links
 * embedded in generated PDFs. One address on the single-gym deployment.
 */
export async function currentAppUrl(): Promise<string> {
  return appUrl();
}
