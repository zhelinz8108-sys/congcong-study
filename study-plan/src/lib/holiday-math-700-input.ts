import type {
  HolidayNode,
  HolidayStudentAnswer,
} from "./holiday-math-700-types";

export function emptyHolidayAnswer(node: HolidayNode): HolidayStudentAnswer {
  if (node.parts?.length)
    return Object.fromEntries(
      node.parts.map((part) => [part.part_id, emptyHolidayAnswer(part)]),
    );
  if (node.type === "multi_choice" || node.type === "ordering") return [];
  if (node.type === "matching" || node.type === "classification")
    return Object.fromEntries(
      (node.interaction?.left ?? node.interaction?.items ?? []).map((item) => [
        item.id,
        "",
      ]),
    );
  if (node.type === "multi_blank" || node.type === "table_fill")
    return (node.input?.blanks ?? []).map(() => "");
  return "";
}
export function completeHolidayAnswer(
  node: HolidayNode,
  value: HolidayStudentAnswer,
): boolean {
  if (node.parts?.length)
    return (
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      node.parts.every(
        (p) =>
          value[p.part_id] !== undefined &&
          completeHolidayAnswer(p, value[p.part_id]),
      )
    );
  if (node.type === "matching" || node.type === "classification")
    return (
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (node.interaction?.left ?? node.interaction?.items ?? []).every(
        (item) => typeof value[item.id] === "string" && !!value[item.id],
      )
    );
  if (node.type === "multi_blank" || node.type === "table_fill")
    return (
      Array.isArray(value) &&
      value.length === node.input?.blanks.length &&
      value.every((v) => typeof v === "string" && !!v.trim())
    );
  if (node.type === "ordering")
    return (
      Array.isArray(value) &&
      value.length === node.interaction?.items?.length &&
      new Set(value).size === value.length
    );
  if (node.type === "multi_choice")
    return Array.isArray(value) && value.length > 0;
  return typeof value === "string" && !!value.trim();
}
