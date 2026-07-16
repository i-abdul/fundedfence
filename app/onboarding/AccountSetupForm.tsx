"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { FirmOption } from "@/lib/product/firm-catalog";

export function AccountSetupForm({ firms }: { firms: FirmOption[] }) {
  const [firmId, setFirmId] = useState(firms[0]?.id ?? "");
  const selectedFirm = useMemo(() => firms.find((firm) => firm.id === firmId) ?? firms[0], [firmId, firms]);
  const [programId, setProgramId] = useState(selectedFirm?.programs[0]?.id ?? "");
  const selectedProgram = useMemo(
    () => selectedFirm?.programs.find((program) => program.id === programId) ?? selectedFirm?.programs[0],
    [programId, selectedFirm],
  );
  const [phase, setPhase] = useState(selectedProgram?.phases[0] ?? "");
  const [size, setSize] = useState(selectedProgram?.accountSizes.find((option) => option.valueMinor === "10000000")?.valueMinor ?? selectedProgram?.accountSizes[0]?.valueMinor ?? "");

  function chooseFirm(nextFirmId: string) {
    const nextFirm = firms.find((firm) => firm.id === nextFirmId) ?? firms[0];
    const nextProgram = nextFirm.programs[0];
    setFirmId(nextFirm.id);
    setProgramId(nextProgram.id);
    setPhase(nextProgram.phases[0]);
    setSize(defaultSize(nextProgram));
  }

  function chooseProgram(nextProgramId: string) {
    const nextProgram = selectedFirm.programs.find((program) => program.id === nextProgramId) ?? selectedFirm.programs[0];
    setProgramId(nextProgram.id);
    setPhase(nextProgram.phases[0]);
    setSize(defaultSize(nextProgram));
  }

  return (
    <form action="/pairing" method="get" className="setup-form">
      <label>
        <span>Prop firm</span>
        <select name="firm" value={firmId} onChange={(event) => chooseFirm(event.target.value)}>
          {firms.map((firm) => <option value={firm.id} key={firm.id}>{firm.label}</option>)}
        </select>
        <small>FundedNext CFD programs and rules are linked to captured official sources.</small>
      </label>
      <div className="form-grid">
        <label>
          <span>Program</span>
          <select name="program" value={programId} onChange={(event) => chooseProgram(event.target.value)}>
            {selectedFirm.programs.map((program) => <option value={program.id} key={program.id}>{program.label} · {program.market}</option>)}
          </select>
        </label>
        <label>
          <span>Phase</span>
          <select name="phase" value={phase} onChange={(event) => setPhase(event.target.value)}>
            {selectedProgram.phases.map((phaseOption) => <option value={phaseOption} key={phaseOption}>{phaseOption}</option>)}
          </select>
        </label>
      </div>
      <div className="form-grid">
        <label>
          <span>Account size</span>
          <select name="size" value={size} onChange={(event) => setSize(event.target.value)}>
            {selectedProgram.accountSizes.map((option) => (
              <option value={option.valueMinor} key={option.valueMinor}>
                {option.label}{option.price ? ` · ${option.price}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label><span>Platform</span><select name="platform" defaultValue="mt5"><option value="mt5">MetaTrader 5</option></select></label>
      </div>
      <label className="check-row"><input type="checkbox" required /><span><strong>I confirm this is the correct program and phase.</strong><small>FundedFence assigns the matching versioned rule profile. Only an independently approved version can become effective.</small></span></label>
      <div className="form-actions"><Link className="button button-secondary" href="/dashboard">Back to preview</Link><button className="button button-primary" type="submit">Continue to connector <span>→</span></button></div>
    </form>
  );
}

function defaultSize(program: FirmOption["programs"][number]): string {
  return program.accountSizes.find((option) => option.valueMinor === "10000000")?.valueMinor ?? program.accountSizes[0]?.valueMinor ?? "";
}
