export type AccountSizeOption = {
  compareAtPrice?: string;
  label: string;
  price?: string;
  valueMinor: string;
};

export type ProgramOption = {
  id: string;
  label: string;
  market: "CFDs" | "Futures";
  phases: string[];
  pricingRules?: Record<string, string>;
  accountSizes: AccountSizeOption[];
  ruleStatus: "needs-verification" | "verified";
};

export type FirmOption = {
  id: string;
  label: string;
  sourceUrl: string;
  programs: ProgramOption[];
};

const stellarTwoStepSizes: AccountSizeOption[] = [
  { label: "$6,000 USD", valueMinor: "600000", price: "$44.99", compareAtPrice: "$59.99" },
  { label: "$15,000 USD", valueMinor: "1500000", price: "$89.99", compareAtPrice: "$119.99" },
  { label: "$25,000 USD", valueMinor: "2500000", price: "$149.99", compareAtPrice: "$199.99" },
  { label: "$50,000 USD", valueMinor: "5000000", price: "$224.99", compareAtPrice: "$299.99" },
  { label: "$100,000 USD", valueMinor: "10000000", price: "$549.99" },
  { label: "$200,000 USD", valueMinor: "20000000", price: "$1,099.99" },
];

const freeTrialSizes: AccountSizeOption[] = stellarTwoStepSizes.map(({ label, valueMinor }) => ({ label, valueMinor, price: "Free" }));

const stellarOneStepSizes: AccountSizeOption[] = [
  { label: "$6,000 USD", valueMinor: "600000", price: "$49.49", compareAtPrice: "$65.99" },
  { label: "$15,000 USD", valueMinor: "1500000", price: "$97.49", compareAtPrice: "$129.99" },
  { label: "$25,000 USD", valueMinor: "2500000", price: "$164.99", compareAtPrice: "$219.99" },
  { label: "$50,000 USD", valueMinor: "5000000", price: "$247.49", compareAtPrice: "$329.99" },
  { label: "$100,000 USD", valueMinor: "10000000", price: "$569.99" },
  { label: "$200,000 USD", valueMinor: "20000000", price: "$1,099.99" },
];

const stellarLiteSizes: AccountSizeOption[] = [
  { label: "$5,000 USD", valueMinor: "500000", price: "$24.74", compareAtPrice: "$32.99" },
  { label: "$10,000 USD", valueMinor: "1000000", price: "$44.99", compareAtPrice: "$59.99" },
  { label: "$25,000 USD", valueMinor: "2500000", price: "$104.99", compareAtPrice: "$139.99" },
  { label: "$50,000 USD", valueMinor: "5000000", price: "$172.49", compareAtPrice: "$229.99" },
  { label: "$100,000 USD", valueMinor: "10000000", price: "$399.99" },
  { label: "$200,000 USD", valueMinor: "20000000", price: "$798.99" },
];

const stellarInstantSizes: AccountSizeOption[] = [
  { label: "$2,000 USD", valueMinor: "200000", price: "$44.99", compareAtPrice: "$59.99" },
  { label: "$5,000 USD", valueMinor: "500000", price: "$112.49", compareAtPrice: "$149.99" },
  { label: "$10,000 USD", valueMinor: "1000000", price: "$224.99", compareAtPrice: "$299.99" },
  { label: "$20,000 USD", valueMinor: "2000000", price: "$449.99", compareAtPrice: "$599.99" },
];

