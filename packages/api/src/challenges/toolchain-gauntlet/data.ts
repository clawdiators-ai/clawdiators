import { mulberry32 } from "../../services/whimsy.js";

/**
 * Tool-Chain Gauntlet: 6 APIs form a chain.
 * registry → inventory → pricing → shipping → loyalty → audit
 *
 * The objective: find the optimal product to order for a customer,
 * considering inventory, pricing, shipping costs, loyalty discounts,
 * and audit compliance. Each API's output feeds the next.
 */

export interface Product {
  id: string;
  name: string;
  category: string;
  sku: string;
}

export interface InventoryItem {
  sku: string;
  warehouse: string;
  quantity: number;
  restockDate: string | null;
}

export interface PricingEntry {
  sku: string;
  basePrice: number;
  discount: number; // 0-1
  currency: string;
  validUntil: string;
}

export interface ShippingOption {
  warehouse: string;
  destination: string;
  cost: number;
  deliveryDays: number;
  carrier: string;
}

export interface LoyaltyProfile {
  customerId: string;
  tier: "bronze" | "silver" | "gold" | "platinum";
  points: number;
  discountMultiplier: number; // additional discount on top of pricing
}

export interface AuditRecord {
  sku: string;
  compliant: boolean;
  reason: string | null;
  lastAuditDate: string;
}

export interface GauntletGroundTruth {
  customerId: string;
  destination: string;
  optimalProduct: {
    sku: string;
    name: string;
    warehouse: string;
    finalPrice: number; // after all discounts
    shippingCost: number;
    totalCost: number; // finalPrice + shippingCost
    deliveryDays: number;
    carrier: string;
  };
  // For multi-checkpoint: intermediate expectations per phase
  phase1_expected: { available_skus: string[] }; // registry + inventory check
  phase2_expected: { priced_options: { sku: string; effectivePrice: number }[] }; // pricing + loyalty
  phase3_expected: { sku: string; totalCost: number }; // final with shipping + audit
}

export interface GauntletData {
  registry: Product[];
  inventory: InventoryItem[];
  pricing: PricingEntry[];
  shipping: ShippingOption[];
  loyalty: LoyaltyProfile;
  audit: AuditRecord[];
  groundTruth: GauntletGroundTruth;
  objective: string;
}

const PRODUCT_NAMES = [
  "Abyssal Core Module", "Reef Sensor Array", "Depth Pressure Gauge",
  "Coral Filtration Unit", "Tidal Energy Cell", "Shell Armor Plate",
  "Brine Desalinator", "Plankton Harvester", "Anchor Bolt Kit",
  "Trident Comm Relay", "Kelp Processor", "Current Flow Meter",
];

const CATEGORIES = ["sensors", "power", "defense", "processing", "communication", "tools"];
const WAREHOUSES = ["Warehouse-North", "Warehouse-South", "Warehouse-East"];
const DESTINATIONS = ["Port-Alpha", "Port-Beta", "Port-Gamma"];
const CARRIERS = ["DeepFreight", "OceanExpress", "TidalLogistics", "ReefRunners"];

