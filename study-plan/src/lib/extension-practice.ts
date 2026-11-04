export type ExtensionSubject = "math" | "english";
export function extensionConfig(subjectId:string, subject:ExtensionSubject) {
  const path=subject==="math"?"math/extension-bank":"english/extension-practice";
  const revision=subject==="math"?"astra-v2":"v1";
  return {apiBase:`/api/extension-practice/${subject}`,storageNamespace:`study-plan-${subject}-extension-${revision}`,backHref:`/subjects/${subjectId}/${path}`,backLabel:subject==="math"?"返回拓展题库":"返回拓展练习"};
}
