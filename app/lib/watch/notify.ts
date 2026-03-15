/**
 * Email notifications via Brevo (formerly Sendinblue).
 *
 * Uses Brevo's transactional email HTTP API — no SDK needed.
 * Free tier: 300 emails/day.
 *
 * Two email types:
 *   1. Verification — confirm email when creating a watch
 *   2. Availability — domain became available, go buy it
 */

const BREVO_API = "https://api.brevo.com/v3/smtp/email";

/** Escape HTML special characters to prevent XSS in email templates. */
function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]!
  );
}

function getApiKey(): string {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error("Missing BREVO_API_KEY");
  return key;
}

function sender(): { name: string; email: string } {
  const from = process.env.EMAIL_FROM;
  if (from) {
    const match = from.match(/^(.+?)\s*<(.+)>$/);
    if (match) return { name: match[1], email: match[2] };
    return { name: "Donadomains", email: from };
  }
  return { name: "Donadomains", email: "notifications@donadomains.com" };
}

function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const res = await fetch(BREVO_API, {
    method: "POST",
    headers: {
      "api-key": getApiKey(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: sender(),
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const retryable = res.status >= 500 || res.status === 429;
    throw new Error(`Brevo API error (${res.status}, retryable=${retryable}): ${body}`);
  }
}

export async function sendVerificationEmail(
  email: string,
  token: string,
  domain: string,
): Promise<void> {
  const url = `${baseUrl()}/watch/verify?token=${token}`;

  await sendEmail(
    email,
    `Verify your watch for ${domain}`,
    `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
        <h2 style="margin: 0 0 8px;">Donadomains</h2>
        <p style="color: #666; margin: 0 0 24px;">Domain Watch Verification</p>

        <p>You requested to watch <strong>${escapeHtml(domain)}</strong> and be notified when it becomes available.</p>

        <p>Click below to confirm your email and start monitoring:</p>

        <a href="${url}"
           style="display: inline-block; background: #000; color: #fff; padding: 12px 24px;
                  text-decoration: none; font-weight: bold; text-transform: uppercase;
                  letter-spacing: 0.05em; margin: 16px 0;">
          Verify &amp; Start Watching
        </a>

        <p style="color: #999; font-size: 13px; margin-top: 24px;">
          If you didn't request this, just ignore this email. The link expires in 24 hours.
        </p>
      </div>
    `,
  );
}

export async function sendAvailabilityEmail(
  email: string,
  domain: string,
  unsubToken: string,
): Promise<void> {
  const unsubUrl = `${baseUrl()}/watch/verify?unwatch=${unsubToken}`;

  await sendEmail(
    email,
    `${domain} is now available!`,
    `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
        <h2 style="margin: 0 0 8px;">Donadomains</h2>
        <p style="color: #666; margin: 0 0 24px;">Domain Alert</p>

        <div style="background: #f0fdf4; border: 2px solid #22c55e; padding: 16px; margin: 16px 0;">
          <p style="margin: 0; font-size: 18px; font-weight: bold;">
            ${escapeHtml(domain)} is available!
          </p>
          <p style="margin: 8px 0 0; color: #666;">
            The domain you were watching is now available for registration.
          </p>
        </div>

        <p>Search for it on Donadomains to compare prices across registrars:</p>

        <a href="${baseUrl()}?q=${encodeURIComponent(domain)}"
           style="display: inline-block; background: #000; color: #fff; padding: 12px 24px;
                  text-decoration: none; font-weight: bold; text-transform: uppercase;
                  letter-spacing: 0.05em; margin: 16px 0;">
          Search &amp; Register
        </a>

        <p style="color: #999; font-size: 13px; margin-top: 32px;">
          <a href="${unsubUrl}" style="color: #999;">Stop watching this domain</a>
        </p>
      </div>
    `,
  );
}
