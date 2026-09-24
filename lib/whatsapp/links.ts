/**
 * WhatsApp integration — click-to-chat.
 *
 * WhatsApp's link protocol can open a chat with a prefilled message, but it
 * cannot attach a file: only the Cloud API (verified business account) can do
 * that. So a course is delivered as a private link to its PDF, which the
 * member opens on their phone. The captain still presses "send" themselves.
 *
 * `whatsapp://` opens the WhatsApp app installed on the computer; `wa.me` is
 * the browser fallback when the desktop app is not installed.
 */

export function isWhatsAppEnabled(): boolean {
  return process.env.WHATSAPP_ENABLED === "true";
}

/**
 * Course PDFs are no longer pushed over WhatsApp.
 *
 * A member now gets one personal link that opens their page, and the course
 * is one of the things on it — sending the PDF separately is a second thing
 * to keep working for no extra reach. The pairing, the worker and the outbox
 * are all left in place; flip this to `false` to bring delivery back.
 */
export const COURSE_SEND_PAUSED = true;

/** Whether the course "send" controls should appear at all. */
export function canSendCourses(): boolean {
  return isWhatsAppEnabled() && !COURSE_SEND_PAUSED;
}

/** Default country code used when a stored number is in local format. */
export function countryCode(): string {
  return (process.env.WHATSAPP_COUNTRY_CODE || "964").replace(/\D/g, "");
}

/** Digits only (legacy helper kept for message/logging use). */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Convert a stored number to the international form WhatsApp expects
 * (digits only, country code included, no "+"):
 *   07701234567  → 9647701234567
 *   +9647701234567 / 009647701234567 → 9647701234567
 */
export function toInternational(phone: string, cc = countryCode()): string {
  let d = normalizePhone(phone);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith(cc)) return d;
  if (d.startsWith("0")) d = d.slice(1);
  return `${cc}${d}`;
}

/** Deep link that opens the WhatsApp desktop app on this computer. */
export function desktopLink(phone: string, message: string): string {
  return `whatsapp://send?phone=${toInternational(phone)}&text=${encodeURIComponent(message)}`;
}

/** Browser fallback (WhatsApp Web / mobile). */
export function webLink(phone: string, message: string): string {
  return `https://wa.me/${toInternational(phone)}?text=${encodeURIComponent(message)}`;
}

/** Kept for existing callers. */
export function buildWhatsAppLink(phone: string, message: string): string {
  return webLink(phone, message);
}

export function buildWelcomeMessage(name: string): string {
  return `مرحباً ${name}! أهلاً بك في FitFlow. تم تسجيل اشتراكك بنجاح. 💪`;
}

/**
 * The message a member gets with the link to their own page.
 *
 * A welcome and an invitation, nothing more. It says what the link opens and
 * how to keep it on the phone; it does not talk about how long the link lasts
 * or how many times it works, because that is the gym's problem to manage and
 * not something a member can do anything about.
 */
export function buildPortalMessage(name: string, url: string): string {
  return [
    `مرحباً ${name} 👋`,
    "أهلاً بك في FitFlow 💪",
    "",
    "هذا رابط الدخول إلى صفحتك الخاصة — اشتراكك، تاريخ بدايته ونهايته، وكورساتك:",
    url,
    "",
    "افتح الرابط ثم اضغط «إضافة إلى الشاشة الرئيسية» ليصبح التطبيق عندك مباشرة.",
  ].join("\n");
}

/**
 * Caption sent with the course PDF. `url` is the private share link; when the
 * app has no public address configured it is left out rather than sending a
 * localhost link the member cannot open.
 */
export function buildCourseMessage(
  name: string,
  kind: "training" | "nutrition",
  url: string
): string {
  const label = kind === "training" ? "كورس التدريب" : "كورس التغذية";
  const usable = url && !/localhost|127\.0\.0\.1/.test(url);
  return [
    `مرحباً ${name} 👋`,
    `${label} الخاص بك جاهز 💪`,
    ...(usable ? ["", `ويمكنك فتحه أيضاً من هنا: ${url}`] : []),
    "",
    "عند الضغط على أي تمرين داخل الملف ستُطلب منك مرة واحدة تأكيد رقم هاتفك لمشاهدة الفيديو.",
  ].join("\n");
}

type SendResult = { sent: false; reason: "manual" | "disabled" };

/**
 * Server-side "send" is deliberately a no-op: delivery happens in the
 * captain's own WhatsApp app via `desktopLink()`. Kept so existing callers
 * (e.g. the welcome message) keep working.
 */
async function send(phone: string, message: string): Promise<SendResult> {
  if (!isWhatsAppEnabled()) {
    console.info(`[whatsapp:disabled] -> ${toInternational(phone)}: ${message}`);
    return { sent: false, reason: "disabled" };
  }
  return { sent: false, reason: "manual" };
}

export async function sendWelcomeMessage(phone: string, name: string) {
  return send(phone, buildWelcomeMessage(name));
}

export async function sendCourseLink(
  phone: string,
  kind: "training" | "nutrition",
  url: string,
  name = ""
) {
  return send(phone, buildCourseMessage(name, kind, url));
}
