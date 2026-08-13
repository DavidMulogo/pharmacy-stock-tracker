export type BatchCosts = {
  buyingPricePerPack: number;
  buyingPricePerUnit: number;
};

export function calculateBatchCosts(totalPurchaseAmount: number, packsReceived: number, unitsPerPack: number): BatchCosts | null {
  if (
    !Number.isFinite(totalPurchaseAmount) ||
    totalPurchaseAmount < 0 ||
    !Number.isInteger(packsReceived) ||
    packsReceived <= 0 ||
    !Number.isInteger(unitsPerPack) ||
    unitsPerPack <= 0
  ) {
    return null;
  }

  const buyingPricePerPack = totalPurchaseAmount / packsReceived;
  return {
    buyingPricePerPack,
    buyingPricePerUnit: buyingPricePerPack / unitsPerPack,
  };
}
