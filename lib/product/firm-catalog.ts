export type AccountSizeOption = {
  label: string;
  valueMinor: string;
};

export type ProgramOption = {
  id: string;
  label: string;
  market: "CFDs" | "Futures";
  phases: string[];
  accountSizes: AccountSizeOption[];
  ruleStatus: "needs-verification" | "verified";
};

export type FirmOption = {
  id: string;
  label: string;
  sourceUrl: string;
  programs: ProgramOption[];
};

const visibleCfdPricingSizesPendingVerification: AccountSizeOption[] = [
  { label: "$5,000 USD", valueMinor: "500000" },
  { label: "$6,000 USD", valueMinor: "600000" },
  { label: "$10,000 USD", valueMinor: "1000000" },
  { label: "$15,000 USD", valueMinor: "1500000" },
  { label: "$25,000 USD", valueMinor: "2500000" },
  { label: "$50,000 USD", valueMinor: "5000000" },
  { label: "$100,000 USD", valueMinor: "10000000" },
  { label: "$200,000 USD", valueMinor: "20000000" },
];

export const firmCatalog: FirmOption[] = [
  {
    id: "fundednext",
    label: "FundedNext",
    sourceUrl: "https://fundednext.com/",
    programs: [
      {
        id: "fundednext-stellar-2-step",
        label: "Stellar 2-Step",
        market: "CFDs",
        phases: ["Phase 1", "Phase 2", "Funded"],
        accountSizes: visibleCfdPricingSizesPendingVerification,
        ruleStatus: "needs-verification",
      },
      {
        id: "fundednext-stellar-1-step",
        label: "Stellar 1-Step",
        market: "CFDs",
        phases: ["Phase 1", "Funded"],
        accountSizes: visibleCfdPricingSizesPendingVerification,
        ruleStatus: "needs-verification",
      },
      {
        id: "fundednext-stellar-lite",
        label: "Stellar Lite",
        market: "CFDs",
        phases: ["Phase 1", "Phase 2", "Funded"],
        accountSizes: visibleCfdPricingSizesPendingVerification,
        ruleStatus: "needs-verification",
      },
      {
        id: "fundednext-stellar-instant",
        label: "Stellar Instant",
        market: "CFDs",
        phases: ["Instant funded"],
        accountSizes: visibleCfdPricingSizesPendingVerification,
        ruleStatus: "needs-verification",
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
    currency: "USD",
    platform: "mt5",
    ruleStatus: program.ruleStatus,
  };
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
