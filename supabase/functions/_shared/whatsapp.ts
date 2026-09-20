import { toWhatsAppRecipient } from "./phone.ts";

type WhatsAppSendResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

async function postWhatsAppMessage(
  phoneNumberId: string,
  token: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

function templatePayload(to: string, template: string, lang: string, code: string, withButton: boolean) {
  const components: Record<string, unknown>[] = [
    {
      type: "body",
      parameters: [{ type: "text", text: code }],
    },
  ];
  if (withButton) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: code }],
    });
  }
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: template,
      language: { code: lang },
      components,
    },
  };
}

export async function sendWhatsAppOtp(e164: string, code: string): Promise<WhatsAppSendResult> {
  const token = Deno.env.get("WHATSAPP_TOKEN")?.trim();
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")?.trim();
  const template = Deno.env.get("WHATSAPP_TEMPLATE_NAME")?.trim();
  const lang = Deno.env.get("WHATSAPP_TEMPLATE_LANG")?.trim() || "en";

  if (!token || !phoneNumberId || !template) {
    console.error("sendWhatsAppOtp: WhatsApp Cloud API secrets are not configured");
    return {
      ok: false,
      status: 500,
      error: "WhatsApp is not configured. Set WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_TEMPLATE_NAME in Edge Function secrets.",
    };
  }

  const to = toWhatsAppRecipient(e164);
  const includeButton = Deno.env.get("WHATSAPP_TEMPLATE_BUTTON") !== "0";
  const first = await postWhatsAppMessage(
    phoneNumberId,
    token,
    templatePayload(to, template, lang, code, includeButton),
  );

  if (first.ok) return { ok: true };

  const lower = first.body.toLowerCase();
  const buttonProblem = includeButton && (
    lower.includes("button") || lower.includes("component") || lower.includes("parameter")
  );
  if (buttonProblem) {
    const retry = await postWhatsAppMessage(
      phoneNumberId,
      token,
      templatePayload(to, template, lang, code, false),
    );
    if (retry.ok) return { ok: true };
    console.error("sendWhatsAppOtp delivery failure:", retry.status);
    return { ok: false, status: retry.status >= 400 && retry.status < 500 ? 502 : 502, error: "Could not send WhatsApp code. Please try again." };
  }

  if (first.status === 429) {
    return { ok: false, status: 429, error: "Too many WhatsApp messages. Please wait a minute and try again." };
  }

  console.error("sendWhatsAppOtp delivery failure:", first.status);
  return { ok: false, status: 502, error: "Could not send WhatsApp code. Please try again." };
}
