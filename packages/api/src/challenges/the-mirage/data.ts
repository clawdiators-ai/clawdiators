import { mulberry32 } from "../../services/whimsy.js";

export interface CensusRecord {
  district: string;
  population: number;
  area_sq_km: number;
  median_income: number;
  employment_rate: number;
  household_count: number;
}

export interface FinancialRecord {
  district: string;
  tax_revenue: number;
  business_count: number;
  avg_business_revenue: number;
  gdp: number;
  public_spending: number;
}

export interface EnvironmentalRecord {
  district: string;
  air_quality_index: number;
  water_quality: number;
  green_space_pct: number;
  co2_emissions_tonnes: number;
  industrial_zone_pct: number;
}

export interface Fabrication {
  id: string;
  district: string;
  field: string;
  source: string;
  fabrication_type: string;
  explanation: string;
}

export interface MirageGroundTruth {
  fabrications: Fabrication[];
  clean_districts: string[];
}

export interface MirageData {
  census: CensusRecord[];
  financial: FinancialRecord[];
  environmental: EnvironmentalRecord[];
  groundTruth: MirageGroundTruth;
  objective: string;
}

const DISTRICT_NAMES = [
  "Coral Heights", "Tide Flats", "Abyssal Ward", "Kelp Basin",
  "Reef Terrace", "Shoal Gate", "Deepwater Rise", "Sandbar Commons",
  "Nautilus Quarter", "Urchin Hollow", "Driftwood Reach", "Barnacle Row",
  "Lagoon Crossing", "Seagrass Mile", "Pearl Bluff",
];

// All fabrications require cross-referencing fields or datasets to detect.
// Every individual value is plausible in isolation.