export function generateGauntletData(seed: number): GauntletData {
  const rng = mulberry32(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const randInt = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
  const randFloat = (min: number, max: number) => Math.round((rng() * (max - min) + min) * 100) / 100;

  // Generate customer and destination
  const customerId = `CUST-${String(seed % 9000 + 1000)}`;
  const destination = pick(DESTINATIONS);

  // === 1. Registry: products ===
  const productCount = randInt(6, 10);
  const registry: Product[] = [];
  const usedNames = new Set<string>();
  for (let i = 0; i < productCount; i++) {
    let name = PRODUCT_NAMES[i % PRODUCT_NAMES.length];
    if (usedNames.has(name)) name = `${name} v${i}`;
    usedNames.add(name);
    registry.push({
      id: `PROD-${String(i + 1).padStart(3, "0")}`,
      name,
      category: CATEGORIES[i % CATEGORIES.length],
      sku: `SKU-${String(seed % 100).padStart(2, "0")}${String(i + 1).padStart(2, "0")}`,
    });
  }

  // === 2. Inventory: some in stock, some not ===
  const inventory: InventoryItem[] = [];
  for (const product of registry) {
    // Each product may be in 1-3 warehouses
    const warehouseCount = randInt(0, 2); // 0 = out of stock everywhere
    for (let w = 0; w <= warehouseCount; w++) {
      const warehouse = WAREHOUSES[w % WAREHOUSES.length];
      const quantity = randInt(0, 50); // 0 means reserved/depleted
      inventory.push({
        sku: product.sku,
        warehouse,
        quantity,
        restockDate: quantity === 0 ? `2026-03-${String(randInt(1, 28)).padStart(2, "0")}` : null,
      });
    }
  }

  // === 3. Pricing ===
  const validDate = new Date("2026-03-15");
  const pricing: PricingEntry[] = registry.map((p) => ({
    sku: p.sku,
    basePrice: randFloat(50, 2000),
    discount: randFloat(0, 0.3),
    currency: "CLW",
    validUntil: validDate.toISOString().split("T")[0],
  }));

  // === 4. Shipping ===
  const shipping: ShippingOption[] = [];
  for (const wh of WAREHOUSES) {
    for (const dest of DESTINATIONS) {
      shipping.push({
        warehouse: wh,
        destination: dest,
        cost: randFloat(5, 100),
        deliveryDays: randInt(1, 14),
        carrier: pick(CARRIERS),
      });
    }
  }

  // === 5. Loyalty ===
  const tiers: LoyaltyProfile["tier"][] = ["bronze", "silver", "gold", "platinum"];
  const tier = pick(tiers);
  const discountMultipliers: Record<string, number> = { bronze: 0.0, silver: 0.05, gold: 0.10, platinum: 0.15 };
  const loyalty: LoyaltyProfile = {
    customerId,
    tier,
    points: randInt(100, 5000),
    discountMultiplier: discountMultipliers[tier],
  };

  // === 6. Audit ===
  const audit: AuditRecord[] = registry.map((p) => ({
    sku: p.sku,
    compliant: rng() > 0.2, // 80% compliant
    reason: rng() > 0.2 ? null : pick(["Pending recertification", "Import restriction", "Safety review"]),
    lastAuditDate: `2026-02-${String(randInt(1, 28)).padStart(2, "0")}`,
  }));

  // === Compute ground truth: find optimal product ===
  // Constraints: must be in stock (qty > 0), compliant, cheapest total cost to destination
  let bestOption: GauntletGroundTruth["optimalProduct"] | null = null;

  const availableSkus: string[] = [];
  const pricedOptions: { sku: string; effectivePrice: number }[] = [];

  for (const product of registry) {
    // Check audit compliance
    const auditRecord = audit.find((a) => a.sku === product.sku);
    if (!auditRecord || !auditRecord.compliant) continue;

    // Check inventory — find warehouses with stock
    const inStockLocations = inventory.filter((inv) => inv.sku === product.sku && inv.quantity > 0);
    if (inStockLocations.length === 0) continue;

    availableSkus.push(product.sku);

    // Get pricing
    const price = pricing.find((p) => p.sku === product.sku);
    if (!price) continue;

    const effectivePrice = Math.round(price.basePrice * (1 - price.discount) * (1 - loyalty.discountMultiplier) * 100) / 100;
    pricedOptions.push({ sku: product.sku, effectivePrice });

    // Find best shipping for each warehouse
    for (const loc of inStockLocations) {
      const shipOption = shipping.find((s) => s.warehouse === loc.warehouse && s.destination === destination);
      if (!shipOption) continue;

      const totalCost = Math.round((effectivePrice + shipOption.cost) * 100) / 100;

      if (!bestOption || totalCost < bestOption.totalCost) {
        bestOption = {
          sku: product.sku,
          name: product.name,
          warehouse: loc.warehouse,
          finalPrice: effectivePrice,
          shippingCost: shipOption.cost,
          totalCost,
          deliveryDays: shipOption.deliveryDays,
          carrier: shipOption.carrier,
        };
      }
    }
  }

  // If no valid product found (very unlikely but handle gracefully),
  // force one product to be valid
  if (!bestOption) {
    const fallback = registry[0];
    audit[0].compliant = true;
    audit[0].reason = null;
    if (!inventory.find((i) => i.sku === fallback.sku && i.quantity > 0)) {
      inventory.push({ sku: fallback.sku, warehouse: WAREHOUSES[0], quantity: 10, restockDate: null });
    }
    const price = pricing[0];
    const effectivePrice = Math.round(price.basePrice * (1 - price.discount) * (1 - loyalty.discountMultiplier) * 100) / 100;
    const shipOption = shipping.find((s) => s.warehouse === WAREHOUSES[0] && s.destination === destination)!;
    bestOption = {
      sku: fallback.sku,
      name: fallback.name,
      warehouse: WAREHOUSES[0],
      finalPrice: effectivePrice,
      shippingCost: shipOption.cost,
      totalCost: Math.round((effectivePrice + shipOption.cost) * 100) / 100,
      deliveryDays: shipOption.deliveryDays,
      carrier: shipOption.carrier,
    };
    availableSkus.push(fallback.sku);
    pricedOptions.push({ sku: fallback.sku, effectivePrice });
  }

  const objective = `Customer ${customerId} needs the cheapest compliant product delivered to ${destination}. Navigate the supply chain: check the product registry, verify inventory, get pricing with loyalty discounts (customer tier: ${tier}), find shipping options, and confirm audit compliance. Report the optimal product SKU, final price, shipping cost, total cost, delivery days, and carrier. Submit checkpoints at each phase.`;

  return {
    registry,
    inventory,
    pricing,
    shipping,
    loyalty,
    audit,
    groundTruth: {
      customerId,
      destination,
      optimalProduct: bestOption,
      phase1_expected: { available_skus: availableSkus },
      phase2_expected: { priced_options: pricedOptions },
      phase3_expected: { sku: bestOption.sku, totalCost: bestOption.totalCost },
    },
    objective,
  };
}
