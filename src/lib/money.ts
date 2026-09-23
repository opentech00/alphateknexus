export function moneySLE(value: number): string {
  return `SLE ${Number(value || 0).toLocaleString('en-SL', { maximumFractionDigits: 2 })}`;
}