export function generateMirageData(seed: number): MirageData {
  const rng = mulberry32(seed);
  const randInt = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
  const randFloat = (min: number, max: number) => +(min + rng() * (max - min)).toFixed(2);

  const districts = [...DISTRICT_NAMES];
  for (let i = districts.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [districts[i], districts[j]] = [districts[j], districts[i]];
  }

  const census: CensusRecord[] = [];
  const financial: FinancialRecord[] = [];
  const environmental: EnvironmentalRecord[] = [];

  for (const district of districts) {
    const population = randInt(12000, 250000);
    const areaSqKm = randFloat(2, 80);
    const medianIncome = randInt(30000, 110000);
    const employmentRate = randFloat(58, 94);
    const avgHouseholdSize = randFloat(2.1, 3.8);
    const householdCount = Math.round(population / avgHouseholdSize);

    census.push({
      district,
      population,
      area_sq_km: areaSqKm,
      median_income: medianIncome,
      employment_rate: employmentRate,
      household_count: householdCount,
    });

    // Financial data derived from census with realistic variance
    const taxBase = population * medianIncome * (employmentRate / 100);
    const effectiveTaxRate = randFloat(0.04, 0.12);
    const taxRevenue = Math.round(taxBase * effectiveTaxRate);
    const businessCount = Math.max(20, Math.round(population / randInt(18, 55)));
    const avgBusinessRevenue = randInt(100000, 500000);
    const gdp = Math.round(businessCount * avgBusinessRevenue * randFloat(0.8, 1.3));
    const publicSpending = Math.round(taxRevenue * randFloat(0.6, 0.95));

    financial.push({
      district,
      tax_revenue: taxRevenue,
      business_count: businessCount,
      avg_business_revenue: avgBusinessRevenue,
      gdp,
      public_spending: publicSpending,
    });

    const industrialPct = randFloat(3, 35);
    const greenSpacePct = randFloat(5, Math.max(10, 100 - industrialPct - 20));
    const airQuality = Math.round(80 - industrialPct * randFloat(0.8, 1.5) + randInt(-5, 5));
    const co2PerCapita = randFloat(3, 12);
    const co2Emissions = Math.round(population * co2PerCapita);
    const waterQuality = randFloat(5.5, 8.5);

    environmental.push({
      district,
      air_quality_index: Math.max(10, Math.min(95, airQuality)),
      water_quality: waterQuality,
      green_space_pct: greenSpacePct,
      co2_emissions_tonnes: co2Emissions,
      industrial_zone_pct: industrialPct,
    });
  }

  // ── Plant cross-referencing fabrications ──────────────────────────
  const numFabrications = randInt(8, 10);
  const fabrications: Fabrication[] = [];

  const indices = Array.from({ length: districts.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  // Each fabrication alters a value so it's plausible alone but contradicts
  // another field when cross-referenced.
  const fabricationGenerators: Array<(idx: number, fabId: string) => Fabrication> = [
    // Tax revenue impossibly high relative to population x income x employment
    (idx, fabId) => {
      const pop = census[idx].population;
      const inc = census[idx].median_income;
      const emp = census[idx].employment_rate / 100;
      const maxPlausibleTax = pop * inc * emp * 0.15;
      financial[idx].tax_revenue = Math.round(maxPlausibleTax * randFloat(2.2, 3.8));
      return {
        id: fabId,
        district: districts[idx],
        field: "tax_revenue",
        source: "financial",
        fabrication_type: "cross_reference_inconsistency",
        explanation: `Tax revenue ($${financial[idx].tax_revenue.toLocaleString()}) implies an effective tax rate of ${((financial[idx].tax_revenue / (pop * inc * emp)) * 100).toFixed(0)}%, far exceeding any plausible rate when cross-referenced with population (${pop}), median income ($${inc}), and employment rate (${census[idx].employment_rate}%).`,
      };
    },
    // Business count implies impossibly few people per business
    (idx, fabId) => {
      const pop = census[idx].population;
      financial[idx].business_count = Math.round(pop / randFloat(6, 12));
      return {
        id: fabId,
        district: districts[idx],
        field: "business_count",
        source: "financial",
        fabrication_type: "cross_reference_inconsistency",
        explanation: `Business count (${financial[idx].business_count}) relative to population (${pop}) implies ${(pop / financial[idx].business_count).toFixed(1)} people per business, which is unrealistically low (typical range: 18-55).`,
      };
    },
    // GDP contradicts business_count x avg_business_revenue
    (idx, fabId) => {
      const bizGdp = financial[idx].business_count * financial[idx].avg_business_revenue;
      financial[idx].gdp = Math.round(bizGdp * randFloat(3, 5));
      return {
        id: fabId,
        district: districts[idx],
        field: "gdp",
        source: "financial",
        fabrication_type: "cross_reference_inconsistency",
        explanation: `GDP ($${financial[idx].gdp.toLocaleString()}) is ${Math.round(financial[idx].gdp / bizGdp)}x the product of business_count (${financial[idx].business_count}) and avg_business_revenue ($${financial[idx].avg_business_revenue}), which should approximate GDP.`,
      };
    },
    // CO2 emissions per capita wildly out of range compared to other districts
    (idx, fabId) => {
      const pop = census[idx].population;
      environmental[idx].co2_emissions_tonnes = Math.round(pop * randFloat(18, 35));
      return {
        id: fabId,
        district: districts[idx],
        field: "co2_emissions_tonnes",
        source: "environmental",
        fabrication_type: "cross_reference_inconsistency",
        explanation: `CO2 emissions (${environmental[idx].co2_emissions_tonnes.toLocaleString()} tonnes) for population ${pop} implies ${(environmental[idx].co2_emissions_tonnes / pop).toFixed(0)} tonnes per capita, while other districts average 3-12 tonnes per capita.`,
      };
    },
    // Public spending exceeds tax revenue (impossible since it's funded by tax)
    (idx, fabId) => {
      const tax = financial[idx].tax_revenue;
      financial[idx].public_spending = Math.round(tax * randFloat(1.15, 1.8));
      return {
        id: fabId,
        district: districts[idx],
        field: "public_spending",
        source: "financial",
        fabrication_type: "cross_reference_inconsistency",
        explanation: `Public spending ($${financial[idx].public_spending.toLocaleString()}) is ${(financial[idx].public_spending / tax).toFixed(1)}x the tax revenue ($${tax.toLocaleString()}), far exceeding what's fiscally possible without external transfers.`,
      };
    },
    // Household count contradicts population (implies unrealistic household size)
    (idx, fabId) => {
      const pop = census[idx].population;
      census[idx].household_count = Math.round(pop / randFloat(1.2, 1.7));
      return {
        id: fabId,
        district: districts[idx],
        field: "household_count",
        source: "census",
        fabrication_type: "cross_reference_inconsistency",
        explanation: `Household count (${census[idx].household_count}) relative to population (${pop}) implies ${(pop / census[idx].household_count).toFixed(2)} people per household, which is impossibly low (typical: 2.1-3.8).`,
      };
    },
    // High industrial zone but high air quality (contradictory correlation)
    (idx, fabId) => {
      environmental[idx].industrial_zone_pct = randFloat(55, 75);
      environmental[idx].air_quality_index = randInt(85, 95);
      return {
        id: fabId,
        district: districts[idx],
        field: "air_quality_index",
        source: "environmental",
        fabrication_type: "cross_reference_inconsistency",
        explanation: `Air quality index (${environmental[idx].air_quality_index}) is excellent despite an industrial zone covering ${environmental[idx].industrial_zone_pct}% of the district. Other districts with similar industrial coverage have AQI 20-45.`,
      };
    },
    // Green space + industrial zone > 100% of area
    (idx, fabId) => {
      const currentIndustrial = environmental[idx].industrial_zone_pct;
      environmental[idx].industrial_zone_pct = randFloat(35, 50);
      environmental[idx].green_space_pct = randFloat(35, 50);
      return {
        id: fabId,
        district: districts[idx],
        field: "green_space_pct",
        source: "environmental",
        fabrication_type: "cross_reference_inconsistency",
        explanation: `Green space (${environmental[idx].green_space_pct}%) and industrial zone (${environmental[idx].industrial_zone_pct}%) consume ${(environmental[idx].green_space_pct + environmental[idx].industrial_zone_pct).toFixed(1)}% of total area, leaving implausibly little room for residential and transport infrastructure in a densely populated district.`,
      };
    },
    // Employment rate high but very low tax revenue relative to working population
    (idx, fabId) => {
      census[idx].employment_rate = randFloat(90, 96);
      const pop = census[idx].population;
      const inc = census[idx].median_income;
      const workingPop = pop * census[idx].employment_rate / 100;
      financial[idx].tax_revenue = Math.round(workingPop * inc * randFloat(0.001, 0.005));
      return {
        id: fabId,
        district: districts[idx],
        field: "tax_revenue",
        source: "financial",
        fabrication_type: "cross_reference_inconsistency",
        explanation: `With ${census[idx].employment_rate}% employment rate and median income $${inc}, the working population of ${Math.round(workingPop)} should generate far more than $${financial[idx].tax_revenue.toLocaleString()} in tax revenue (effective rate: ${((financial[idx].tax_revenue / (workingPop * inc)) * 100).toFixed(3)}%).`,
      };
    },
    // Population density contradicts area_sq_km (population / area gives implausible density)
    (idx, fabId) => {
      const pop = census[idx].population;
      census[idx].area_sq_km = randFloat(0.1, 0.5);
      return {
        id: fabId,
        district: districts[idx],
        field: "area_sq_km",
        source: "census",
        fabrication_type: "cross_reference_inconsistency",
        explanation: `Area (${census[idx].area_sq_km} sq km) relative to population (${pop}) implies a density of ${Math.round(pop / census[idx].area_sq_km).toLocaleString()} people per sq km, which exceeds even the densest cities on Earth (~27,000/sq km).`,
      };
    },
  ];

  const genIndices = Array.from({ length: fabricationGenerators.length }, (_, i) => i);
  for (let i = genIndices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [genIndices[i], genIndices[j]] = [genIndices[j], genIndices[i]];
  }

  const usedDistricts = new Set<string>();
  for (let f = 0; f < numFabrications; f++) {
    const districtIdx = indices[f % indices.length];
    const genIdx = genIndices[f % genIndices.length];
    const fabId = `fab-${seed}-${f + 1}`;
    const fabrication = fabricationGenerators[genIdx](districtIdx, fabId);
    fabrications.push(fabrication);
    usedDistricts.add(districts[districtIdx]);
  }

  const cleanDistricts = districts.filter((d) => !usedDistricts.has(d));

  const groundTruth: MirageGroundTruth = {
    fabrications,
    clean_districts: cleanDistricts,
  };

  const objective =
    "Three datasets describe 15 districts: census, financial, and environmental. " +
    "Every individual value appears plausible on its own. However, 8\u201310 data points have been fabricated " +
    "and can only be detected by cross-referencing values across fields or datasets " +
    "(e.g., tax revenue vs. population and income, CO2 per capita vs. other districts, " +
    "land use percentages that sum beyond 100%). " +
    "Submit an array of fabrications with district name, field, source, and explanation.";

  return { census, financial, environmental, groundTruth, objective };
}
