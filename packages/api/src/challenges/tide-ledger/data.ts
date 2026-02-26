import { mulberry32 } from "../../services/whimsy.js";

/**
 * Tide Ledger: 3-phase transaction management.
 * Phase 1: 50 initial transactions
 * Phase 2: 30 amendments to Phase 1 transactions
 * Phase 3: 20 rollbacks + 10 new transactions
 *
 * The agent must maintain correct running balances across all phases.
 */

export interface Transaction {
  id: string;
  type: "credit" | "debit";
  account: string;
  amount: number;
  reference: string;
  timestamp: string;
}

export interface Amendment {
  transactionId: string;
  field: "amount" | "account" | "type";
  oldValue: string | number;
  newValue: string | number;
  reason: string;
}

export interface Rollback {
  transactionId: string;
  reason: string;
}

export interface LedgerGroundTruth {
  // After Phase 1
  phase1_balances: Record<string, number>;
  phase1_total_credits: number;
  phase1_total_debits: number;
  // After Phase 2 (amendments applied)
  phase2_balances: Record<string, number>;
  phase2_amended_count: number;
  // After Phase 3 (rollbacks + new)
  phase3_balances: Record<string, number>;
  phase3_rolled_back_count: number;
  phase3_final_total: number;
}

export interface LedgerData {
  phase1_transactions: Transaction[];
  phase2_amendments: Amendment[];
  phase3_rollbacks: Rollback[];
  phase3_new_transactions: Transaction[];
  groundTruth: LedgerGroundTruth;
  objective: string;
}

const ACCOUNTS = [
  "ACC-REEF-001", "ACC-REEF-002", "ACC-DEEP-001", "ACC-DEEP-002",
  "ACC-TIDE-001", "ACC-TIDE-002", "ACC-CLAW-001", "ACC-CLAW-002",
];

const REFERENCES = [
  "Monthly dues", "Equipment purchase", "Salary payment", "Service fee",
  "Refund", "Transfer", "Interest", "Penalty", "Commission", "Grant",
];

