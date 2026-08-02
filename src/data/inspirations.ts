export interface Inspiration {
  greeting: string;
  quote: string;
  gradient: string;
  bgClass: string;
  glowColor: string;
  iconBg: string;
}

export const INSPIRATIONS: Inspiration[] = [
  {
    greeting: "صباح الخير يا {name} ☀️",
    quote: "يوم جديد… وفرصة جديدة تثبت فيها لنفسك إنك تقدر تعمل فرق حقيقي.",
    gradient: "from-amber-400 via-orange-500 to-rose-500",
    bgClass: "bg-amber-500/5 border-amber-500/10 text-amber-200",
    glowColor: "rgba(245, 158, 11, 0.15)",
    iconBg: "bg-amber-500/20 text-amber-400"
  },
  {
    greeting: "صباح الخير يا {name} 🌟",
    quote: "ابدأ يومك بهدوء، ركّز على أولوياتك… وسيب شغلك يتكلم عنك.",
    gradient: "from-purple-400 via-violet-500 to-[#7C3AED]",
    bgClass: "bg-purple-500/5 border-purple-500/10 text-purple-200",
    glowColor: "rgba(124, 58, 237, 0.15)",
    iconBg: "bg-purple-500/20 text-purple-400"
  },
  {
    greeting: "صباح الخير يا {name} ✨",
    quote: "النجاح مش بييجي بالحماس المؤقت… بييجي بالالتزام اليومي.",
    gradient: "from-emerald-400 via-teal-550 to-emerald-600",
    bgClass: "bg-emerald-500/5 border-emerald-500/10 text-emerald-200",
    glowColor: "rgba(16, 185, 129, 0.15)",
    iconBg: "bg-emerald-500/20 text-emerald-400"
  },
  {
    greeting: "صباح الخير يا {name} 🚀",
    quote: "كل خطوة صغيرة النهارده… بتبني نتيجة كبيرة بكرة.",
    gradient: "from-[#4C1A83] via-[#2F1155] to-[#120424]",
    bgClass: "bg-[#4D1080]/5 border-[#E2B765]/10 text-purple-200",
    glowColor: "rgba(76, 26, 131, 0.18)",
    iconBg: "bg-[#4C1A83]/25 text-[#E2B765]"
  },
  {
    greeting: "صباح الخير يا {name} 🤝",
    quote: "وجودك في الفريق إضافة حقيقية… ويومك النهارده يستاهل يبدأ بثقة وحماس.",
    gradient: "from-pink-500 via-rose-500 to-amber-500",
    bgClass: "bg-rose-500/5 border-rose-500/10 text-rose-250",
    glowColor: "rgba(244, 63, 94, 0.15)",
    iconBg: "bg-rose-500/20 text-rose-400"
  }
];
