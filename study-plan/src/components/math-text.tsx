import type { ReactNode } from "react";

type MathTextProps = {
  text: string | number | null | undefined;
  className?: string;
};

const fractionPattern = /(\d+)\/(\d+)/g;
const operatorPattern = /([+\-\u2212\u00d7\u00f7=<>])/g;

function isFractionBoundary(value: string | undefined) {
  return !value || !/[A-Za-z0-9_.]/.test(value);
}

function FractionGlyph({
  numerator,
  denominator,
}: {
  numerator: string;
  denominator: string;
}) {
  return (
    <span
      aria-label={`${numerator}/${denominator}`}
      className="mx-0.5 inline-flex translate-y-[0.08em] flex-col items-stretch whitespace-nowrap align-middle text-[0.78em] font-[inherit] leading-none tabular-nums"
      role="text"
    >
      <span className="block min-w-[1.35em] px-[0.18em] pb-[1px] text-center leading-none">
        {numerator}
      </span>
      <span className="block min-w-[1.35em] border-t-[1.5px] border-current px-[0.18em] pt-[1px] text-center leading-none">
        {denominator}
      </span>
    </span>
  );
}

function OperatorGlyph({ value }: { value: string }) {
  return (
    <span
      className="mx-[0.22em] inline-block translate-y-[-0.02em] font-semibold"
    >
      {value === "-" ? "\u2212" : value}
    </span>
  );
}

function renderTextSegment(segment: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of segment.matchAll(operatorPattern)) {
    const [operator] = match;
    const index = match.index ?? 0;

    if (index > lastIndex) {
      parts.push(segment.slice(lastIndex, index));
    }

    parts.push(<OperatorGlyph key={`${keyPrefix}-op-${index}`} value={operator} />);
    lastIndex = index + operator.length;
  }

  if (lastIndex < segment.length) {
    parts.push(segment.slice(lastIndex));
  }

  return parts.length ? parts : [segment];
}

function renderMathText(value: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(fractionPattern)) {
    const [raw, numerator, denominator] = match;
    const index = match.index ?? 0;
    const before = value[index - 1];
    const after = value[index + raw.length];

    if (!isFractionBoundary(before) || !isFractionBoundary(after)) {
      continue;
    }

    if (index > lastIndex) {
      parts.push(...renderTextSegment(value.slice(lastIndex, index), `text-${lastIndex}`));
    }

    parts.push(
      <FractionGlyph
        key={`${index}-${raw}`}
        numerator={numerator}
        denominator={denominator}
      />
    );
    lastIndex = index + raw.length;
  }

  if (lastIndex < value.length) {
    parts.push(...renderTextSegment(value.slice(lastIndex), `text-${lastIndex}`));
  }

  return parts.length ? parts : [value];
}

export function MathText({ text, className }: MathTextProps) {
  const value = String(text ?? "");

  return <span className={className}>{renderMathText(value)}</span>;
}
