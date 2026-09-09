/**
 * One place that talks to the server. Every amount arrives as a STRING and is
 * kept as a string all the way to the screen — turning it into a JavaScript
 * number would reintroduce exactly the rounding errors the server works so
 * hard to avoid.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiError(data?.error ?? 'Something went wrong', response.status);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Money, grouped for reading, never rounded away. */
export function fmt(value: string | number | null | undefined, currency?: string): string {
  if (value === null || value === undefined || value === '') return '—';
  const raw = String(value);
  const negative = raw.startsWith('-');
  const [whole, decimals] = raw.replace('-', '').split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const cents = decimals && Number(decimals) !== 0 ? `.${decimals.replace(/0+$/, '')}` : '';
  return `${negative ? '−' : ''}${grouped}${cents}${currency ? ` ${currency}` : ''}`;
}

export const fmtUsd = (v: string | number | null | undefined) =>
  v === null || v === undefined ? '—' : `$${fmt(v)}`;

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type PartyType =
  | 'CAR_SUPPLIER'
  | 'SHIPPING_COMPANY'
  | 'TRANSFER_COMPANY'
  | 'WORKER'
  | 'PARTS_SUPPLIER'
  | 'CUSTOMER';

export interface Party {
  id: number;
  type: PartyType;
  name: string;
  companyName: string | null;
  mobile: string | null;
  currency: string;
  country: 'USA' | 'CANADA' | null;
  wholesaler: 'PRICE_ONLY' | 'PRICE_PLUS_TAX' | null;
  workerRole: 'GARAGE' | 'SHOWROOM' | null;
  note: string | null;
  active: boolean;
  balance?: string;
  balanceLabel?: string;
}

export type CarStatus =
  | 'PURCHASED'
  | 'SHIPPED'
  | 'ARRIVED'
  | 'IN_GARAGE'
  | 'SHOWROOM'
  | 'SOLD'
  | 'SOLD_IN_ORIGIN';

export interface CostBreakdown {
  usd: {
    purchasePriceUsd: string;
    originExpensesUsd: string;
    taxInvoicedUsd: string;
    taxCapitalizedUsd: string;
    taxRefundableUsd: string;
    freightShareUsd: string | null;
    totalCostUsd: string;
  };
  arrived: boolean;
  cfa: {
    cfaRate: string;
    purchaseCfa: string;
    originExpensesCfa: string;
    taxCapitalizedCfa: string;
    freightCfa: string;
    arrivalCostCfa: string;
  } | null;
  repairsCfa: string;
  landedCostCfa: string | null;
}

export interface Car {
  id: number;
  label?: string;
  makeName: string;
  modelName: string;
  year: number;
  color: string;
  vin: string;
  status: CarStatus;
  damaged: boolean;
  driveAndRun: boolean;
  problemNote: string | null;
  arrivalNote: string | null;
  purchaseDate: string;
  purchasePriceUsd: string;
  taxUsd: string;
  taxRefundableUsd: string;
  taxRefundSettled: boolean;
  askingPriceCfa: string | null;
  freightShareUsd: string | null;
  arrivalCostCfa: string | null;
  cfaRate: string | null;
  showroomAt: string | null;
  arrivedAt: string | null;
  supplier?: { id: number; name: string; country: string | null };
  shipment?: { id: number; reference: string; status: string } | null;
  costs: CostBreakdown;
  daysInStock?: number | null;
  daysInGarage?: number | null;
  potentialProfitCfa?: string | null;
}

export interface Shipment {
  id: number;
  reference: string;
  freightCostUsd: string;
  cfaRate: string | null;
  departureDate: string | null;
  arrivalDate: string | null;
  status: 'DRAFT' | 'SHIPPED' | 'ARRIVED';
  note: string | null;
  carCount?: number;
  shippingCompany: { id: number; name: string };
  cars: Car[];
}

export interface StatementLine {
  id: number;
  date: string;
  kind: string;
  amount: string;
  description: string;
  runningBalance: string;
}

export interface Statement {
  party: Party;
  meaning: { positive: string; negative: string; label: string; currency: string };
  openingBalance: string;
  closingBalance: string;
  balanceLabel: string;
  lines: StatementLine[];
}

export interface Settings {
  cfaCode: string;
  taxThresholdUsd: string;
  businessName: string;
  /** The account a customer's payment lands in. Empty until chosen. */
  defaultCashAccountId: string;
}
