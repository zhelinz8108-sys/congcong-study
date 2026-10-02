import type { NationalDayMathDiagramId } from "@/lib/national-day-math";
import styles from "./national-day-math-book.module.css";

const titles: Record<NationalDayMathDiagramId, string> = {
  decimals: "小数乘法：把面积看成小格",
  whole: "先找单位“1”，再看部分占几份",
  ratio: "比的三份与两份，合起来是五份",
  circle: "圆心、半径、直径，一张图分清",
  scale: "放大的是每一条对应长度",
  coordinates: "数对：先列，后行",
  bearing: "位置：观测点＋方向＋距离",
};

const captions: Record<NationalDayMathDiagramId, string> = {
  decimals: "1米×1米的大正方形分成100小格，每格0.01平方米。绿色24格：0.6×0.4＝0.24平方米。",
  whole: "80本书平均分成5份，每份16本。借出3/5是48本，剩下2/5是32本。",
  ratio: "蜂蜜∶水＝3∶2。总量5份，蜂蜜占3/5，水占2/5；蜂蜜占总量并不是3/2。",
  circle: "圆心决定位置，半径决定大小。直径必须通过圆心，同一个圆里d＝2r。",
  scale: "按2∶1放大：长和宽都乘2，形状不变。周长乘2；面积乘4属于衔接拓展。",
  coordinates: "图中A在第3列、第4行，记作(3,4)；B在第5列、第2行，记作(5,2)。",
  bearing: "B在A的北偏东30°方向2千米处。从北向东量30°；图是示意，不用于实测比例。",
};

