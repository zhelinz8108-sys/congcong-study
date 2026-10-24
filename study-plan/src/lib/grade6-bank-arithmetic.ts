/** Exact arithmetic for complete, trusted calculation expressions. No answer
 * extraction, variable solving, unit inference or JavaScript evaluation. */
export type BankArithmeticValue = { numerator: bigint; denominator: bigint };

const MAX_SOURCE_LENGTH = 4096;
const MAX_TOKENS = 512;
const MAX_DEPTH = 64;
const MAX_LITERAL_DIGITS = 128;
const MAX_VALUE_BITS = 4096;

type TokenKind = "number" | "fraction" | "mixed" | "+" | "-" | "*" | "/" | "%" | "(" | ")" | "[" | "]" | "{" | "}";
type Token = { kind: TokenKind; text: string; start: number; end: number };
class InvalidArithmetic extends Error {}
const invalid = (): never => { throw new InvalidArithmetic(); };
const abs = (value: bigint) => value < BigInt(0) ? -value : value;

function rational(numerator: bigint, denominator = BigInt(1)): BankArithmeticValue {
  if (!denominator) return invalid();
  if (!numerator) return { numerator: BigInt(0), denominator: BigInt(1) };
  if (denominator < BigInt(0)) { numerator = -numerator; denominator = -denominator; }
  let a = abs(numerator), b = denominator;
  while (b) { const remainder = a % b; a = b; b = remainder; }
  numerator /= a; denominator /= a;
  if (abs(numerator).toString(2).length > MAX_VALUE_BITS || denominator.toString(2).length > MAX_VALUE_BITS) return invalid();
  return { numerator, denominator };
}

function operate(left: BankArithmeticValue, right: BankArithmeticValue, operation: "+" | "-" | "*" | "/"): BankArithmeticValue {
  // Both inputs are bounded and reduced. Intermediate products have at most
  // twice MAX_VALUE_BITS bits; every result is reduced and bounded again.
  if (operation === "+" || operation === "-") {
    const rightTerm = right.numerator * left.denominator;
    return rational(left.numerator * right.denominator + (operation === "+" ? rightTerm : -rightTerm), left.denominator * right.denominator);
  }
  if (operation === "*") return rational(left.numerator * right.numerator, left.denominator * right.denominator);
  return rational(left.numerator * right.denominator, left.denominator * right.numerator);
}

function numberValue(text: string): BankArithmeticValue {
  if (text.replace(".", "").length > MAX_LITERAL_DIGITS) return invalid();
  const [whole, decimals = ""] = text.split(".");
  return rational(BigInt((whole || "0") + decimals), BigInt(10) ** BigInt(decimals.length));
}

function tokenize(raw: string): Token[] {
  // Map full-width ASCII only. NFKC would incorrectly turn a superscript such
  // as ² into an ordinary digit and silently change the expression's meaning.
  const source = raw.replace(/[！-～]/g, character => String.fromCharCode(character.charCodeAt(0) - 0xfee0))
    .replace(/[−–]/g, "-").replace(/[×]/g, "*").replace(/[÷⁄∕]/g, "/");
  const tokens: Token[] = [];
  let cursor = 0;
  const push = (kind: TokenKind, text: string, start: number) => {
    tokens.push({ kind, text, start, end: cursor });
    if (tokens.length > MAX_TOKENS) invalid();
  };
  while (cursor < source.length) {
    if (/\s/.test(source[cursor])) { cursor++; continue; }
    const start = cursor;
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(source.slice(cursor));
    if (number) { cursor += number[0].length; push("number", number[0], start); continue; }
    const character = source[cursor];
    if (character === "\\") {
      cursor++;
      if (source[cursor] === "%") { cursor++; push("%", "%", start); continue; }
      const command = /^[A-Za-z]+/.exec(source.slice(cursor));
      if (!command) return invalid();
      cursor += command[0].length;
      if (["frac", "dfrac", "tfrac"].includes(command[0])) push("fraction", command[0], start);
      else if (command[0] === "times") push("*", "*", start);
      else if (command[0] === "div") push("/", "/", start);
      else if (command[0] === "left" || command[0] === "right") {
        const next = source.slice(cursor).trimStart()[0];
        if (!(command[0] === "left" ? ["(", "[", "{"] : [")", "]", "}"]).includes(next)) return invalid();
      } else return invalid();
      continue;
    }
    cursor++;
    if (character === "又" || character === "带") push("mixed", character, start);
    else if (["+", "-", "*", "/", "%", "(", ")", "[", "]", "{", "}"].includes(character)) push(character as TokenKind, character, start);
    else return invalid();
  }
  if (!tokens.length) return invalid();
  return tokens;
}

class ArithmeticParser {
  private cursor = 0;
  constructor(private tokens: Token[]) {}

