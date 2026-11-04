import { ExtensionDirectory } from "@/components/extension-directory";
import { extensionManifest } from "@/server/extension-practice/bank";
export const dynamic = "force-dynamic";
export default async function Page({params}:{params:Promise<{id:string}>}) {
 const {id}=await params;
 return <ExtensionDirectory subjectId={id} subject="english" manifest={await extensionManifest("english")} />;
}
