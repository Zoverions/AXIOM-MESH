// labs/praxis/parser.mjs
//
// Praxis parser (recursive descent) and parse entry point.
//
// Split from the former index.mjs monolith without behavior change;
// this module owns the section(s) listed above.

import { PraxisSyntaxError } from './errors.mjs';
import { lex } from './lexer.mjs';

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  current() {
    return this.tokens[this.index];
  }

  take(type, value) {
    const token = this.current();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      const expected = value === undefined ? type : JSON.stringify(value);
      throw new PraxisSyntaxError(`expected ${expected}, received ${JSON.stringify(token.value)}`, token);
    }
    this.index += 1;
    return token;
  }

  word(value) {
    return this.take('word', value);
  }

  identifier() {
    return this.take('word').value;
  }

  literalOrReference() {
    const token = this.current();
    if (token.type === 'string' || token.type === 'number') {
      this.index += 1;
      return { kind: 'literal', value: token.value };
    }
    if (token.type === 'word' && (token.value === 'true' || token.value === 'false')) {
      this.index += 1;
      return { kind: 'literal', value: token.value === 'true' };
    }
    if (token.type === 'word') {
      this.index += 1;
      return { kind: 'reference', name: token.value };
    }
    throw new PraxisSyntaxError('expected literal or reference', token);
  }

  statement() {
    const token = this.current();
    if (token.type !== 'word') throw new PraxisSyntaxError('expected statement', token);

    switch (token.value) {
      case 'requires':
        return this.requiresResource();
      case 'observe':
        return this.observe();
      case 'verify':
        return this.verify();
      case 'assess':
        return this.assess();
      case 'op':
        return this.operation();
      case 'authorize':
        return this.authorize();
      case 'prepare':
        return this.prepare();
      case 'cancel':
        return this.cancel();
      case 'commit':
        return this.commit();
      case 'finalize':
        return this.finalize();
      default:
        throw new PraxisSyntaxError(`unknown statement ${JSON.stringify(token.value)}`, token);
    }
  }

  requiresResource() {
    this.word('requires');
    const resourceType = this.identifier();
    const name = this.identifier();
    this.take(':');

    if (resourceType === 'secret') {
      const secretKind = this.identifier();
      this.take(';');
      return {
        kind: 'RequireSecret',
        name,
        secretKind
      };
    }

    if (resourceType === 'prepared') {
      const action = this.identifier();
      this.take('@');
      const scope = this.identifier();
      this.take(';');
      return {
        kind: 'RequirePrepared',
        name,
        action,
        scope
      };
    }

    if (resourceType === 'quorum') {
      const action = this.identifier();
      this.take('@');
      const scope = this.identifier();
      this.word('threshold');
      const threshold = this.take('number').value;
      this.word('of');
      const members = [this.identifier()];
      while (this.current().type === ',') {
        this.take(',');
        members.push(this.identifier());
      }
      this.take(';');
      return {
        kind: 'RequireQuorum',
        name,
        action,
        scope,
        threshold,
        members
      };
    }

    if (resourceType !== 'permit' && resourceType !== 'lease') {
      throw new PraxisSyntaxError(
        'requires must declare permit, lease, quorum, secret, or prepared',
        this.tokens[this.index - 2]
      );
    }

    const action = this.identifier();
    this.take('@');
    const scope = this.identifier();
    this.take(';');
    return {
      kind: resourceType === 'permit' ? 'RequirePermit' : 'RequireLease',
      name,
      action,
      scope
    };
  }

  observe() {
    this.word('observe');
    const name = this.identifier();
    this.take('=');
    const value = this.literalOrReference();
    this.word('from');
    const provenance = this.take('string').value;
    this.take(';');
    return { kind: 'Observe', name, value, provenance };
  }

  verify() {
    this.word('verify');
    const name = this.identifier();
    this.take('=');
    const input = this.identifier();
    this.word('with');
    const policy = this.identifier();
    this.take(';');
    return { kind: 'Verify', name, input, policy };
  }

  assess() {
    this.word('assess');
    const name = this.identifier();
    this.take('=');
    const input = this.identifier();
    this.word('with');
    const policy = this.identifier();
    this.take(';');
    return { kind: 'Assess', name, input, policy };
  }

  operation() {
    this.word('op');
    const name = this.identifier();
    this.take('=');
    const action = this.identifier();
    this.take('(');
    const args = [];
    if (this.current().type !== ')') {
      args.push(this.literalOrReference());
      while (this.current().type === ',') {
        this.take(',');
        args.push(this.literalOrReference());
      }
    }
    this.take(')');
    this.take('@');
    const scope = this.identifier();
    const secrets = [];
    let declaredEffect = null;
    let declaredIrreversible = false;
    let declaredEgress = null;
    let sawIrreversible = false;
    let sawEgress = false;
    let sawSecrets = false;

    while (this.current().type === 'word') {
      if (this.current().value === 'effect') {
        if (declaredEffect !== null) {
          throw new PraxisSyntaxError('operation effect may be declared only once', this.current());
        }
        this.word('effect');
        declaredEffect = this.identifier();
        continue;
      }
      if (this.current().value === 'irreversible') {
        if (sawIrreversible) {
          throw new PraxisSyntaxError('operation irreversible may be declared only once', this.current());
        }
        this.word('irreversible');
        declaredIrreversible = true;
        sawIrreversible = true;
        continue;
      }
      if (this.current().value === 'egress') {
        if (sawEgress) {
          throw new PraxisSyntaxError('operation egress may be declared only once', this.current());
        }
        this.word('egress');
        declaredEgress = this.take('string').value;
        sawEgress = true;
        continue;
      }
      if (this.current().value === 'using') {
        if (sawSecrets) {
          throw new PraxisSyntaxError('operation secrets may be declared only once', this.current());
        }
        this.word('using');
        this.word('secrets');
        secrets.push(this.identifier());
        while (this.current().type === ',') {
          this.take(',');
          secrets.push(this.identifier());
        }
        sawSecrets = true;
        continue;
      }
      break;
    }

    if ((declaredIrreversible || declaredEgress !== null) && declaredEffect === null) {
      throw new PraxisSyntaxError(
        'operation irreversible/egress metadata requires an effect declaration',
        this.current()
      );
    }

    this.take(';');
    return {
      kind: 'Operation',
      name,
      action,
      scope,
      args,
      secrets,
      declaredEffect,
      declaredIrreversible,
      declaredEgress
    };
  }

  authorize() {
    this.word('authorize');
    const operation = this.identifier();
    this.word('using');
    const permit = this.identifier();
    this.word('as');
    const name = this.identifier();
    this.take(';');
    return { kind: 'Authorize', name, operation, permit };
  }

  prepare() {
    this.word('prepare');
    const operation = this.identifier();
    this.word('as');
    const name = this.identifier();
    this.take(';');
    return { kind: 'Prepare', name, operation };
  }

  cancel() {
    this.word('cancel');
    const operation = this.identifier();
    this.word('as');
    const name = this.identifier();
    this.take(';');
    return { kind: 'Cancel', name, operation };
  }

  commit() {
    this.word('commit');
    const operation = this.identifier();
    this.word('as');
    const name = this.identifier();
    this.take(';');
    return { kind: 'Commit', name, operation };
  }

  finalize() {
    this.word('finalize');
    const operation = this.identifier();
    this.word('as');
    const name = this.identifier();
    this.take(';');
    return { kind: 'Finalize', name, operation };
  }

  program() {
    const body = [];
    while (this.current().type !== 'eof') body.push(this.statement());
    return { kind: 'Program', body };
  }
}

export function parse(source) {
  return new Parser(lex(source)).program();
}
