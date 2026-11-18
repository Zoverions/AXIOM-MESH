import { ValidationError } from './canonical.mjs';

/**
 * Keyset pages for Grid collections (scalability audit S-10).
 *
 * Every paged collection is ordered by a sort column and then its identifier,
 * so the order is total and stable. A cursor names the collection and the
 * (sort value, identifier) of the last item returned. The next page starts
 * strictly after it, so under concurrent writes no item is returned twice;
 * an item written behind the cursor appears on the next pass. Cursors are
 * opaque to clients and accepted only in their canonical encoding, and a
 * cursor from one collection is refused by every other.
 */

export const COLLECTION_PAGE_MAX = 100;

const COLLECTION = /^[a-z][a-z0-9_]{0,31}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SORT_VALUE = /^[0-9A-Za-z:._+-]{1,64}$/;
const CURSOR_TEXT = /^[A-Za-z0-9_-]{1,512}$/;

export function encodeCollectionCursor(collection, sortValue, id) {
  return Buffer.from(JSON.stringify([collection, sortValue, id])).toString('base64url');
}

export function decodeCollectionCursor(collection, cursor) {
  if (cursor === undefined || cursor === null) return null;
  let decoded;
  try {
    if (typeof cursor !== 'string' || !CURSOR_TEXT.test(cursor)) throw new Error('shape');
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new ValidationError(`${collection} cursor is invalid`);
  }
  if (
    !COLLECTION.test(collection)
    || !Array.isArray(decoded)
    || decoded.length !== 3
    || decoded[0] !== collection
    || typeof decoded[1] !== 'string'
    || !SORT_VALUE.test(decoded[1])
    || typeof decoded[2] !== 'string'
    || !IDENTIFIER.test(decoded[2])
    || encodeCollectionCursor(...decoded) !== cursor
  ) {
    throw new ValidationError(`${collection} cursor is invalid`);
  }
  return { sort: decoded[1], id: decoded[2] };
}

/** SQL that starts a (sortColumn, idColumn) ordered scan strictly after `after`. */
export function keysetClause(after, { sortColumn, idColumn, descending = true }) {
  if (!after) return { sql: '', params: [] };
  return {
    sql: `(${sortColumn}, ${idColumn}) ${descending ? '<' : '>'} (?, ?)`,
    params: [after.sort, after.id]
  };
}

/**
 * Cuts `items` (fetched with limit + 1) to one page and describes the next.
 * `key` returns an item's [sort value, identifier].
 */
export function collectionPage(items, { collection, limit, key }) {
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  const last = page.at(-1);
  return {
    items: page,
    page: {
      limit,
      has_more: hasMore,
      next_cursor: hasMore && last ? encodeCollectionCursor(collection, ...key(last)) : null
    }
  };
}