  parse(): BankArithmeticValue {
    const result = this.sum(0);
    if (this.cursor !== this.tokens.length) return invalid();
    return result;
  }

  private peek(offset = 0) { return this.tokens[this.cursor + offset]; }
  private accept(kind: TokenKind) {
    if (this.peek()?.kind !== kind) return false;
    this.cursor++; return true;
  }
  private require(kind: TokenKind) { if (!this.accept(kind)) invalid(); }
  private depth(value: number) { if (value > MAX_DEPTH) invalid(); }

  private sum(depth: number): BankArithmeticValue {
    this.depth(depth);
    let value = this.product(depth);
    while (this.peek()?.kind === "+" || this.peek()?.kind === "-") {
      const operation = this.tokens[this.cursor++].kind as "+" | "-";
      value = operate(value, this.product(depth), operation);
    }
    return value;
  }

  private product(depth: number): BankArithmeticValue {
    let value = this.unary(depth);
    while (this.peek()?.kind === "*" || this.peek()?.kind === "/") {
      const operation = this.tokens[this.cursor++].kind as "*" | "/";
      value = operate(value, this.unary(depth), operation);
    }
    return value;
  }

  private unary(depth: number): BankArithmeticValue {
    this.depth(depth);
    if (this.accept("+")) return this.unary(depth + 1);
    if (this.accept("-")) {
      const value = this.unary(depth + 1);
      return rational(-value.numerator, value.denominator);
    }
    return this.primary(depth);
  }

  private group(open: "(" | "[" | "{", depth: number) {
    this.require(open);
    const value = this.sum(depth + 1);
    this.require(open === "(" ? ")" : open === "[" ? "]" : "}");
    return value;
  }

  private fraction(depth: number): BankArithmeticValue {
    this.require("fraction");
    const top = this.fractionArgument(depth + 1), bottom = this.fractionArgument(depth + 1);
    return operate(top, bottom, "/");
  }

  private fractionArgument(depth: number): BankArithmeticValue {
    this.depth(depth);
    if (this.peek()?.kind === "{") return this.group("{", depth);
    // TeX's unbraced macro argument is one token: \frac49 is 4/9, not
    // 49 followed by a missing denominator. Only a single digit is a complete
    // numeric token here; signs and decimal points require explicit braces.
    const token = this.peek();
    if (token?.kind !== "number" || !/^\d/.test(token.text)) return invalid();
    const digit = token.text[0], remainder = token.text.slice(1);
    if (remainder) {
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(remainder)) return invalid();
      this.tokens[this.cursor] = { ...token, text: remainder, start: token.start + 1 };
    } else this.cursor++;
    return rational(BigInt(digit));
  }

  private properMixedPart(value: BankArithmeticValue) {
    if (value.numerator < BigInt(0) || value.numerator >= value.denominator) return invalid();
    return value;
  }

  private plainMixedFraction(): BankArithmeticValue {
    const top = this.peek(), divider = this.peek(1), bottom = this.peek(2);
    if (top?.kind !== "number" || !/^\d+$/.test(top.text) || divider?.kind !== "/" || bottom?.kind !== "number" || !/^\d+$/.test(bottom.text)) return invalid();
    this.cursor += 3;
    return this.properMixedPart(operate(numberValue(top.text), numberValue(bottom.text), "/"));
  }

  private primary(depth: number): BankArithmeticValue {
    this.depth(depth);
    const token = this.peek();
    if (!token) return invalid();
    let value: BankArithmeticValue;
    if (token.kind === "number") {
      this.cursor++;
      value = numberValue(token.text);
      if (/^\d+$/.test(token.text)) {
        if (this.peek()?.kind === "fraction") value = operate(value, this.properMixedPart(this.fraction(depth + 1)), "+");
        else if (this.accept("mixed")) value = operate(value, this.plainMixedFraction(), "+");
        else if (this.peek()?.kind === "number" && this.peek().start > token.end) value = operate(value, this.plainMixedFraction(), "+");
      }
    } else if (token.kind === "fraction") value = this.fraction(depth + 1);
    else if (token.kind === "(" || token.kind === "[" || token.kind === "{") value = this.group(token.kind, depth);
    else return invalid();
    if (this.accept("%")) value = operate(value, rational(BigInt(100)), "/");
    return value;
  }
}

/** Returns a reduced exact rational with a positive denominator, or null when
 * the entire expression is unsupported, malformed or exceeds resource bounds.
 * Mixed numbers are atoms; implicit multiplication is deliberately unsupported. */
export function evaluateBankArithmetic(expression: string): BankArithmeticValue | null {
  if (typeof expression !== "string" || expression.length > MAX_SOURCE_LENGTH) return null;
  try { return new ArithmeticParser(tokenize(expression)).parse(); }
  catch { return null; }
}
