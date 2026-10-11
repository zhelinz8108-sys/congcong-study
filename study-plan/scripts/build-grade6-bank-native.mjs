import fs from "node:fs/promises";
import path from "node:path";
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { bankRoot, sha, sourceDigest, teacherDigest, validateAuthoring } from "./grade6-bank-native-authoring.mjs";

// Local authoring only. No network/database/student data. --seal is NOT deployment.
// Partial batches may only be emitted under tmp. The real release never falls back
// to pictures question by question and never activates before all 2394 are verified.
const work = await validateAuthoring();
const ledgerPath = path.join(bankRoot, "private", "native-review-ledger.json");
let ledger = {};
try { ledger = JSON.parse(await fs.readFile(ledgerPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const reviewedGroups = {
  // Independent reviewer compared all enrichment student pp.124–143 and
  // teacher pp.4–61, all 86 diagrams/boards and 219 original-position fields.
  // Exact geometry, chess enumeration, renderer and isolated HTTP pass;
  // contradictory teacher angles, paired points and multiple solutions stay review.
  "--attest-reviewed-chapter7-enrichment": {
    "native-chapter7-enrichment-01.mjs": { digest: "abe882b9b2baed0efed9197fb034bdbeb9bdf573b71df91d83efc9a2030a6f58", ranges: [{ prefix: "G6E-CH07-Q", min: 1, max: 30 }] },
    "native-chapter7-enrichment-02.mjs": { digest: "1291e3113cd0f07aafebf91b8b11b64964492bfb41d8f5d667ee248a5093254a", ranges: [{ prefix: "G6E-CH07-Q", min: 31, max: 47 }] },
  },
  // Independent reviewer read all 57 complete source/teacher pages and all
  // 14 native figures for the six comprehensive papers. Exact calculations,
  // 386 original-position fields, real renderer and isolated HTTP pass.
  // Original 120m / option text restored; missing-unit Q006 stays review.
  "--attest-reviewed-composite": {
    "native-composite-t01-01.mjs": { digest: "7d6ff1a747d4b6be5cd68b4a78bffc6c9ae68e1da6793f010de856dc3b0c5d66", ranges: [{ prefix: "G6-T01-Q", min: 1, max: 30 }] },
    "native-composite-t01-02.mjs": { digest: "b501cabd66de30c1bd18ef2a2aff6c76d84f4cc6fb6de9ec6713e9924867b7a5", ranges: [{ prefix: "G6-T01-Q", min: 31, max: 32 }] },
    "native-composite-t03-01.mjs": { digest: "08380bb557d2ae84420889cee908d9d80010bd9519a4bb3a3a6401ea6d8ed530", ranges: [{ prefix: "G6-T03-Q", min: 1, max: 30 }] },
    "native-composite-t03-02.mjs": { digest: "43fea92d7d149dc17e2af44f1d4acb7c05519b45819f5950b7e42eec9f406144", ranges: [{ prefix: "G6-T03-Q", min: 31, max: 31 }] },
    "native-composite-t18-01.mjs": { digest: "edcf92066cb7b49a1c7ac6894dc5cf7efe94cf856c0371bc67f1bc913c2e3db4", ranges: [{ prefix: "G6-T18-Q", min: 1, max: 29 }] },
    "native-composite-t19-01.mjs": { digest: "b7ccefea0b1df3e57c604a2697628bfaa6752c1184b74a9b9d3e2f27897b9723", ranges: [{ prefix: "G6-T19-Q", min: 1, max: 30 }] },
    "native-composite-t19-02.mjs": { digest: "158d041ea4aee4cd5a0319741543f9b2e64e17bdeec2f0379f26c08a6bf86f4e", ranges: [{ prefix: "G6-T19-Q", min: 31, max: 45 }] },
    "native-composite-t20-01.mjs": { digest: "1257570202648b7bfa3e04a829f9fa34e3fadd713abd590735a39f3d182e55fc", ranges: [{ prefix: "G6-T20-Q", min: 1, max: 30 }] },
    "native-composite-t23-01.mjs": { digest: "38be001aeb6afb63d108bd6864b0721da251e5d1b278e9002f81adf3db85df6b", ranges: [{ prefix: "G6-T23-Q", min: 1, max: 23 }] },
  },
  // Independent reviewer compared all 99 T12/T13 source and teacher pages,
  // all 73 native boards/figures, 268 fields and their historical semantics.
  // Rigid geometry, wrong/missing responses, actual renderer and isolated HTTP
  // pass. Teacher rotation/labels are corrected from original; contradictions
  // and nonunique drawings stay review, including T13-Q009's impossible area.
  "--attest-reviewed-chapter6-special": {
    "native-chapter6-special-01.mjs": { digest: "751f9820e74b0e912a2ab1761a621b809f09247196db7b114123ecf2d72a2941", ranges: [{ prefix: "G6-T12-Q", min: 1, max: 30 }] },
    "native-chapter6-special-02.mjs": { digest: "e46149e4e210d204093cdd1974388f5370a1d957bac28b3bd00b76b357709011", ranges: [{ prefix: "G6-T12-Q", min: 31, max: 60 }] },
    "native-chapter6-special-03.mjs": { digest: "db303c2e52333dffa487ed7a37d44f4bb11a10ebc6d2918dc346070cadab0a74", ranges: [{ prefix: "G6-T12-Q", min: 61, max: 64 }, { prefix: "G6-T13-Q", min: 1, max: 24 }] },
  },
  // Independent reviewer compared all 38 source/teacher pages and 37 native
  // diagrams/boards, recomputed coordinates/directions, and exercised all
  // 161 fields through actual renderer and isolated HTTP. Q026's equivalent
  // symbolic pairs stay review; Q036 angle bases and Q040 labels are legible.
  "--attest-reviewed-chapter7-sync": {
    "native-chapter7-01.mjs": { digest: "3fcc7b3da7c32764079ea7b213d390b2ab904e293483be9b031e88e71777fbde", chapter: "CH07", min: 1, max: 30 },
    "native-chapter7-02.mjs": { digest: "c0c0355a9140e161fad344666c30282fe5d6a29c185438a2150b811614be2c67", chapter: "CH07", min: 31, max: 44 },
  },
  // ROOT compared all 17 T06/T16 original pages, every authored block and all
  // 33 native figures/boards. Author read all 55 source/teacher pages. Exact
  // arithmetic/geometry, all 148 fields and actual renderer/HTTP pass; original
  // direction angles, cross-page subparts and independent blank inputs remain.
  "--attest-reviewed-chapter7-special": {
    "native-chapter7-special-01.mjs": { digest: "15549508ba982a93d0450725d9ff60b4a707f4036327624abe4264b7d3529038", ranges: [{ prefix: "G6-T06-Q", min: 1, max: 28 }] },
    "native-chapter7-special-02.mjs": { digest: "575c41ecece37859b5518252fb6062eb82ac5ef7fad9e203a29f6961c0d69cdb", ranges: [{ prefix: "G6-T16-Q", min: 1, max: 30 }] },
  },
  // ROOT compared all original main pp.173–199, all 105 native figures and
  // every authored block. Author read all 98 student/teacher evidence pages.
  // Independent exact QA checks 107 scalar + 45 process calculations, every
  // field and isolated HTTP contract. Actual phone SVG / four embedded blank
  // inputs retain readable labels. Contradictions and open answers stay review.
  "--attest-reviewed-chapter5-sync": {
    "native-chapter5-01.mjs": { digest: "f462170dd69a6e0a8658775bbd7735d034517ab3acfe017567c46bf5bb2610f7", chapter: "CH05", min: 1, max: 30 },
    "native-chapter5-02.mjs": { digest: "e1537af9ac29defb90a0ea5d0aa603f18d017bb50f7d72fb91d1e01c9f4512ac", chapter: "CH05", min: 31, max: 60 },
    "native-chapter5-03.mjs": { digest: "8e9a3ece28745b66f5895044eab672878a9dfd9c124536daad8e5416c2d70b3c", chapter: "CH05", min: 61, max: 90 },
    "native-chapter5-04.mjs": { digest: "b80ebbfcc8c810663e4770c969ed0af9ea8f57b2c6b9eb95c305205a70e35c98", chapter: "CH05", min: 91, max: 120 },
    "native-chapter5-05.mjs": { digest: "a0f406b455ea656d5be4c91753f2fe71edf7988c0717c787844295d4f736f125", chapter: "CH05", min: 121, max: 150 },
    "native-chapter5-06.mjs": { digest: "b204eba92da091981bac3d30e05e038c4d21e1138ff27144abb397af7cd14f35", chapter: "CH05", min: 151, max: 158 },
  },
  // Independent reviewer read all 22 student / 65 teacher pages and all native
  // figures. 66 scalar + 22 open recomputations, 80 wrong-field fixtures and
  // renderer / HTTP / migration hooks pass. Percent suffix rejects 0.888 for
  // 88.8%; Q039/Q056 equivalent expressions are honestly review, not false auto.
  "--attest-reviewed-chapter5-enrichment": {
    "native-chapter5-enrichment-01.mjs": { digest: "4b5cf435554aebadbab62dd443a6b3a817aa7ecfba0d9f193b1a45d7956775c0", ranges: [{ prefix: "G6E-CH05-Q", min: 1, max: 30 }] },
    "native-chapter5-enrichment-02.mjs": { digest: "e7d34ede6306c5e0b267306c5215801e1caaafed65f1b2a1718d57499870a250", ranges: [{ prefix: "G6E-CH05-Q", min: 31, max: 60 }] },
    "native-chapter5-enrichment-03.mjs": { digest: "418cca66f4e6f59c8c47d49ed647940ed4eff33c28c08d0c3ec32591e9b404f0", ranges: [{ prefix: "G6E-CH05-Q", min: 61, max: 76 }] },
  },
  // Independent reviewer read all original pp.200–208 / teacher pp.1–25,
  // compared all 27 figures / drawing boards and 96 fields, recomputed 25
  // scalar + 21 process results. Original southwest route preserved in Q029;
  // misleading scale wording and unspecified routes remain review-only.
  "--attest-reviewed-chapter6-sync": {
    "native-chapter6-01.mjs": { digest: "6119ca9bfc6e7a00e0358e9cbe28659efafb284600e99d0a26c389b9f4edaeb5", chapter: "CH06", min: 1, max: 30 },
    "native-chapter6-02.mjs": { digest: "711efc66f4d7111d4299a069f8999ae07aabcd572ee4b2b123fbc5bb052a9796", chapter: "CH06", min: 31, max: 41 },
  },
  // ROOT independently compared all original main pp.145–172 and recomputed
  // paired results; author reviewed all 118 source/teacher evidence pages.
  // Full renderer/HTTP QA covers every field. Twelve blanks and the native
  // area-ratio figure were checked on mobile. Q041 retains original 丙 wording
  // and honestly reports insufficient data instead of silently rewriting it.
  "--attest-reviewed-chapter4-sync": {
    "native-chapter4-01.mjs": { digest: "283aeffb632b50863e985534d9986c3b55242547366262c78c42e86d29043380", chapter: "CH04", min: 1, max: 30 },
    "native-chapter4-02.mjs": { digest: "c16e3e88a3920b6a0967079b919d2df074bd49e9e25c92d65ad93dd0694da5e6", chapter: "CH04", min: 31, max: 60 },
    "native-chapter4-03.mjs": { digest: "1d02fdaef6f5cc7f7fe33aece6295361feb1d7666b3f4d4ff62d25d5f7376883", chapter: "CH04", min: 61, max: 90 },
    "native-chapter4-04.mjs": { digest: "12e7e1853dc4314db5d0c305417cc74613ae8a4f571da76920ad4815b30f130c", chapter: "CH04", min: 91, max: 120 },
    "native-chapter4-05.mjs": { digest: "57cc44fb3854e52e43e4d9ec471d83868a7a9ea08ba6f65588ff09548ec2facc", chapter: "CH04", min: 121, max: 150 },
    "native-chapter4-06.mjs": { digest: "e8b1afba9b6e3957d9607757701e9e5f24ff638a4115ab5e33f79af4c2e0e2c2", chapter: "CH04", min: 151, max: 180 },
    "native-chapter4-07.mjs": { digest: "24f54f619505c1b13e5e44cfd85e10a28ecb400a78d4c7d7c6e9fe9f2fb77224", chapter: "CH04", min: 181, max: 197 },
  },
  // An independent reviewer read every T14/T15 original and teacher page,
  // recomputed 55 exact + 17 process results, and exercised every field via
  // actual renderer and isolated HTTP. Legacy T15-Q006 blank-1 stays female;
  // the new male blank-2 is rendered first without reassigning stored answers.
  "--attest-reviewed-chapter4-special": {
    "native-chapter4-special-01.mjs": { digest: "4cf67198ee3ff2740fd7d71e341eb6d918465fa95b985133993559afd9ff7def", ranges: [{ prefix: "G6-T14-Q", min: 1, max: 30 }] },
    "native-chapter4-special-02.mjs": { digest: "71ab91ac32bb9029627a9bab84a2b55ffb92005b3052b35c98e6f9564e82d2e0", ranges: [{ prefix: "G6-T14-Q", min: 31, max: 41 }, { prefix: "G6-T15-Q", min: 1, max: 19 }] },
    "native-chapter4-special-03.mjs": { digest: "4d0ce2ebeea0f6c418cd4a4e5cddf43ca378d7466ea4b477f72b810b50b15502", ranges: [{ prefix: "G6-T15-Q", min: 20, max: 35 }] },
  },
  // An independent reviewer read every T10/T11 student/teacher page and all
  // 30 native figures, recomputed 92 exact results, checked all 117 fields and
  // 98 wrong-field fixtures. Equivalent ratios and unspecified wheel-center
  // routes remain review-only; they do not become falsely unique auto answers.
  "--attest-reviewed-chapter5-special": {
    "native-chapter5-special-01.mjs": { digest: "b1bc1fa8095699bb67d70fc21515d3114b69616b65062b3088351d5416195222", ranges: [{ prefix: "G6-T10-Q", min: 1, max: 30 }] },
    "native-chapter5-special-02.mjs": { digest: "cdf3949c337bf86ecf617786fd81351f4bbf3af6ac314d8e7a189c438d2a909f", ranges: [{ prefix: "G6-T10-Q", min: 31, max: 50 }, { prefix: "G6-T11-Q", min: 1, max: 10 }] },
    "native-chapter5-special-03.mjs": { digest: "2d914f9fcb4bfadb389f1fd1648782c46fa9f4721d907c8ed131f720d54dc27f", ranges: [{ prefix: "G6-T11-Q", min: 11, max: 28 }] },
  },
  // ROOT independently read all original pp.106–120, author read complete
  // teacher pp.4–46; 69 exact recomputations / 115 failed-field fixtures pass.
  // Every native figure was reviewed. Corrected Q016's original 14x10 grid
  // and Q027 velocity unit. Wide-grid labels retain readable size on mobile
  // with internal scrolling; Q046's missing original square is not invented.
  "--attest-reviewed-chapter6-enrichment": {
    "native-chapter6-enrichment-01.mjs": { digest: "c738a2e42d811a5209de85314a6498d4476a43038b53f00044009a1f0e85cf10", ranges: [{ prefix: "G6E-CH06-Q", min: 1, max: 30 }] },
    "native-chapter6-enrichment-02.mjs": { digest: "53d711b76de4a77e05ab07184f3d87e7211e1a8cef77e1185474ac8f9492cc1c", ranges: [{ prefix: "G6E-CH06-Q", min: 31, max: 50 }] },
  },
  // ROOT compared all enrichment student pp.68–78 / teacher pp.3–44.
  // Independently recalculated all scalar keys and reviewed ambiguous/open
  // problems without forcing erroneous teacher examples. Actual renderer
  // checks cover every field. Both SVGs checked on a 390px phone viewport;
  // golden rectangles retain common square units in a readable vertical stack.
  "--attest-reviewed-chapter4-enrichment": {
    "native-chapter4-enrichment-01.mjs": { digest: "1e30815406c9523b9d12da6823a54f8d63ea5f3a9b8765f978e3ddfc54305136", ranges: [{ prefix: "G6E-CH04-Q", min: 1, max: 30 }] },
    "native-chapter4-enrichment-02.mjs": { digest: "43d52085057cbbf5d7ab9c70fb915a92c89d50d371de9b635b8b22e4975db62a", ranges: [{ prefix: "G6E-CH04-Q", min: 31, max: 60 }] },
    "native-chapter4-enrichment-03.mjs": { digest: "330cd247ff0db18e9d4013c69019561c681b8fbc77ad06701ab2bca57e08e557", ranges: [{ prefix: "G6E-CH04-Q", min: 61, max: 64 }] },
  },
  // ROOT compared every T07 student pp.1–4 / teacher pp.5–8 (p9 blank),
  // T17 pp.1–3 / pp.4–12, T21 pp.1–4 / pp.5–6 and T22 pp.1–4 / p5.
  // Independent exact QA checks 86 rules + 39 process results, all 275 fields,
  // renderer and input contracts. Confirmed teacher's association-law typo;
  // malformed choices, estimates and open formulas remain review-only.
  // Seven equal parts and their 4/7 label were checked on a 390px viewport.
  "--attest-reviewed-chapter3-special": {
    "native-chapter3-special-01.mjs": { digest: "1f114de1ab238d02b8e5192244ca91e48c3b225e15b6e1a543dd895f7c42e7de", ranges: [{ prefix: "G6-T07-Q", min: 1, max: 30 }] },
    "native-chapter3-special-02.mjs": { digest: "36fec7834b065cd8e0f2cc47b60a4463b47e52480c6cf85fd43fb021af290834", ranges: [{ prefix: "G6-T17-Q", min: 1, max: 30 }] },
    "native-chapter3-special-03.mjs": { digest: "da5238df6202ba4f6564d90b823aba3306eee76e862c57cf6645c7ae24a8e910", ranges: [{ prefix: "G6-T17-Q", min: 31, max: 45 }] },
    "native-chapter3-special-04.mjs": { digest: "69f4d675a0721be1c0452c50dbca69329ed31f7ff1fafb2764ce42f18bd5d800", ranges: [{ prefix: "G6-T21-Q", min: 1, max: 26 }] },
    "native-chapter3-special-05.mjs": { digest: "d42bfbc14f881763a3b45013f10dae3c16b8f25177284fb9ab28c1d01b41ba3b", ranges: [{ prefix: "G6-T22-Q", min: 1, max: 24 }] },
  },
  // Independently compared every enrichment student page 51–65 and teacher
  // page 1–35. Recalculated all scalar rules; restored every option/subpart,
  // reviewed all four native diagrams and stacked fraction inputs on mobile.
  // Corrected the 0.03亿 conversion in the explanation; ambiguous count-unit
  // wording, equivalent numerator/denominator pairs and processes retain review.
  "--attest-reviewed-chapter3-enrichment": {
    "native-chapter3-enrichment-01.mjs": { digest: "364f2cee886aae1615218c99534280511b6cd63ec071e3a8d8b8277a489d617e", ranges: [{ prefix: "G6E-CH03-Q", min: 1, max: 30 }] },
    "native-chapter3-enrichment-02.mjs": { digest: "fe4401d1c46fc26f8ba9d92e78ecd6cc58b2659111289479460481569a85d4c9", ranges: [{ prefix: "G6E-CH03-Q", min: 31, max: 60 }] },
    "native-chapter3-enrichment-03.mjs": { digest: "3c0f8b6c7d36cf5d9a8722974080e97ebe2b2bc769c436484184474de3c221ed", ranges: [{ prefix: "G6E-CH03-Q", min: 61, max: 87 }] },
  },
  // Independently compared all original main pp.133–144, unit pp.4–10 and
  // teacher pp.4–24, including cross-page tables and all 10/8 calculations.
  // Recomputed numeral conversions, checked both counting-block diagrams and
  // both cylinder diagrams on mobile; 0.70 retains the requested decimal unit.
  "--attest-reviewed-chapter3-sync": {
    "native-chapter3-01.mjs": { digest: "1c03b06f169a299f141aa174eb1e427dbd296d3d63e8cbe83660e640fbc966b2", chapter: "CH03", min: 1, max: 30 },
    "native-chapter3-02.mjs": { digest: "605c51077bc01c108c88c1a09ed00d032708131de465b2d4a4adff9259d1ac21", chapter: "CH03", min: 31, max: 60 },
    "native-chapter3-03.mjs": { digest: "267e5de39bb055230612077721371267fc2e8235383722645ab80b7f1614a5e4", chapter: "CH03", min: 61, max: 75 },
  },
  "--attest-reviewed-preparation": {
    "native-preparation-01.mjs": { digest: "438fa8de93d936ac27a4a4f6aa50fb7ae1a2a8fd256b75e5871dccd0c5b48a6b", chapter: "CH00", min: 1, max: 30 },
    "native-preparation-02.mjs": { digest: "be1968d99993ab1d2f666cb58f5c06b24f87b9a2e22cb3070bded8e26417f504", chapter: "CH00", min: 31, max: 59 },
  },
  // Independently compared to original student pp.20–28, basic teacher pp.1–13,
  // higher teacher pp.1–8; includes split questions and cross-page explanations.
  // Fixed revisions only. Future authoring/candidates cannot inherit this review.
  "--attest-reviewed-chapter1-first60": {
    "native-chapter1-01.mjs": { digest: "042b243d739ffb220a5335bcde4f7aa256afba8e1e717c5dcbc68435285efcc6", chapter: "CH01", min: 1, max: 30 },
    "native-chapter1-02.mjs": { digest: "b2804ee76ebdc3196ac48158d0cd5d3448fd44ba677058f434ce645579df227b", chapter: "CH01", min: 31, max: 60 },
  },
  // Independently reviewed complete original pp.28–41, higher teacher pp.8–14,
  // application teacher pp.1–16 and division teacher p.1. Review caught and
  // corrected a misread 55.2 in question 108, and retained question 90's rounding
  // ambiguity instead of forcing the teacher's example as the only answer.
  "--attest-reviewed-chapter1-61-120": {
    "native-chapter1-03.mjs": { digest: "af5c3f90092977a6a7e2d59f52b3362096d616d68252748bbfc773e0d2bd88ea", chapter: "CH01", min: 61, max: 90 },
    "native-chapter1-04.mjs": { digest: "c47dac43857e14f91a208019ea12ebc0979d4fd44190674b712eb8b5c32d5233", chapter: "CH01", min: 91, max: 120 },
  },
  // Independently checked complete original pp.41–52, division teacher pp.1–20
  // and division-application teacher pp.1–2. Restored the original long-division
  // decimal shift and all digit-table bars; independently recalculated the
  // repeating-digit answers and the missing teacher solution for question 172.
  "--attest-reviewed-chapter1-121-180": {
    "native-chapter1-05.mjs": { digest: "5206326bc037d5d3ec5ba583a6b2c3afa5301bbef18ba84fa9301837b3ba2e85", chapter: "CH01", min: 121, max: 150 },
    "native-chapter1-06.mjs": { digest: "d42126d31597773fbeffd426ba6ad40afa15c84c6b088c0e29ad81eaa4b89999", chapter: "CH01", min: 151, max: 180 },
  },
  // Independently checked complete original pp.52–64 and division-application
  // teacher pp.2–19. Corrected teacher rounding/unit errors; all five exchange
  // table rows, subquestions and native floor diagrams preserve source values.
  "--attest-reviewed-chapter1-181-240": {
    "native-chapter1-07.mjs": { digest: "2316e7eecdb4db0c997ab75e7f73d83ceeaba1b0abd14685622067478bb68819", chapter: "CH01", min: 181, max: 210 },
    "native-chapter1-08.mjs": { digest: "4427102a47e1ff710c6a6fcdbddd79afad8b388df8198f03b008057728c77d3b", chapter: "CH01", min: 211, max: 240 },
  },
  // Independently checked every student page and teacher pp.5–20 (T04),
  // pp.5–11 (T05). Recomputed all scalar rules; ambiguous factor/zero-count
  // questions remain review-only. Corrected the native gift-box drawing.
  "--attest-reviewed-chapter1-special": {
    "native-chapter1-special-01.mjs": { digest: "17c50a7d45be4b70a4ddccb393616da30ea6f03ec508577ab00229881906644c", ranges: [{ prefix: "G6-T04-Q", min: 1, max: 30 }] },
    "native-chapter1-special-02.mjs": { digest: "940ed8acc3b6ab4e10c3c0363826ef5be04421e76ba925e2c9647cd23591e90e", ranges: [{ prefix: "G6-T04-Q", min: 31, max: 50 }, { prefix: "G6-T05-Q", min: 1, max: 10 }] },
    "native-chapter1-special-03.mjs": { digest: "5eb757d656277e62bced51cdcfc87930631ef18bdace25e3205533af94ecf0f3", ranges: [{ prefix: "G6-T05-Q", min: 11, max: 29 }] },
  },
  // Independently compared all original pp.15–29 and teacher pp.5–43,
  // including split questions, native arithmetic diagrams and open problems.
  // Multiple-factor and estimate questions retain human-review semantics.
  "--attest-reviewed-chapter1-enrichment": {
    "native-chapter1-enrichment-01.mjs": { digest: "3ce416b1e4f88a7749410d08412e3fd466d5daaccaf75005089a203a508e96ca", ranges: [{ prefix: "G6E-CH01-Q", min: 1, max: 30 }] },
    "native-chapter1-enrichment-02.mjs": { digest: "5659341a1f5d40731d5e9ded1590368a7889d975fac9a6a16da00c8685109ffe", ranges: [{ prefix: "G6E-CH01-Q", min: 31, max: 60 }] },
    "native-chapter1-enrichment-03.mjs": { digest: "04791ba51c95fe2ea23e959d2161404c06d681750d815747107c01e8176c8060", ranges: [{ prefix: "G6E-CH01-Q", min: 61, max: 76 }] },
  },
  // Independently checked every original student page 65–106, calculation
  // teacher pp.1–27, application pp.1–24 and quantity pp.1–28. Recomputed
  // scalar rules, corrected teacher totals/units, and visually checked all
  // native figures plus the original stacked fraction blanks on mobile.
  "--attest-reviewed-chapter2-first180": {
    "native-chapter2-01.mjs": { digest: "19b74e74bed1eb14d328ac010ab0cb7e497f8346fbf69cb7af7e9036ba95a41a", chapter: "CH02", min: 1, max: 30 },
    "native-chapter2-02.mjs": { digest: "0dda97eeeb5878a99644075e6c7d9dfeda3571d4108a00cc68d4829ccbbe03ce", chapter: "CH02", min: 31, max: 60 },
    "native-chapter2-03.mjs": { digest: "ecee2a05994f163fbc16f9625913a05453576b552d5f93e402a3dab27ee574f8", chapter: "CH02", min: 61, max: 90 },
    "native-chapter2-04.mjs": { digest: "14b8787f4fdf558b160033d008d8e99a5a8bceaa286870a8e2699d5f903202eb", chapter: "CH02", min: 91, max: 120 },
    "native-chapter2-05.mjs": { digest: "34b72e80ee4fc9758fa5542c88d1b9cf208b75f658d73bc2262ea9333ab6ad2b", chapter: "CH02", min: 121, max: 150 },
    "native-chapter2-06.mjs": { digest: "05c24bcaa45814dffdb019155fde86c3205631bc4d3b30fcbbf9b1f9e83bbd54", chapter: "CH02", min: 151, max: 180 },
  },
  // Independently checked all T02 student pp.1–4 / teacher pp.5–9,
  // T08 pp.1–4 / pp.5–10, T09 pp.1–4 / pp.4–18 and T25 pp.1–4 / p.5.
  // Recomputed all numerical rules, checked all ten diagrams, and verified
  // the three T02-Q012 comparison drawings stacked legibly on mobile.
  // Ambiguous bases and equivalent letter/process answers remain review-only.
  "--attest-reviewed-chapter2-special": {
    "native-chapter2-special-01.mjs": { digest: "fab835e765be40c225c6cecd017c19cae47481aad756f9e0b1fcbbbc282169ef", ranges: [{ prefix: "G6-T02-Q", min: 1, max: 25 }] },
    "native-chapter2-special-02.mjs": { digest: "2b6e27f50606c8a259c0a6e8ea44b8aa5549474918619e4bfc27f309df0e97e6", ranges: [{ prefix: "G6-T08-Q", min: 1, max: 30 }] },
    "native-chapter2-special-03.mjs": { digest: "09a669cb8d18c20d8142d7075f5736b5fdf1f729a33b4f6421fdfd32c360283e", ranges: [{ prefix: "G6-T08-Q", min: 31, max: 34 }, { prefix: "G6-T09-Q", min: 1, max: 26 }] },
    "native-chapter2-special-04.mjs": { digest: "c214762b0eecbb73a73c1611c589fbbe5f94bf07681bc5a7bf321ff8de92541d", ranges: [{ prefix: "G6-T09-Q", min: 27, max: 30 }, { prefix: "G6-T25-Q", min: 1, max: 25 }] },
  },
  // Independently compared every original enrichment page 31–50 and teacher
  // page 2–66. Recalculated all scalar rules and checked both native figures;
  // the two product drawings now stack with legible mobile price labels.
  // Six valid information pairs and calculation/proof questions retain review.
  "--attest-reviewed-chapter2-enrichment": {
    "native-chapter2-enrichment-01.mjs": { digest: "45ca1d843080b1300bcc4b5545c892c13a32445b60cc44c925803168aeec7125", ranges: [{ prefix: "G6E-CH02-Q", min: 1, max: 30 }] },
    "native-chapter2-enrichment-02.mjs": { digest: "852f427dee6ee6351110c8b66bac97fe2fbcc6426f67bb7458de830e02448f31", ranges: [{ prefix: "G6E-CH02-Q", min: 31, max: 60 }] },
    "native-chapter2-enrichment-03.mjs": { digest: "c99c422f3fcae46f74ecd9686bee1d4ce674f3859322f962b3aeb63b250c7341", ranges: [{ prefix: "G6E-CH02-Q", min: 61, max: 70 }] },
  },
  // Independently read all original pp.106–132, quantity teacher pp.28–31,
  // unit-problem pp.1–23, engineering pp.1–21 and fee pp.1–11. Recomputed
  // numerical rules and reviewed all seven native figures on mobile; restored
  // all 8 billing blanks and 11 operation-law blanks. Equivalent forms and
  // estimates remain review-only; teacher's cooperation time is not the
  // requested solo time. Cross-page crops cannot swallow adjacent questions.
  "--attest-reviewed-chapter2-final": {
    "native-chapter2-07.mjs": { digest: "8a1b490c3d18bcc5861ecc53d08faf733e521208733c30ff1c26d9823df19198", chapter: "CH02", min: 181, max: 210 },
    "native-chapter2-08.mjs": { digest: "63e20eae353dc3837d77291eb1ab87e87034437cdad9b63d3a5ab8c814d2e07a", chapter: "CH02", min: 211, max: 240 },
    "native-chapter2-09.mjs": { digest: "a7cefaf2d500283240711727184b5d4fa0c426b08d09434db916a08da202b021", chapter: "CH02", min: 241, max: 270 },
    "native-chapter2-10.mjs": { digest: "ff4ee78b8635d4113d12ebbfeac8e6ae4910c5c100b9383b7aa59eaa6ed1e048", chapter: "CH02", min: 271, max: 300 },
    "native-chapter2-11.mjs": { digest: "01b448bd9bd5c5302d1887db9e0687b1c847c78cf3b3c171a4b9b1fbc1bc1da3", chapter: "CH02", min: 301, max: 302 },
  },
};
for (const [flag, reviewedBatches] of Object.entries(reviewedGroups)) {
  if (!process.argv.includes(flag)) continue;
  for (const [file, batch] of Object.entries(reviewedBatches)) {
    const entries = work.entries.filter((entry) => entry.file === file);
    const allowedIds = batch.ranges && new Set(batch.ranges.flatMap(({ prefix, min, max }) => Array.from({ length: max - min + 1 }, (_, index) => prefix + String(min + index).padStart(3, "0"))));
    if (entries.length !== (allowedIds ? allowedIds.size : batch.max - batch.min + 1)) throw new Error("Reviewed batch coverage changed");
    for (const entry of entries) {
    const match = /^SYNC-(CH\d{2})-P\d{3}-(\d{4})$/.exec(entry.row.id);
    const covered = allowedIds ? allowedIds.has(entry.row.id) : match && match[1] === batch.chapter && Number(match[2]) >= batch.min && Number(match[2]) <= batch.max;
    if (entry.authorDigest !== batch.digest || !covered) throw new Error("This authoring revision has not been visually reviewed");
    const original = work.byId.get(entry.row.id);
    ledger[entry.row.id] = { sourceDigest: await sourceDigest(original), teacherDigest: await teacherDigest(original), authorDigest: entry.authorDigest, questionReviewed: true, answerReviewed: true, figuresReviewed: true };
    }
  }
  await fs.writeFile(ledgerPath, JSON.stringify(ledger, null, 2) + "\n");
}
let reviewed = 0;
for (const entry of work.entries) {
  const proof = ledger[entry.row.id];
  const original = work.byId.get(entry.row.id);
  if (proof?.questionReviewed === true && proof.answerReviewed === true && proof.figuresReviewed === true && proof.authorDigest === entry.authorDigest && proof.sourceDigest === await sourceDigest(original) && proof.teacherDigest === await teacherDigest(original)) reviewed++;
}
const stats = { ...work.stats, reviewed, releaseReady: work.stats.converted === work.manifest.total && reviewed === work.manifest.total };
const questions = work.entries.map(({ row }) => ({ id: row.id, inputs: row.inputs, native: row.native }));
const data = { version: 1, total: work.manifest.total, baseDigest: work.baseDigest, questions };
if (process.argv.includes("--preview")) {
  const folder = path.resolve("../tmp/grade6-bank-native"); await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, "preview.public.json"), JSON.stringify(data, null, 2) + "\n");
  await fs.writeFile(path.join(folder, "status.json"), JSON.stringify(stats, null, 2) + "\n");
}
console.log(JSON.stringify(stats));
if (!stats.releaseReady) { console.error("Native release blocked: every question and paired answer must be converted and reviewed first."); process.exitCode = 1; }
else if (process.argv.includes("--seal")) {
  const { default: nextEnv } = await import("@next/env"); nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const secret = process.env.HOLIDAY_MATH_700_KEY?.trim();
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error("Existing grading key unavailable");
  const raw = JSON.stringify(data, null, 2) + "\n", publicDigest = sha(raw);
  const rows = work.entries.map(({ row }) => ({ id: row.id, ...row.private, answerImages: [] }));
  const salt = randomBytes(16), iv = randomBytes(12), key = scryptSync(secret, Buffer.concat([Buffer.from("grade6-native-v1:"), salt]), 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(Buffer.from("grade6-native-v1:answers:" + publicDigest));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(rows)), cipher.final()]);
  const sealed = { version: 1, publicDigest, salt: salt.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: encrypted.toString("base64") };
  await fs.writeFile(path.join(bankRoot, "sealed", "native-answers.encrypted.json"), JSON.stringify(sealed) + "\n");
  await fs.writeFile(path.join(bankRoot, "questions.native.public.json"), raw);
  console.log("Complete native release sealed. Deployment still requires interaction, grading, privacy and browser acceptance tests.");
}
