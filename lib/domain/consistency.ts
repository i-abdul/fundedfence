import { minor, type MinorUnits } from "./money.ts";

export type ConsistencyDeal = {
  positionTicket: string;
  entryType: number;
  volumeUnits: string;
  profitMinor: string;
  commissionMinor: string;
  swapMinor: string;
  feeMinor: string;
  occurredAt: string;
};

export type ConsistencyResult = {
  totalNetProfitMinor: MinorUnits;
  bestDayProfitMinor: MinorUnits;
  bestDayShareBps: number | null;
  profitableDayCount: number;
  tradingDayCount: number;
  closedTradeCount: number;
  largestClosedVolumeUnits: MinorUnits;
  averageClosedVolumeUnits: MinorUnits | null;
  largestToAverageVolumeBps: number | null;
  riskConsistencyStatus: "unknown";
};

export function calculateConsistency(deals: ConsistencyDeal[]): ConsistencyResult {
  const daily = new Map<string, MinorUnits>();
  const closedVolumes: MinorUnits[] = [];
  const closedPositions = new Set<string>();
  for (const deal of deals) {
    const day = isoDay(deal.occurredAt);
    const net = minor(deal.profitMinor) + minor(deal.commissionMinor) + minor(deal.swapMinor) + minor(deal.feeMinor);
    daily.set(day, (daily.get(day) ?? 0n) + net);
    if ((deal.entryType === 1 || deal.entryType === 2) && !closedPositions.has(deal.positionTicket)) {
      closedPositions.add(deal.positionTicket);
      closedVolumes.push(minor(deal.volumeUnits));
    }
  }
  const dayValues = [...daily.values()];
  const totalNet = dayValues.reduce((sum, value) => sum + value, 0n);
  const bestDay = dayValues.length ? dayValues.reduce((best, value) => value > best ? value : best, dayValues[0]) : 0n;
  const totalVolume = closedVolumes.reduce((sum, value) => sum + value, 0n);
  const averageVolume = closedVolumes.length ? totalVolume / BigInt(closedVolumes.length) : null;
  const largestVolume = closedVolumes.length ? closedVolumes.reduce((best, value) => value > best ? value : best, closedVolumes[0]) : 0n;
  return {
    totalNetProfitMinor: totalNet,
    bestDayProfitMinor: bestDay,
    bestDayShareBps: totalNet > 0n && bestDay > 0n ? Number((bestDay * 10_000n) / totalNet) : null,
    profitableDayCount: dayValues.filter((value) => value > 0n).length,
    tradingDayCount: daily.size,
    closedTradeCount: closedPositions.size,
    largestClosedVolumeUnits: largestVolume,
    averageClosedVolumeUnits: averageVolume,
    largestToAverageVolumeBps: averageVolume && averageVolume > 0n ? Number((largestVolume * 10_000n) / averageVolume) : null,
    riskConsistencyStatus: "unknown",
  };
}

export function consistencyResultJson(result: ConsistencyResult): Record<string, unknown> {
  return JSON.parse(JSON.stringify(result, (_key, value) => typeof value === "bigint" ? value.toString() : value)) as Record<string, unknown>;
}

function isoDay(value: string): string {
  if (Number.isNaN(Date.parse(value))) throw new Error("Consistency deal timestamp is invalid.");
  return value.slice(0, 10);
}
