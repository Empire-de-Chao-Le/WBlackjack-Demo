/**
 * Fire-and-forget Telegram notification helper.
 *
 * Completely optional — if TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID are absent
 * or empty the function returns immediately without doing anything. Errors are
 * logged but never rethrown, so a Telegram outage can never crash the server.
 */
export function notifyTelegram(text: string): void {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch((err) => {
    console.error("[Telegram] Failed to send notification:", err);
  });
}
