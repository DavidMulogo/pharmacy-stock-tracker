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

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const darEsSalaamOffsetMilliseconds = 3 * 60 * 60 * 1000;

export function formatDateTime(value: string) {
  const normalized = value
    .trim()
    .replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T")
    .replace(/\.(\d{3})\d+/, ".$1")
    .replace(/([+-]\d{2})$/, "$1:00");
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized);
  const date = new Date(hasTimezone ? normalized : `${normalized}Z`);

  if (!Number.isFinite(date.getTime())) return value;

  const pharmacyTime = new Date(date.getTime() + darEsSalaamOffsetMilliseconds);
  const day = pharmacyTime.getUTCDate();
  const month = monthNames[pharmacyTime.getUTCMonth()];
  const year = pharmacyTime.getUTCFullYear();
  const minutes = String(pharmacyTime.getUTCMinutes()).padStart(2, "0");
  const hour24 = pharmacyTime.getUTCHours();
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  return `${day} ${month} ${year}, ${hour12}:${minutes} ${period}`;
}

export function formatDate(value: string) {
  return value.slice(0, 10);
}
