export const STAGE4_LIMITS = Object.freeze({
  maxTotalCases: 2048,
  maxArrayItems: 32,
  maxObjectMembers: 32,
  maxKeyLength: 64,
  maxPayloadBytes: 4096
});

export function validateStage4RowLimits(line) {
  const columns = line.split('\t');
  if (columns.length !== 3) {
    throw new TypeError(`Stage 4 row must contain exactly 3 TSV columns: ${line}`);
  }

  const [, kind, payload] = columns;
  const payloadBytes = Buffer.byteLength(payload, 'utf8');
  if (payloadBytes > STAGE4_LIMITS.maxPayloadBytes) {
    throw new RangeError(
      `Stage 4 MAX_PAYLOAD_BYTES exceeded: ${payloadBytes} > ${STAGE4_LIMITS.maxPayloadBytes}`
    );
  }

  if (kind === 'scalar_array') {
    const items = payload === '' ? 0 : payload.split(',').length;
    if (items > STAGE4_LIMITS.maxArrayItems) {
      throw new RangeError(
        `Stage 4 MAX_ARRAY_ITEMS exceeded: ${items} > ${STAGE4_LIMITS.maxArrayItems}`
      );
    }
  }

  if (kind === 'ascii_key_object') {
    const members = payload === '' ? [] : payload.split(';');
    if (members.length > STAGE4_LIMITS.maxObjectMembers) {
      throw new RangeError(
        `Stage 4 MAX_OBJECT_MEMBERS exceeded: ${members.length} > ${STAGE4_LIMITS.maxObjectMembers}`
      );
    }

    for (const member of members) {
      const separator = member.indexOf('=');
      const key = separator === -1 ? member : member.slice(0, separator);
      const keyBytes = Buffer.byteLength(key, 'utf8');
      if (keyBytes > STAGE4_LIMITS.maxKeyLength) {
        throw new RangeError(
          `Stage 4 MAX_KEY_LENGTH exceeded: ${keyBytes} > ${STAGE4_LIMITS.maxKeyLength}`
        );
      }
    }
  }
}

export function validateStage4FixtureLimits(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.shift() !== 'case_id\tkind\tpayload') {
    throw new TypeError('Stage 4 fixture header is invalid');
  }
  if (lines.length > STAGE4_LIMITS.maxTotalCases) {
    throw new RangeError(
      `Stage 4 MAX_TOTAL_CASES exceeded: ${lines.length} > ${STAGE4_LIMITS.maxTotalCases}`
    );
  }
}
