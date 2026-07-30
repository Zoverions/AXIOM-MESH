#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  EDUCATION_CONTRACT_PATH,
  EDUCATION_CONTRACT_SHA256,
  loadEducationContract,
  validateEducationPolicy
} from './domain/education-contract.mjs';

const POLICY_PATH = fileURLToPath(new URL('../config/policy.json', import.meta.url));

export async function checkEducationContract({
  contractPath = EDUCATION_CONTRACT_PATH,
  policyPath = POLICY_PATH
} = {}) {
  const [contract, policyRaw] = await Promise.all([
    loadEducationContract(contractPath),
    readFile(policyPath, 'utf8')
  ]);
  let policy;
  try {
    policy = JSON.parse(policyRaw);
  } catch (error) {
    throw new Error(`Education contract invalid: malformed policy JSON (${error.message})`);
  }
  validateEducationPolicy(contract, policy);
  return {
    valid: true,
    contract_id: contract.contract_id,
    contract_version: contract.contract_version,
    contract_sha256: EDUCATION_CONTRACT_SHA256,
    action_count: Object.keys(contract.actions).length,
    runtime_state: 'capability_unavailable'
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkEducationContract()
    .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