export function generateLedgerData(seed: number): LedgerData {
  const rng = mulberry32(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const randInt = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
  const randAmount = () => Math.round((rng() * 990 + 10) * 100) / 100; // 10-1000

  const baseDate = new Date("2026-02-01");

  // === Phase 1: Initial transactions ===
  const phase1: Transaction[] = [];
  for (let i = 0; i < 50; i++) {
    const d = new Date(baseDate);
    d.setHours(d.getHours() + i);
    phase1.push({
      id: `TXN-${String(i + 1).padStart(4, "0")}`,
      type: rng() > 0.5 ? "credit" : "debit",
      account: pick(ACCOUNTS),
      amount: randAmount(),
      reference: pick(REFERENCES),
      timestamp: d.toISOString(),
    });
  }

  // Compute Phase 1 balances
  const phase1Balances: Record<string, number> = {};
  let phase1Credits = 0;
  let phase1Debits = 0;
  for (const txn of phase1) {
    if (!phase1Balances[txn.account]) phase1Balances[txn.account] = 0;
    if (txn.type === "credit") {
      phase1Balances[txn.account] = Math.round((phase1Balances[txn.account] + txn.amount) * 100) / 100;
      phase1Credits = Math.round((phase1Credits + txn.amount) * 100) / 100;
    } else {
      phase1Balances[txn.account] = Math.round((phase1Balances[txn.account] - txn.amount) * 100) / 100;
      phase1Debits = Math.round((phase1Debits + txn.amount) * 100) / 100;
    }
  }

  // === Phase 2: Amendments ===
  // Amend 30 existing transactions (some change amounts, some change accounts, some flip type)
  const amendableIndices = Array.from({ length: 50 }, (_, i) => i);
  // Shuffle
  for (let i = amendableIndices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [amendableIndices[i], amendableIndices[j]] = [amendableIndices[j], amendableIndices[i]];
  }

  const amendments: Amendment[] = [];
  const txnsCopy = phase1.map((t) => ({ ...t })); // working copy

  for (let i = 0; i < 30; i++) {
    const idx = amendableIndices[i];
    const txn = txnsCopy[idx];
    const fieldChoice = rng();

    if (fieldChoice < 0.5) {
      // Amend amount
      const newAmount = randAmount();
      amendments.push({
        transactionId: txn.id,
        field: "amount",
        oldValue: txn.amount,
        newValue: newAmount,
        reason: pick(["Correction", "Recalculation", "Audit adjustment", "Rate update"]),
      });
      txn.amount = newAmount;
    } else if (fieldChoice < 0.8) {
      // Amend account
      const newAccount = pick(ACCOUNTS.filter((a) => a !== txn.account));
      amendments.push({
        transactionId: txn.id,
        field: "account",
        oldValue: txn.account,
        newValue: newAccount,
        reason: pick(["Misrouted", "Account reassignment", "Department change"]),
      });
      txn.account = newAccount;
    } else {
      // Flip type
      const newType = txn.type === "credit" ? "debit" : "credit";
      amendments.push({
        transactionId: txn.id,
        field: "type",
        oldValue: txn.type,
        newValue: newType,
        reason: pick(["Direction error", "Reversal", "Booking correction"]),
      });
      txn.type = newType as "credit" | "debit";
    }
  }

  // Recompute Phase 2 balances from amended transactions
  const phase2Balances: Record<string, number> = {};
  for (const txn of txnsCopy) {
    if (!phase2Balances[txn.account]) phase2Balances[txn.account] = 0;
    if (txn.type === "credit") {
      phase2Balances[txn.account] = Math.round((phase2Balances[txn.account] + txn.amount) * 100) / 100;
    } else {
      phase2Balances[txn.account] = Math.round((phase2Balances[txn.account] - txn.amount) * 100) / 100;
    }
  }

  // === Phase 3: Rollbacks + new transactions ===
  // Roll back 20 transactions (remove them from the ledger)
  const rollbackIndices = amendableIndices.slice(30, 50); // use remaining shuffled indices
  const rollbacks: Rollback[] = rollbackIndices.map((idx) => ({
    transactionId: txnsCopy[idx].id,
    reason: pick(["Fraud detected", "Duplicate", "Customer request", "System error", "Compliance"]),
  }));

  const rolledBackIds = new Set(rollbacks.map((r) => r.transactionId));
  const afterRollback = txnsCopy.filter((t) => !rolledBackIds.has(t.id));

  // Add 10 new transactions
  const newTxns: Transaction[] = [];
  for (let i = 0; i < 10; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + 3);
    d.setHours(d.getHours() + i);
    newTxns.push({
      id: `TXN-${String(51 + i).padStart(4, "0")}`,
      type: rng() > 0.5 ? "credit" : "debit",
      account: pick(ACCOUNTS),
      amount: randAmount(),
      reference: pick(REFERENCES),
      timestamp: d.toISOString(),
    });
  }

  // Compute Phase 3 balances
  const phase3Balances: Record<string, number> = {};
  const allPhase3 = [...afterRollback, ...newTxns];
  let phase3Total = 0;
  for (const txn of allPhase3) {
    if (!phase3Balances[txn.account]) phase3Balances[txn.account] = 0;
    if (txn.type === "credit") {
      phase3Balances[txn.account] = Math.round((phase3Balances[txn.account] + txn.amount) * 100) / 100;
      phase3Total = Math.round((phase3Total + txn.amount) * 100) / 100;
    } else {
      phase3Balances[txn.account] = Math.round((phase3Balances[txn.account] - txn.amount) * 100) / 100;
      phase3Total = Math.round((phase3Total - txn.amount) * 100) / 100;
    }
  }

  const objective = `Manage a financial ledger across three phases. Phase 1: Process 50 transactions and compute running balances per account. Phase 2: Apply 30 amendments (amount changes, account reassignments, type flips) and recompute. Phase 3: Process 20 rollbacks and 10 new transactions, then compute final balances. Submit a checkpoint after each phase with current balances. Final submission: all account balances and the net total.`;

  return {
    phase1_transactions: phase1,
    phase2_amendments: amendments,
    phase3_rollbacks: rollbacks,
    phase3_new_transactions: newTxns,
    groundTruth: {
      phase1_balances: phase1Balances,
      phase1_total_credits: phase1Credits,
      phase1_total_debits: phase1Debits,
      phase2_balances: phase2Balances,
      phase2_amended_count: 30,
      phase3_balances: phase3Balances,
      phase3_rolled_back_count: 20,
      phase3_final_total: phase3Total,
    },
    objective,
  };
}
