const PUBLISHED_SECTORS = Object.freeze({
  one: 79,
  sqrt2: 48,
  sqrt3: 42,
  sqrt6: 3,
});

const SECTOR_NAMES = Object.freeze(Object.keys(PUBLISHED_SECTORS));
const PUBLISHED_WEIGHTS = Object.freeze({
  one: 1,
  sqrt2: Math.sqrt(2),
  sqrt3: Math.sqrt(3),
  sqrt6: Math.sqrt(6),
});
const PUBLISHED_INVERSE_ALPHA = 137.03599918956615;

function requireDimension(value, name) {
  if (!Number.isSafeInteger(value) || value < 2) {
    throw new TypeError(`${name} must be a safe integer greater than or equal to 2`);
  }
  return value;
}

function requireNonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function requirePositiveFinite(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number`);
  }
  return value;
}

function requireSector(value, name) {
  if (!SECTOR_NAMES.includes(value)) {
    throw new TypeError(`${name} must be one of ${SECTOR_NAMES.join(', ')}`);
  }
  return value;
}

function requireSectorWeights(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('sectorWeights must define exactly one finite non-negative weight per sector');
  }
  const keys = Object.keys(value).sort();
  const expectedKeys = [...SECTOR_NAMES].sort();
  if (
    keys.length !== expectedKeys.length
    || keys.some((key, index) => key !== expectedKeys[index])
    || SECTOR_NAMES.some((sector) => !Number.isFinite(value[sector]) || value[sector] < 0)
    || SECTOR_NAMES.every((sector) => value[sector] === 0)
  ) {
    throw new TypeError('sectorWeights must define exactly one finite non-negative weight per sector');
  }
  return Object.freeze(Object.fromEntries(
    SECTOR_NAMES.map((sector) => [sector, value[sector]]),
  ));
}

function addSameEndRecords(records, letterCount, offDiagonalSector) {
  for (let first = 0; first < letterCount; first += 1) {
    for (let second = first; second < letterCount; second += 1) {
      records.push({ kind: 'product', sector: 'sqrt3' });
      if (first !== second) {
        records.push({ kind: 'product', sector: offDiagonalSector });
      }
    }
  }
}

function addCrossEndRecords(records, qutritLetters, qubitLetters, orbitCount) {
  for (let qutrit = 0; qutrit < qutritLetters; qutrit += 1) {
    for (let qubit = 0; qubit < qubitLetters; qubit += 1) {
      for (let orbit = 0; orbit < orbitCount; orbit += 1) {
        records.push({ kind: 'product', sector: 'sqrt2' });
        records.push({ kind: 'product', sector: 'one' });
      }
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
  sameEndOffDiagonalSector = 'one',
  crossEndOrbitCount = 2,
  includeQubitCommutators = true,
  sectorWeights = PUBLISHED_WEIGHTS,
  normalizationMultiplier = 1,
} = {}) {
  const qutrit = requireDimension(qutritDimension, 'qutritDimension');
  const qubit = requireDimension(qubitDimension, 'qubitDimension');
  const offDiagonalSector = requireSector(
    sameEndOffDiagonalSector,
    'sameEndOffDiagonalSector',
  );
  const orbitCount = requireNonNegativeInteger(crossEndOrbitCount, 'crossEndOrbitCount');
  if (typeof includeQubitCommutators !== 'boolean') {
    throw new TypeError('includeQubitCommutators must be boolean');
  }
  const weights = requireSectorWeights(sectorWeights);
  const readoutScale = requirePositiveFinite(
    normalizationMultiplier,
    'normalizationMultiplier',
  );
  const qutritLetters = (qutrit ** 2) - 1;
  const qubitLetters = (qubit ** 2) - 1;
  const records = [];

  addSameEndRecords(records, qutritLetters, offDiagonalSector);
  addSameEndRecords(records, qubitLetters, offDiagonalSector);
  addCrossEndRecords(records, qutritLetters, qubitLetters, orbitCount);
  if (includeQubitCommutators) {
    addQubitCommutators(records, qubitLetters);
  }

  const sectorCounts = { one: 0, sqrt2: 0, sqrt3: 0, sqrt6: 0 };
  for (const record of records) {
    sectorCounts[record.sector] += 1;
  }

  const productRecords = records.filter(({ kind }) => kind === 'product').length;
  const commutatorRecords = records.length - productRecords;
  const normalization = qutritLetters
    * qubitLetters
    * ((qutrit * qubit) ** 2)
    * ((qutrit * qubit) ** 2)
    * readoutScale;
  const weightedReadout = SECTOR_NAMES.reduce(
    (sum, sector) => sum + (sectorCounts[sector] * weights[sector]),
    0,
  );
  const alpha = weightedReadout / normalization;
  const inverseAlpha = 1 / alpha;
  const slotLetters = [qutritLetters, qubitLetters, qutritLetters, qubitLetters];
  const matchesPublishedCensus = qutrit === 3
    && qubit === 2
    && productRecords === 169
    && commutatorRecords === 3
    && normalization === 31_104
    && Object.entries(PUBLISHED_SECTORS)
      .every(([sector, count]) => sectorCounts[sector] === count);
  const matchesPublishedReadout = matchesPublishedCensus
    && Math.abs(inverseAlpha - PUBLISHED_INVERSE_ALPHA) < 1e-12;

  return Object.freeze({
    slotLetters: Object.freeze(slotLetters),
    sectorCounts: Object.freeze(sectorCounts),
    productRecords,
    commutatorRecords,
    totalRecords: records.length,
    normalization,
    sectorWeights: weights,
    alpha,
    inverseAlpha,
    matchesPublishedCensus,
    matchesPublishedReadout,
  });
}
