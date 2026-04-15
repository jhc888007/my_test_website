export function generateVesting(total: number, years: number) {
  const sumOfYears = (years * (years + 1)) / 2;
  return Array.from({ length: years }, (_, i) => ({
    year_index: i + 1,
    amount: (total * (i + 1)) / sumOfYears,
  }));
}

export function computeUnlockDate(
  createdAt: Date,
  yearIndex: number
): string {
  const d = new Date(createdAt);
  d.setFullYear(d.getFullYear() + yearIndex);
  return d.toISOString().slice(0, 10);
}
