export type PaymentReturnLink = {
  kind: 'payment-return' | 'field-paid';
  ref: string;
  status: string;
};

function hashParts(hash: string) {
  const raw = hash.replace(/^#/, '');
  const qIndex = raw.indexOf('?');
  const path = (qIndex === -1 ? raw : raw.slice(0, qIndex)).replace(/^\//, '');
  const query = qIndex === -1 ? '' : raw.slice(qIndex + 1);
  return { path, params: new URLSearchParams(query) };
}

export function parsePaymentReturnLocation(loc: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location): PaymentReturnLink | null {
  const search = new URLSearchParams(loc.search);
  const hashed = hashParts(loc.hash);
  const path = (loc.pathname.replace(/\/+$/, '') || '/').replace(/^\//, '');
  const page = search.get('page') || hashed.params.get('page') || '';
  const kind =
    path === 'payment-return' || page === 'payment-return' || hashed.path === 'payment-return'
      ? 'payment-return'
      : path === 'field-paid' || page === 'field-paid' || hashed.path === 'field-paid'
        ? 'field-paid'
        : null;
  if (!kind) return null;
  return {
    kind,
    ref: search.get('ref') || hashed.params.get('ref') || '',
    status: search.get('status') || hashed.params.get('status') || '',
  };
}

export function parsePaymentReturnHref(href: string): PaymentReturnLink | null {
  try {
    const url = new URL(href);
    return parsePaymentReturnLocation({ pathname: url.pathname, search: url.search, hash: url.hash });
  } catch {
    return null;
  }
}

export function paymentReturnHref(ref: string, status?: string) {
  const q = new URLSearchParams({ ref });
  if (status) q.set('status', status);
  return `/payment-return?${q.toString()}`;
}
