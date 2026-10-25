const PUBLISHED_SECTORS = Object.freeze({
  one: 79,
  sqrt2: 48,
  sqrt3: 42,
  sqrt6: 3,
});

function requireDimension(value, name) {
  if (!Number.isSafeInteger(value) || value < 2) {
    throw new TypeError(`${name} must be a safe integer greater than or equal to 2`);
  }
  return value;
}

function addSameEndRecords(records, letterCount) {
  for (let first = 0; first < letterCount; first += 1) {
    for (let second = first; second < letterCount; second += 1) {
      records.push({ kind: 'product', sector: 'sqrt3' });
      if (first !== second) {
        records.push({ kind: 'product', sector: 'one' });
      }
    }
  }
}

function addCrossEndRecords(records, qutritLetters, qubitLetters) {
  for (let qutrit = 0; qutrit < qutritLetters; qutrit += 1) {
    for (let qubit = 0; qubit < qubitLetters; qubit += 1) {
      // The four qutrit/qubit slot edges form two exchange orbits. Each
      // orbit contributes one symmetric and one antisymmetric combination.
      records.push({ kind: 'product', sector: 'sqrt2' });
      records.push({ kind: 'product', sector: 'one' });
      records.push({ kind: 'product', sector: 'sqrt2' });
      records.push({ kind: 'product', sector: 'one' });
    }
  }
}

function addQubitCommutators(records, qubitLetters) {
  for (let first = 0; first < qubitLetters; first += 1) {
    for (let second = first + 1; second < qubitLetters; second += 1) {
      records.push({ kind: 'commutator', sector: 'sqrt6' });
    }
  }
}

export function reproduceAlphaCensus({
  qutritDimension = 3,
  qubitDimension = 2,
} = {}) {
  const qutrit = requireDimension(qutritDimension, 'qutritDimension');
  const qubit = requireDimension(qubitDimension, 'qubitDimension');
  const qutritLetters = (qutrit ** 2) - 1;
  const qubitLetters = (qubit ** 2) - 1;
  const records = [];

  addSameEndRecords(records, qutritLetters);
  addSameEndRecords(records, qubitLetters);
  addCrossEndRecords(records, qutritLetters, qubitLetters);
  addQubitCommutators(records, qubitLetters);

  const sectorCounts = { one: 0, sqrt2: 0, sqrt3: 0, sqrt6: 0 };
  for (const record of records) {
    sectorCounts[record.sector] += 1;
  }

  const productRecords = records.filter(({ kind }) => kind === 'product').length;
  const commutatorRecords = records.length - productRecords;
  const normalization = qutritLetters
    * qubitLetters
    * ((qutrit * qubit) ** 2)
    * ((qutrit * qubit) ** 2);
  const alpha = (
    sectorCounts.one
    + (sectorCounts.sqrt2 * Math.sqrt(2))
    + (sectorCounts.sqrt3 * Math.sqrt(3))
    + (sectorCounts.sqrt6 * Math.sqrt(6))
  ) / normalization;
  const slotLetters = [qutritLetters, qubitLetters, qutritLetters, qubitLetters];
  const matchesPublishedCensus = qutrit === 3
    && qubit === 2
    && productRecords === 169
    && commutatorRecords === 3
    && normalization === 31_104
    && Object.entries(PUBLISHED_SECTORS)
      .every(([sector, count]) => sectorCounts[sector] === count);

  return Object.freeze({
    slotLetters: Object.freeze(slotLetters),
    sectorCounts: Object.freeze(sectorCounts),
    productRecords,
    commutatorRecords,
    totalRecords: records.length,
    normalization,
    alpha,
    inverseAlpha: 1 / alpha,
    matchesPublishedCensus,
  });
}