export const firmCatalog: FirmOption[] = [
  {
    id: "fundednext",
    label: "FundedNext",
    sourceUrl: "https://fundednext.com/",
    programs: [
      {
        id: "fundednext-free-trial",
        label: "Free Trial",
        market: "CFDs",
        phases: ["Trial"],
        accountSizes: freeTrialSizes,
        pricingRules: {
          "Profit Target": "5%",
          "Daily Loss Limit": "5%",
          "Maximum Loss Limit": "10%",
          "Minimum Trading Days": "3 Days",
          "Time Limit": "14 calendar days from first trade",
          "Maximum Open Positions": "30",
          "Expert Advisors": "Prohibited by official Free Trial rules",
        },
        ruleStatus: "verified",
      },
      {
        id: "fundednext-stellar-2-step",
        label: "Stellar 2-Step",
        market: "CFDs",
        phases: ["Phase 1", "Phase 2", "Funded"],
        accountSizes: stellarTwoStepSizes,
        pricingRules: {
          "Phase 1 Profit Target": "8%",
          "Phase 2 Profit Target": "5%",
          "Daily Loss Limit": "5%",
          "Maximum Loss Limit": "10%",
          "Drawdown Type": "Static",
          "Minimum Trading Days": "5 Days",
          "News Trading": "Allowed",
          "15% Performance Reward": "Shown by selected account size",
          "Reset Applicable": "Yes",
        },
        ruleStatus: "verified",
      },
      {
        id: "fundednext-stellar-1-step",
        label: "Stellar 1-Step",
        market: "CFDs",
        phases: ["Phase 1", "Funded"],
        accountSizes: stellarOneStepSizes,
        pricingRules: {
          "Profit Target": "10%",
          "Daily Loss Limit": "3%",
          "Maximum Loss Limit": "6%",
          "Drawdown Type": "Static",
          "Minimum Trading Days": "2 Days",
          "News Trading": "Allowed",
          "15% Performance Reward": "Shown by selected account size",
          "Reset Applicable": "Yes",
        },
        ruleStatus: "verified",
      },
      {
        id: "fundednext-stellar-lite",
        label: "Stellar Lite",
        market: "CFDs",
        phases: ["Phase 1", "Phase 2", "Funded"],
        accountSizes: stellarLiteSizes,
        pricingRules: {
          "Phase 1 Profit Target": "8%",
          "Phase 2 Profit Target": "4%",
          "Daily Loss Limit": "4%",
          "Maximum Loss Limit": "8%",
          "Drawdown Type": "Static",
          "Minimum Trading Days": "5 Days",
          "News Trading": "Allowed",
          "Reset Applicable": "Yes",
        },
        ruleStatus: "verified",
      },
      {
        id: "fundednext-stellar-instant",
        label: "Stellar Instant",
        market: "CFDs",
        phases: ["Instant funded"],
        accountSizes: stellarInstantSizes,
        pricingRules: {
          "Profit Target": "None",
          "Daily Loss Limit": "None",
          "Maximum Loss Limit": "6%",
          "Drawdown Type": "Trailing",
          "Consistency Rule": "None",
          "Minimum Trading Days": "None",
          "Reset Applicable": "Yes",
        },
        ruleStatus: "verified",
      },
    ],
  },
];

export function findFirm(firmId: string): FirmOption | undefined {
  return firmCatalog.find((firm) => firm.id === firmId);
}

export function findProgram(firmId: string, programId: string): ProgramOption | undefined {
  return findFirm(firmId)?.programs.find((program) => program.id === programId);
}

export function getDefaultAccountContext(): AccountContext {
  const firm = firmCatalog[0];
  const program = firm.programs[0];
  const accountSize = program.accountSizes.find((size) => size.valueMinor === "10000000") ?? program.accountSizes[0];
  return {
    firmId: firm.id,
    firmLabel: firm.label,
    programId: program.id,
    programLabel: program.label,
    phase: program.phases[0],
    accountSizeMinor: accountSize.valueMinor,
    accountSizeLabel: accountSize.label,
    accountPrice: accountSize.price,
    currency: "USD",
    platform: "mt5",
    ruleStatus: program.ruleStatus,
  };
}

export type AccountContext = {
  firmId: string;
  firmLabel: string;
  programId: string;
  programLabel: string;
  phase: string;
  accountSizeMinor: string;
  accountSizeLabel: string;
  accountPrice?: string;
  currency: "USD";
  platform: "mt5";
  ruleStatus: ProgramOption["ruleStatus"];
};

export function accountContextFromSearch(searchParams: Record<string, string | string[] | undefined>): AccountContext {
  const defaults = getDefaultAccountContext();
  const firmId = single(searchParams.firm) ?? defaults.firmId;
  const firm = findFirm(firmId) ?? findFirm(defaults.firmId)!;
  const programId = single(searchParams.program) ?? defaults.programId;
  const program = firm.programs.find((candidate) => candidate.id === programId) ?? firm.programs[0];
  const phase = program.phases.includes(single(searchParams.phase) ?? "") ? single(searchParams.phase)! : program.phases[0];
  const requestedSize = single(searchParams.size);
  const accountSize = program.accountSizes.find((size) => size.valueMinor === requestedSize)
    ?? program.accountSizes.find((size) => size.valueMinor === defaults.accountSizeMinor)
    ?? program.accountSizes[0];
  return {
    firmId: firm.id,
    firmLabel: firm.label,
    programId: program.id,
    programLabel: program.label,
    phase,
    accountSizeMinor: accountSize.valueMinor,
    accountSizeLabel: accountSize.label,
    accountPrice: accountSize.price,
    currency: "USD",
    platform: "mt5",
    ruleStatus: program.ruleStatus,
  };
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
