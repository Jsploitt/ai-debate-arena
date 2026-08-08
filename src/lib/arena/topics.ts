/**
 * Preset debate topics for the public display.
 *
 * STUB LIST — the product team finalises the wording. The shape is what
 * matters: every topic carries an English and an Arabic phrasing plus a
 * category, so the scroller and the staff menu render from one source.
 */

export type TopicCategory = "infrastructure" | "ai" | "vision2030" | "future" | "open";

export interface Topic {
  id: string;
  en: string;
  ar: string;
  category: TopicCategory;
}

export const TOPIC_CATEGORY_LABEL: Record<TopicCategory, string> = {
  infrastructure: "Infrastructure",
  ai: "AI & Ethics",
  vision2030: "Vision 2030",
  future: "Emerging Tech",
  open: "Open Floor",
};

export const TOPICS: Topic[] = [
  {
    id: "edge-vs-cloud",
    en: "Edge computing beats centralised cloud for industrial IoT",
    ar: "الحوسبة الطرفية تتفوق على السحابة المركزية في إنترنت الأشياء الصناعي",
    category: "infrastructure",
  },
  {
    id: "open-weights",
    en: "Frontier AI models should be open-weight",
    ar: "يجب أن تكون نماذج الذكاء الاصطناعي المتقدمة مفتوحة الأوزان",
    category: "ai",
  },
  {
    id: "onprem-sovereignty",
    en: "Data sovereignty requires on-premise AI, not sovereign cloud regions",
    ar: "سيادة البيانات تتطلب ذكاءً اصطناعياً داخل الموقع لا مناطق سحابية سيادية",
    category: "vision2030",
  },
  {
    id: "quantum-hpc",
    en: "Quantum computing will make classical supercomputing obsolete",
    ar: "الحوسبة الكمية ستجعل الحوسبة الفائقة التقليدية بلا جدوى",
    category: "future",
  },
  {
    id: "the-line",
    en: "Saudi smart cities need AI infrastructure built on site, not offshore",
    ar: "المدن الذكية السعودية تحتاج بنية ذكاء اصطناعي داخل المملكة لا خارجها",
    category: "vision2030",
  },
  {
    id: "small-models",
    en: "Small specialised models will outperform giant general ones in the enterprise",
    ar: "النماذج الصغيرة المتخصصة ستتفوق على النماذج العامة الضخمة في المؤسسات",
    category: "ai",
  },
  {
    id: "gpu-lease",
    en: "Enterprises should own their GPUs rather than rent capacity",
    ar: "يجب أن تمتلك المؤسسات وحدات المعالجة الرسومية بدل استئجار الطاقة الحاسوبية",
    category: "infrastructure",
  },
  {
    id: "ai-hiring",
    en: "AI should never make a final hiring decision",
    ar: "لا يجوز للذكاء الاصطناعي أن يتخذ قرار التوظيف النهائي",
    category: "ai",
  },
  {
    id: "arabic-llm",
    en: "The Arab world needs its own foundation model, not translated ones",
    ar: "العالم العربي يحتاج نموذجاً أساسياً خاصاً به لا نماذج مترجمة",
    category: "vision2030",
  },
  {
    id: "liquid-cooling",
    en: "Liquid cooling should be mandatory for every new data centre",
    ar: "يجب أن يكون التبريد السائل إلزامياً في كل مركز بيانات جديد",
    category: "infrastructure",
  },
  {
    id: "agents-replace-apps",
    en: "AI agents will replace traditional business applications within a decade",
    ar: "وكلاء الذكاء الاصطناعي سيحلون محل تطبيقات الأعمال التقليدية خلال عقد",
    category: "future",
  },
  {
    id: "energy-cost",
    en: "The energy cost of AI outweighs its productivity gains today",
    ar: "تكلفة الطاقة للذكاء الاصطناعي تفوق مكاسب الإنتاجية اليوم",
    category: "ai",
  },
  {
    id: "remote-datacenter",
    en: "Desert-sited data centres are a strategic advantage, not a liability",
    ar: "مراكز البيانات في المناطق الصحراوية ميزة استراتيجية لا عبء",
    category: "vision2030",
  },
  {
    id: "ai-education",
    en: "Every university degree should require an AI literacy course",
    ar: "يجب أن تتضمن كل شهادة جامعية مقرراً في ثقافة الذكاء الاصطناعي",
    category: "ai",
  },
  {
    id: "5g-private",
    en: "Private 5G will replace industrial Wi-Fi entirely",
    ar: "شبكات الجيل الخامس الخاصة ستحل محل الواي فاي الصناعي بالكامل",
    category: "infrastructure",
  },
  {
    id: "digital-twin",
    en: "Digital twins are worth their cost only above a certain plant size",
    ar: "التوائم الرقمية تستحق تكلفتها فقط فوق حجم معين من المنشآت",
    category: "future",
  },
  {
    id: "ai-regulation",
    en: "Regulating AI now will slow innovation more than it protects people",
    ar: "تنظيم الذكاء الاصطناعي الآن سيبطئ الابتكار أكثر مما يحمي الناس",
    category: "ai",
  },
  {
    id: "hybrid-work",
    en: "Hybrid work permanently reduced the case for corporate data centres",
    ar: "العمل الهجين قلّص بشكل دائم الحاجة إلى مراكز بيانات الشركات",
    category: "infrastructure",
  },
  {
    id: "robotics-logistics",
    en: "Autonomous logistics will reach Saudi ports before autonomous cars reach its roads",
    ar: "الخدمات اللوجستية الذاتية ستصل موانئ السعودية قبل وصول السيارات ذاتية القيادة لطرقها",
    category: "vision2030",
  },
  {
    id: "human-judge",
    en: "A human should always outrank an AI judge",
    ar: "يجب أن تعلو كلمة الإنسان دائماً على حكم الذكاء الاصطناعي",
    category: "open",
  },
];

/** Split into the two marquee rows: top scrolls left, bottom scrolls right. */
export function topicRows(topics: Topic[] = TOPICS): [Topic[], Topic[]] {
  const mid = Math.ceil(topics.length / 2);
  return [topics.slice(0, mid), topics.slice(mid)];
}

export function topicText(topic: Topic, arabic: boolean) {
  return arabic ? topic.ar : topic.en;
}
