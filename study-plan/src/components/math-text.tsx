import type { ReactNode } from "react";

type MathTextProps = {
  text: string | number | null | undefined;
  className?: string;
};

const fractionPattern = /(\d+)\/(\d+)/g;

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
      className="mx-0.5 inline-grid translate-y-[0.08em] grid-rows-[auto_auto] items-center justify-items-center whitespace-nowrap align-middle text-[0.82em] font-[inherit] leading-none"
      role="text"
    >
      <span className="px-0.5 pb-[2px] leading-none">{numerator}</span>
      <span className="min-w-full border-t border-current px-0.5 pt-[2px] leading-none">
        {denominator}
      </span>
    </span>
  );
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
      parts.push(value.slice(lastIndex, index));
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
    parts.push(value.slice(lastIndex));
  }

  return parts.length ? parts : [value];
}

export function MathText({ text, className }: MathTextProps) {
  const value = String(text ?? "");

  return <span className={className}>{renderMathText(value)}</span>;
}
