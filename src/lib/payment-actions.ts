export type PaymentRequest = { details: string; id: string };

// Reuse a report's primary key after a lost response or a page reload.
// Only a fingerprint and random ID are stored, not the payment details.
export async function paymentRequest(tenant: string, details: unknown, previous: PaymentRequest | null): Promise<PaymentRequest> {
 const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(details)));
 const fingerprint = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
 if (previous?.details === fingerprint) return previous;
 const key = 'rentozi-payment-report-' + tenant;
 try { const saved = JSON.parse(sessionStorage.getItem(key) || 'null'); if (saved?.details === fingerprint && /^[0-9a-f-]{36}$/i.test(saved?.id || '')) return saved; } catch {}
 const request = { details: fingerprint, id: crypto.randomUUID() };
 try { sessionStorage.setItem(key, JSON.stringify(request)); } catch {}
 return request;
}

export async function savePaymentReport(client: any, report: Record<string, unknown>, id: string) {
 const { error } = await client.from('payment_submissions').insert({ ...report, id });
 if (!error) return;
 if (error.code === '23505') {
  const { data, error: readError } = await client.from('payment_submissions').select('id').eq('id', id).eq('tenant_id', report.tenant_id).maybeSingle();
  if (!readError && data?.id === id) return;
 }
 throw Error(error.message || 'Could not save payment report');
}

export function clearPaymentRequest(tenant: string) {
 try { sessionStorage.removeItem('rentozi-payment-report-' + tenant); } catch {}
}
