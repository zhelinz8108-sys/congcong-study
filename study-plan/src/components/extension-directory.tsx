"use client";
import Link from "next/link";
import { useGrade6BankProgress } from "@/lib/grade6-bank-progress";
import { bankStats, type BankManifest } from "@/lib/grade6-bank-types";
import { extensionConfig, type ExtensionSubject } from "@/lib/extension-practice";
import styles from "./grade6-bank.module.css";
export function ExtensionDirectory({subjectId,subject,manifest}:{subjectId:string;subject:ExtensionSubject;manifest:BankManifest}) {
  const config=extensionConfig(subjectId,subject);
  const {progress,ready,sync}=useGrade6BankProgress(subjectId,config.apiBase,config.storageNamespace);
  const stats=bankStats(manifest.collections.flatMap(c=>c.questions.map(q=>q.id)),progress.responses);
  return <main className={styles.page}><div className={styles.practiceWrap}>
    <Link className={styles.back} href={`/subjects/${subjectId}`}>← 返回{subject==="math"?"数学":"英语"}主页</Link>
    <header className={styles.practiceHeader}><h1>{subject==="math"?"拓展题库":"拓展练习"}</h1><p>{subject==="math"?"沿用六上题库的 8 个章节，每章 100 题：50 道选择题、50 道填空题。":"新版六上 Unit 1–8，每单元 150 题：75 道选择题、75 道填空题。"}课内综合提高，作答提交后查看答案与解析。</p></header>
    <section className={styles.overview} aria-label="拓展练习进度"><div className={styles.stats}><span>已答<b>{ready?stats.answered:"—"} / {manifest.total}</b></span><span>答对<b>{ready?stats.correct:"—"}</b></span><span>正确率<b>{ready&&stats.accuracy!==null?`${stats.accuracy}%`:"—"}</b></span></div>{sync!=="saved"&&<p className={styles.note} role="status">{sync==="loading"?"正在读取学习记录…":sync==="saving"?"正在保存…":sync==="conflict"?"其他页面更新了作答；本机草稿已保留，请进入题目核对后手动提交。":"本机草稿已保留，云端暂未同步"}</p>}</section>
    <div className={styles.cards}>{manifest.collections.map(collection=>{
      const current=bankStats(collection.questions.map(q=>q.id),progress.responses);
      return <Link key={collection.id} className={`${styles.card} ${styles.directoryCard}`} href={`${config.backHref}/${collection.id}`} prefetch={false}>
        <div className={styles.cardHead}><h3>{collection.title}</h3><span className={styles.arrow} aria-hidden="true">↗</span></div><p>{collection.subtitle}</p>
        <div className={styles.cardStats}><span>{collection.questionCount} 题</span><span>已答 {ready?current.answered:"—"}</span><span>正确率 {ready&&current.accuracy!==null?`${current.accuracy}%`:"—"}</span></div>
        <div className={styles.track}><div className={styles.fill} style={{width:`${current.answered/collection.questionCount*100}%`}} /></div>
      </Link>;
    })}</div>
  </div></main>;
}
