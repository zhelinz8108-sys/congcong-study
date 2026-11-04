import { notFound } from "next/navigation";
import { Grade6BankPractice } from "@/components/grade6-bank";
import { extensionCollection } from "@/server/extension-practice/bank";
import { extensionConfig } from "@/lib/extension-practice";
export const dynamic = "force-dynamic";
export default async function Page({params,searchParams}:{params:Promise<{id:string;collectionId:string}>;searchParams:Promise<{q?:string|string[]}>}) {
 const {id,collectionId}=await params;
 const collection=await extensionCollection("math",collectionId);
 if(!collection) notFound();
 const {q}=await searchParams;
 const initialQuestionId=typeof q==="string"&&collection.questions.some(row=>row.id===q)?q:undefined;
 return <Grade6BankPractice key={`${id}:${collectionId}`} subjectId={id} collection={collection} initialQuestionId={initialQuestionId} extension={extensionConfig(id,"math")} />;
}
