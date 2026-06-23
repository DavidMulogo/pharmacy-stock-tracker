export function formatNumber(value: number) {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const digits = String(Math.abs(rounded));
  const parts: string[] = [];

  for (let index = digits.length; index > 0; index -= 3) {
    parts.unshift(digits.slice(Math.max(0, index - 3), index));
  }

  return `${sign}${parts.join(",")}`;
}

export function formatTZS(amount: number) {
  return `TSh ${formatNumber(amount)}`;
}

export function formatOptionalTZS(amount: number | null | undefined) {
  return amount == null ? "Price not set" : formatTZS(amount);
}

export function formatDateTime(value: string) {
  const [date = "", time = ""] = value.replace("T", " ").split(".");
  return time ? `${date} ${time.slice(0, 5)}` : date;
}

export function formatDate(value: string) {
  return value.slice(0, 10);
}