export default function NationalDayMathDiagram({ id }: { id: NationalDayMathDiagramId }) {
  return (
    <figure className={`my-8 rounded-3xl border p-4 sm:p-6 ${styles.diagram}`} data-math-diagram={id}>
      <figcaption className={`mb-4 text-base font-bold ${styles.accent}`}>{titles[id]}</figcaption>
      <svg viewBox={id === "scale" ? "70 0 380 385" : "70 0 380 295"} role="img" aria-labelledby={`math-diagram-${id}`} className="mx-auto block h-auto w-full max-w-lg text-teal-800" style={{ fontFamily: "Arial, Microsoft YaHei, sans-serif", fontSize: 16 }}>
        <title id={`math-diagram-${id}`}>{`${titles[id]}。${captions[id]}`}</title>
        {id === "decimals" && <>
          <text x="260" y="22" textAnchor="middle" fill="#475569">大正方形：1米×1米</text>
          <rect x="160" y="45" width="200" height="200" fill="white" stroke="#99cbd1" />
          <rect x="160" y="165" width="120" height="80" fill="#b6e5dc" />
          {Array.from({ length: 11 }, (_, index) => <g key={index} stroke="#b9dadd" strokeWidth="0.7"><line x1={160 + index * 20} x2={160 + index * 20} y1="45" y2="245" /><line x1="160" x2="360" y1={45 + index * 20} y2={45 + index * 20} /></g>)}
          <text x="220" y="210" textAnchor="middle" fill="#116c65" fontWeight="bold">24小格</text>
          <text x="220" y="155" textAnchor="middle" fill="#116c65">0.6米</text>
          <text x="148" y="210" textAnchor="end" fill="#116c65">0.4米</text>
          <text x="260" y="276" textAnchor="middle" fill="#475569">每小格0.01平方米</text>
        </>}
        {(id === "whole" || id === "ratio") && <>
          <text x="260" y="62" textAnchor="middle" fill="#475569" fontWeight="bold">{id === "whole" ? "全体80本＝单位“1”" : "蜂蜜3份＋水2份＝总量5份"}</text>
          {Array.from({ length: 5 }, (_, index) => <g key={index}><rect x={90 + index * 68} y="106" width="68" height="56" fill={index < 3 ? (id === "whole" ? "#b6e5dc" : "#fde3ba") : "#cee9f9"} stroke="white" strokeWidth="3" /><text x={124 + index * 68} y="140" textAnchor="middle" fill="#334155">{id === "whole" ? "16本" : "1份"}</text></g>)}
          <text x="192" y="197" textAnchor="middle" fill="#116c65" fontWeight="bold">{id === "whole" ? "借出3/5：48本" : "蜂蜜占3/5"}</text>
          <text x="362" y="197" textAnchor="middle" fill="#1d6896" fontWeight="bold">{id === "whole" ? "剩下2/5：32本" : "水占2/5"}</text>
          <text x="260" y="246" textAnchor="middle" fill="#475569">先确定比较的整体，再看分母对应谁。</text>
        </>}
        {id === "circle" && <>
          <circle cx="260" cy="145" r="94" fill="white" stroke="#128885" strokeWidth="2" />
          <line x1="166" y1="145" x2="354" y2="145" stroke="#3885b1" strokeWidth="2" />
          <line x1="260" y1="145" x2="307" y2="63.6" stroke="#c17437" strokeWidth="2.5" />
          <circle cx="260" cy="145" r="4" fill="#475569" />
          <text x="247" y="169" fill="#334155" fontWeight="bold">O</text>
          <text x="203" y="135" textAnchor="middle" fill="#1d6896">直径d</text>
          <text x="297" y="103" fill="#a96123" fontWeight="bold">r</text>
          <text x="260" y="276" textAnchor="middle" fill="#116c65" fontWeight="bold">直径通过圆心，同圆中d＝2r</text>
        </>}
        {id === "scale" && <>
          <text x="260" y="25" textAnchor="middle" fill="#475569">原图：6厘米×4厘米</text>
          <rect x="200" y="40" width="120" height="80" fill="#e5f5f2" stroke="#128885" strokeWidth="2" />
          <text x="260" y="87" textAnchor="middle" fill="#116c65" fontWeight="bold">6×4</text>
          <text x="260" y="155" textAnchor="middle" fill="#475569" fontWeight="bold">↓ 每条对应长度都×2</text>
          <text x="260" y="183" textAnchor="middle" fill="#475569">新图：12厘米×8厘米</text>
          <rect x="140" y="199" width="240" height="160" fill="#e5f5f2" stroke="#128885" strokeWidth="2" />
          <text x="260" y="286" textAnchor="middle" fill="#116c65" fontWeight="bold">12×8</text>
        </>}
        {id === "coordinates" && <>
          {Array.from({ length: 7 }, (_, index) => <g key={index} stroke="#cde2e7" strokeWidth="1"><line x1={138 + index * 32} x2={138 + index * 32} y1="45" y2="237" /><line x1="138" x2="330" y1={237 - index * 32} y2={237 - index * 32} /><text x={138 + index * 32} y="258" textAnchor="middle" fill="#64748b" stroke="none" fontSize="13">{index}</text><text x="124" y={242 - index * 32} textAnchor="end" fill="#64748b" stroke="none" fontSize="13">{index}</text></g>)}
          <text x="351" y="243" fill="#475569">列</text><text x="130" y="28" fill="#475569">行</text>
          <circle cx="234" cy="109" r="4" fill="#128885" /><text x="244" y="99" fill="#116c65" fontWeight="bold">A(3,4)</text>
          <circle cx="298" cy="173" r="4" fill="#3885b1" /><text x="309" y="163" fill="#1d6896" fontWeight="bold">B(5,2)</text>
        </>}
        {id === "bearing" && <>
          <line x1="130" y1="175" x2="405" y2="175" stroke="#cde2e7" /><line x1="260" y1="54" x2="260" y2="252" stroke="#cde2e7" />
          <text x="260" y="35" textAnchor="middle" fill="#475569" fontWeight="bold">北</text><text x="260" y="278" textAnchor="middle" fill="#475569">南</text><text x="110" y="180" fill="#475569">西</text><text x="421" y="180" fill="#475569">东</text>
          <line x1="260" y1="175" x2="320" y2="71" stroke="#128885" strokeWidth="2.5" />
          <path d="M260 135 A40 40 0 0 1 280 140.36" fill="none" stroke="#c17437" strokeWidth="1.5" />
          <circle cx="260" cy="175" r="4" fill="#475569" /><circle cx="320" cy="71" r="4" fill="#128885" />
          <text x="300" y="148" fill="#a96123" fontWeight="bold">30°</text><text x="324" y="112" fill="#116c65">2千米</text><text x="334" y="76" fill="#116c65" fontWeight="bold">B</text><text x="245" y="203" textAnchor="end" fill="#475569">观测点A</text>
        </>}
      </svg>
      <p className="mt-3 text-sm leading-7 text-slate-600">{captions[id]}</p>
    </figure>
  );
}
