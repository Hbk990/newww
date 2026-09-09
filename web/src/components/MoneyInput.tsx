import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * A money field that reads like money: 20,000,000 rather than 20000000.
 *
 * Nine unbroken digits are genuinely hard to check, and a price is the one
 * thing in this system you cannot afford to mistype — so the separators go in
 * as you type, and the caret stays where you left it rather than jumping to the
 * end after every keystroke.
 *
 * The value handed back is always a plain number string ("20000000"), never the
 * formatted text, so nothing downstream has to know about commas.
 */
export function MoneyInput({
  value,
  onChange,
  decimals = 0,
  allowNegative = false,
  placeholder,
  autoFocus,
  disabled,
  id,
}: {
  /** Plain digits, e.g. "20000000". Empty string for blank. */
  value: string;
  onChange: (plain: string) => void;
  /** 0 for CFA (whole francs), 2 for USD. */
  decimals?: number;
  allowNegative?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [digitsBeforeCaret, setDigitsBeforeCaret] = useState<number | null>(null);

  const display = format(value, decimals);

  // Put the caret back where the typist expects it: after the same number of
  // digits they had typed past, not at the end of the line.
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input || digitsBeforeCaret === null) return;

    let seen = 0;
    let position = display.length;
    for (let i = 0; i < display.length; i++) {
      if (/[\d]/.test(display[i])) {
        seen++;
        if (seen === digitsBeforeCaret) {
          position = i + 1;
          break;
        }
      }
    }
    if (digitsBeforeCaret === 0) position = display.startsWith('-') ? 1 : 0;

    input.setSelectionRange(position, position);
    setDigitsBeforeCaret(null);
  }, [display, digitsBeforeCaret]);

  return (
    <input
      ref={ref}
      id={id}
      type="text"
      inputMode={decimals > 0 ? 'decimal' : 'numeric'}
      value={display}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      onChange={(event) => {
        const input = event.target;
        const caret = input.selectionStart ?? input.value.length;
        const typedBefore = countDigits(input.value.slice(0, caret));
        onChange(sanitize(input.value, decimals, allowNegative));
        setDigitsBeforeCaret(typedBefore);
      }}
      style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
    />
  );
}

const countDigits = (text: string) => (text.match(/\d/g) ?? []).length;

/** Keeps only what can belong in a number, and no more decimals than allowed. */
function sanitize(text: string, decimals: number, allowNegative: boolean): string {
  const negative = allowNegative && text.trim().startsWith('-');
  let cleaned = text.replace(/[^\d.]/g, '');

  const firstDot = cleaned.indexOf('.');
  if (decimals === 0) {
    cleaned = cleaned.replace(/\./g, '');
  } else if (firstDot !== -1) {
    // Only the first dot counts; anything after it is capped at `decimals`.
    const whole = cleaned.slice(0, firstDot);
    const fraction = cleaned.slice(firstDot + 1).replace(/\./g, '').slice(0, decimals);
    cleaned = `${whole}.${fraction}`;
  }

  // "007" is not a price anyone types on purpose.
  cleaned = cleaned.replace(/^0+(?=\d)/, '');
  if (cleaned === '' || cleaned === '.') return negative ? '-' : '';
  return negative ? `-${cleaned}` : cleaned;
}

/** "20000000" -> "20,000,000"; a half-typed "20000." keeps its dot. */
function format(plain: string, decimals: number): string {
  if (plain === '' || plain === '-') return plain;
  const negative = plain.startsWith('-');
  const body = negative ? plain.slice(1) : plain;
  const [whole, fraction] = body.split('.');
  const grouped = (whole || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const tail = body.includes('.') ? `.${(fraction ?? '').slice(0, decimals)}` : '';
  return `${negative ? '-' : ''}${grouped}${tail}`;
}

/**
 * Reads a money field's value for sending to the server. Returns undefined for
 * a blank field so an empty box is never sent as a zero.
 */
export const moneyValue = (plain: string): number | undefined =>
  plain === '' || plain === '-' || plain === '.' ? undefined : Number(plain);

/** True when the field holds a usable amount greater than zero. */
export const hasAmount = (plain: string): boolean => {
  const value = moneyValue(plain);
  return value !== undefined && Number.isFinite(value) && value > 0;
};

/** Formats an amount for display, matching what the input shows. */
export function useFormattedAmount(plain: string, decimals = 0) {
  const [formatted, setFormatted] = useState(() => format(plain, decimals));
  useEffect(() => setFormatted(format(plain, decimals)), [plain, decimals]);
  return formatted;
}
