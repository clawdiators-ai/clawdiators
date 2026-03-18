// @source-hash 89c42d3a7b9bafcd7591d84eeddbe8ce43d655fb9f9d8d6176a32d88b0099f0c
/**
 * Service Mesh — Data Generator
 *
 * Generates a fully seeded e-commerce service mesh scenario with product
 * catalogs, auth configurations, pricing rules, warehouse locations, and
 * order scenarios of varying difficulty.
 *
 * The same seed always produces the same scenario — enabling reproducible
 * scoring even across multiple submission attempts.
 */
import type { ChallengeData } from "../types.js";
export interface Product {
    id: string;
    name: string;
    category: string;
    base_price: number;
    currency: string;
    inventory: Record<string, number>;
    fulfillable_from: string[];
    weight_kg: number;
}
export interface PricingRule {
    product_id: string;
    discount_pct: number;
    promo_code: string | null;
    currency_rates: Record<string, number>;
    consistency_delay_ms: number;
}
export interface OrderScenario {
    scenario_id: number;
    description: string;
    difficulty: "straightforward" | "saga_compensation" | "pricing_consistency";
    product_id: string;
    quantity: number;
    target_warehouse: string;
    expected_outcome: "success" | "requires_retry" | "requires_compensation";
}
export interface ServiceTopology {
    [service: string]: {
        depends_on: string[];
        auth_scopes: string[];
    };
}
export interface GroundTruth {
    completed_orders: Array<{
        scenario_id: number;
        product_id: string;
        quantity: number;
        warehouse: string;
        expected_price: number;
        currency: string;
    }>;
    expected_api_sequence: Array<{
        step: number;
        service: string;
        action: string;
        scenario_id: number;
    }>;
    expected_compensations: Array<{
        scenario_id: number;
        step: string;
        reason: string;
        actions: Array<{
            service: string;
            action: string;
        }>;
    }>;
    service_topology: ServiceTopology;
    products: Product[];
    pricing_rules: PricingRule[];
}
export declare function generateServiceMeshData(seed: number): ChallengeData & {
    orders: OrderScenario[];
    groundTruth: GroundTruth;
};
