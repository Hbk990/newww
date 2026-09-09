/**
 * VIN handling. The check-digit test below is pure arithmetic defined by the
 * North American standard, so a typo is caught immediately — offline, with no
 * API call. Catching a wrong VIN at data entry is much cheaper than finding it
 * on a customs document later.
 */

const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
};

const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export interface VinCheck {
  normalized: string;
  /** Structurally a VIN: 17 characters, no I, O or Q. */
  wellFormed: boolean;
  /** Passes the North American check digit. Older or non-NA vehicles can fail. */
  checkDigitValid: boolean;
  message: string | null;
}

export function checkVin(raw: string): VinCheck {
  const normalized = raw.trim().toUpperCase().replace(/\s/g, '');

  if (normalized.length !== 17)
    return {
      normalized,
      wellFormed: false,
      checkDigitValid: false,
      message: `A VIN has 17 characters — this one has ${normalized.length}`,
    };

  if (/[IOQ]/.test(normalized))
    return {
      normalized,
      wellFormed: false,
      checkDigitValid: false,
      message: 'A VIN never contains the letters I, O or Q — check for a mistyped 1 or 0',
    };

  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(normalized))
    return {
      normalized,
      wellFormed: false,
      checkDigitValid: false,
      message: 'A VIN contains only letters and digits',
    };

  const total = normalized
    .split('')
    .reduce((acc, char, i) => acc + (TRANSLITERATION[char] ?? 0) * WEIGHTS[i], 0);
  const remainder = total % 11;
  const expected = remainder === 10 ? 'X' : String(remainder);
  const checkDigitValid = normalized[8] === expected;

  return {
    normalized,
    wellFormed: true,
    checkDigitValid,
    message: checkDigitValid
      ? null
      : 'This VIN fails its check digit. Some older or imported vehicles do — confirm it against the car before saving.',
  };
}

/** The 10th character encodes the model year on 1980+ North American vehicles. */
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';

export function yearFromVin(vin: string, now = new Date()): number | null {
  const check = checkVin(vin);
  if (!check.wellFormed) return null;
  const index = YEAR_CODES.indexOf(check.normalized[9]);
  if (index === -1) return null;

  // The code repeats every 30 years, so pick the occurrence that is not in the
  // future — a 2001 and a 2031 car share a letter.
  const candidate = 1980 + index;
  const maxYear = now.getFullYear() + 1;
  let year = candidate;
  while (year + 30 <= maxYear) year += 30;
  return year;
}
