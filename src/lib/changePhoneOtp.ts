import { supabase } from './supabase';

async function extractFnError(res: { data: unknown; error: unknown }): Promise<string | null> {
  if (!res.error) return null;
  const err = res.error as { message?: string; context?: Response };
  if (err.context) {
    try {
      const body = await err.context.clone().json();
      if (body?.error) return body.error;
    } catch { /* ignore */ }
  }
  try {
    const body = res.data as Record<string, string> | null;
    if (body?.error) return body.error;
  } catch { /* ignore */ }
  return err?.message || 'Something went wrong';
}

export async function sendChangePhoneOtp(phone: string): Promise<{ error: string | null; unchanged?: boolean }> {
  const res = await supabase.functions.invoke('change-phone-otp', {
    body: { action: 'send', phone },
  });
  const err = await extractFnError(res);
  if (err) return { error: err };
  const data = res.data as { unchanged?: boolean } | null;
  return { error: null, unchanged: data?.unchanged === true };
}

export async function verifyChangePhoneOtp(phone: string, code: string): Promise<{ error: string | null }> {
  const res = await supabase.functions.invoke('change-phone-otp', {
    body: { action: 'verify', phone, code },
  });
  const err = await extractFnError(res);
  return { error: err };
}
