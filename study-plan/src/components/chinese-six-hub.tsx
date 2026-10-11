"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import index from "@/data/chinese-six-index.json";
import { emptySixProgress, SIX_MODULES, sixAttemptStats, type SixItemSummary, type SixModule, type SixProgress } from "@/lib/chinese-six";
import styles from "./chinese-six.module.css";

const items = index.items as SixItemSummary[];

export default function ChineseSixHub({ subjectId }: { subjectId: string }) {
  const [module, setModule] = useState<SixModule>("lessons");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [progress, setProgress] = useState<SixProgress>(emptySixProgress);
  useEffect(() => {
    let active = true;
    fetch("/api/chinese/six/progress", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(data => {
      if (active && data?.progress) setProgress(data.progress);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const base = `/subjects/${subjectId}/chinese/six`;
  const currentItems = items.filter(item => item.module === module);
  const groups = [...new Set(currentItems.map(item => item.group))];
  const filtered = currentItems.filter(item => (!group || item.group === group) && `${item.title}${item.group}`.includes(query.trim()));
  const finished = Object.values(progress.attempts).filter(a => a.finishedAt).length;
  return <main className={styles.shell}>
    <div className={styles.inner}>
      <nav className={styles.top}>
        <Link className={styles.back} href={`/subjects/${subjectId}`}>← 返回语文首页</Link>
        <Link className={styles.back} href={`${base}/mistakes`}>错题与成长档案 →</Link>
      </nav>
      <header className={styles.heading}>
        <div><p className={styles.eyebrow}>六年级 · 上册</p><h1>六上语文</h1></div>
        <div className={styles.stats}>
          <div><strong>{progress.reviewed.length}</strong><span>已复习</span></div>
          <div><strong>{finished}</strong><span>完成练习</span></div>
          <div><strong>4</strong><span>学习板块</span></div>
        </div>
      </header>
      <div className={styles.tabs} role="tablist" aria-label="学习板块">
        {SIX_MODULES.map(tab => <button key={tab.key} className={styles.tab} role="tab" aria-selected={module === tab.key} aria-controls="six-items" id={`tab-${tab.key}`} onClick={() => { setModule(tab.key); setGroup(""); setQuery(""); }}>
          {tab.name}<small>{items.filter(i => i.module === tab.key).length}</small>
        </button>)}
      </div>
      {module === "writing" && <p className={styles.notice}>习作按这份范文资料的主题分类。各资料的单元名称存在差异，课内进度请以学校教材为准。</p>}
      {module === "reading" && <details className={styles.band}>
        <summary>阅读方法 · {index.skills.length} 个考点</summary>
        <div className={styles.methodList}>{index.skills.map(skill => <Link key={skill.number} href={`${base}/study/skill-${String(skill.number).padStart(2, "0")}`}>
          {String(skill.number).padStart(2, "0")}　{skill.title}
        </Link>)}</div>
      </details>}
      <div className={styles.filters}>
        <input className={styles.input} aria-label="搜索学习内容" placeholder="搜索课题、文章或习作主题" value={query} onChange={e => setQuery(e.target.value)} />
        <select className={styles.select} aria-label="筛选主题" value={group} onChange={e => setGroup(e.target.value)}>
          <option value="">全部主题</option>{groups.map(g => <option key={g}>{g}</option>)}
        </select>
        <span className={styles.muted}>{filtered.length} 项</span>
      </div>
      <div id="six-items" role="tabpanel" aria-labelledby={`tab-${module}`} className={styles.list}>
        {filtered.map(item => {
          const attempt = progress.attempts[progress.current[item.id]];
          const stats = attempt ? sixAttemptStats(attempt, item.questionCount) : null;
          return <Link key={item.id} className={styles.item} href={`${base}/study/${item.id}`}>
            <div><p className={styles.muted}>{item.group}</p><h2>{item.title}</h2>
              <p className={styles.muted}>{item.questionCount} 道{item.module === "writing" ? "练笔" : "练习"} · 原资料第 {item.pages.join("、")} 页
                {progress.reviewed.includes(item.id) && <span className={styles.badge}>已复习</span>}
                {stats && <span className={styles.badge}>{stats.complete ? "已完成" : `${stats.answered}/${item.questionCount}`}</span>}
              </p></div><span aria-hidden="true">→</span>
          </Link>;
        })}
      </div>
      {!filtered.length && <p className={styles.empty}>没有找到匹配内容。</p>}
    </div>
  </main>;
}
