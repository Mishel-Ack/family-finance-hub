export type CategorizationSource =
  "CORRECTION" | "FAMILY_HISTORY" | "DICTIONARY" | "NAIVE_BAYES" | "LLM" | "NONE";

export interface CategoryChoice {
  id: string;
  name: string;
}

export interface CategoryLearningPair {
  text: string;
  categoryId: string;
}

export interface CategoryCorrectionInput {
  merchantKey: string;
  categoryId: string;
}

export interface CategorizerContext {
  categories: CategoryChoice[];
  corrections?: CategoryCorrectionInput[];
  sharedHistory?: CategoryLearningPair[];
  ownPrivateHistory?: CategoryLearningPair[];
  suggestWithLlm?: (text: string, categories: CategoryChoice[]) => Promise<string | null>;
}

export interface CategorySuggestion {
  categoryId: string | null;
  confidence: number;
  source: CategorizationSource;
}

const dictionaryGroups: Record<string, string[]> = {
  Food: [
    "swiggy",
    "zomato",
    "dominos",
    "domino's",
    "pizza hut",
    "mcdonalds",
    "kfc",
    "burger king",
    "subway",
    "starbucks",
    "cafe coffee day",
    "ccd",
    "dunkin",
    "behrouz biryani",
    "faasos",
    "biryani by kilo",
    "haldirams",
    "box8",
    "eatclub",
    "freshmenu",
    "eatfit",
    "chaayos",
    "blue tokai",
    "third wave coffee",
    "wow momo",
    "barbeque nation",
    "taco bell",
    "paradise biryani",
    "natural ice cream",
    "kwality walls",
    "cream stone",
    "theobroma",
    "ovenstory",
    "oven story",
    "la pinoz",
    "chaipoint",
    "mio amore",
    "burger singh",
    "wendys",
    "wendy's",
    "foodpanda",
    "eatsure",
    "magicpin food",
    "rebel foods",
    "wow china",
    "chilis",
    "pizza express",
    "social",
    "curefoods",
    "irctc e-catering",
    "railrestro",
    "eatclub order",
  ],
  Groceries: [
    "bigbasket",
    "bbnow",
    "blinkit",
    "zepto",
    "dmart",
    "d mart",
    "jiomart",
    "amazon fresh",
    "flipkart grocery",
    "swiggy instamart",
    "reliance fresh",
    "reliance smart",
    "more supermarket",
    "spencers",
    "star bazaar",
    "nature's basket",
    "natures basket",
    "country delight",
    "milk basket",
    "milkbasket",
    "dunzo daily",
    "fresh to home",
    "fresh2home",
    "licious",
    "meatigo",
    "freshtohome",
    "organic india",
    "namdhari's",
    "namdharis",
    "heritage foods",
    "amul",
    "mother dairy",
    "countrydelight",
    "grofers",
    "supermart",
    "grofers",
    "metro wholesale",
    "organic mandya",
    "safal",
    "easyday",
    "vishal mega mart",
    "daily needs",
    "kirana",
    "grocery store",
    "provision store",
    "vegetable market",
    "fruit market",
    "milk delivery",
    "atta chakki",
    "spice basket",
    "foodhall",
  ],
  Shopping: [
    "amazon",
    "flipkart",
    "myntra",
    "ajio",
    "meesho",
    "nykaa",
    "tatacliq",
    "tata cliq",
    "croma",
    "reliance digital",
    "vijay sales",
    "pepperfry",
    "urban ladder",
    "ikea",
    "shoppers stop",
    "lifestyle",
    "westside",
    "max fashion",
    "puma",
    "adidas",
    "nike",
    "decathlon",
    "firstcry",
    "lenskart",
    "boat",
    "oneplus",
    "samsung store",
    "apple store",
    "mi store",
    "reliance trends",
    "zudio",
    "pantaloons",
    "fabindia",
    "manyavar",
    "biba",
    "h&m",
    "hm store",
    "zara",
    "united colors of benetton",
    "bewakoof",
    "tatacliq luxury",
    "snapdeal",
    "ebay",
    "etsy",
    "jbl",
    "sony center",
    "havells store",
    "urban company",
    "urbancompany",
    "crossword",
    "hamleys",
  ],
  Transport: [
    "ola",
    "uber",
    "rapido",
    "namma yatri",
    "auto fare",
    "irctc",
    "redbus",
    "makemytrip",
    "goibibo",
    "ixigo",
    "indigo",
    "air india",
    "vistara",
    "akasa air",
    "spicejet",
    "airasia",
    "fastag",
    "hp pay",
    "indian oil",
    "iocl",
    "bharat petroleum",
    "bpcl",
    "hindustan petroleum",
    "hpcl",
    "shell petrol",
    "nayara energy",
    "reliance petrol",
    "essar oil",
    "jio-bp",
    "toll plaza",
    "parking fee",
    "metro recharge",
    "delhi metro",
    "mumbai metro",
    "bangalore metro",
    "bmtc",
    "best bus",
    "redbus ticket",
    "blusmart",
    "blu smart",
    "yulu",
    "bounce",
    "zoomcar",
    "revv",
    "rentomojo mobility",
    "vehicle service",
    "car wash",
    "wheel alignment",
    "driving school",
    "rto fee",
    "bike service",
  ],
  Bills: [
    "jio",
    "airtel",
    "vi",
    "vodafone idea",
    "bsnl",
    "act fibernet",
    "hathway",
    "tata play",
    "dish tv",
    "sun direct",
    "electricity board",
    "bescom",
    "tneb",
    "tangedco",
    "mseb",
    "mahadiscom",
    "bseb",
    "uppcl",
    "delhi electricity",
    "power bill",
    "adani electricity",
    "torrent power",
    "cesc",
    "bajaj gas",
    "indane gas",
    "bharat gas",
    "hp gas",
    "mahanagar gas",
    "igl gas",
    "adani gas",
    "water bill",
    "municipal tax",
    "property tax",
    "broadband bill",
    "wifi bill",
    "mobile recharge",
    "postpaid bill",
    "prepaid recharge",
    "dth recharge",
    "gas cylinder",
    "piped gas",
    "lic premium",
    "insurance premium",
    "hdfc life",
    "icici prudential",
    "star health",
    "policybazaar",
    "phonepe billpay",
    "google pay bill",
    "electricity recharge",
    "maintenance charge",
  ],
  Education: [
    "school fees",
    "school fee",
    "tuition fee",
    "tuition classes",
    "byjus",
    "unacademy",
    "vedantu",
    "coursera",
    "udemy",
    "upgrad",
    "simplilearn",
    "edureka",
    "physics wallah",
    "pw app",
    "allen institute",
    "aakash institute",
    "fiitjee",
    "school transport",
    "college fees",
    "university fee",
    "exam fee",
    "ncert books",
    "book store",
    "school supplies",
    "extramarks",
    "toppr",
    "khan academy",
    "skillshare",
    "linkedin learning",
    "great learning",
    "school uniform",
    "daycare fee",
    "preschool fee",
    "kindergarten",
    "campus fees",
    "hostel fee",
    "library fee",
    "computer class",
    "coding class",
    "music class",
    "dance class",
    "language course",
    "training course",
    "educational books",
    "textbook",
    "stationery",
    "notebook",
    "school app",
    "schoolerp",
    "school portal",
    "college admission",
  ],
  Healthcare: [
    "apollo pharmacy",
    "apollo 24 7",
    "pharmeasy",
    "1mg",
    "tata 1mg",
    "netmeds",
    "medplus",
    "practo",
    "healthians",
    "thyrocare",
    "dr lal pathlabs",
    "lal path labs",
    "metropolis labs",
    "fortis hospital",
    "apollo hospital",
    "max hospital",
    "manipal hospital",
    "narayana health",
    "aiims",
    "clinic visit",
    "doctor consultation",
    "dentist",
    "dental clinic",
    "eye clinic",
    "optical shop",
    "medical store",
    "pharmacy",
    "medicine",
    "medicines",
    "diagnostic lab",
    "blood test",
    "vaccination",
    "health checkup",
    "health check-up",
    "cult fit",
    "cultfit",
    "fittr",
    "gym membership",
    "physiotherapy",
    "practo consult",
    "mfine",
    "1mg labs",
    "medibuddy",
    "healthkart",
    "wellness forever",
    "guardian pharmacy",
    "apollo clinic",
    "hospital bill",
    "ambulance",
    "ayurveda clinic",
    "homeopathy clinic",
    "chemist",
  ],
  Entertainment: [
    "netflix",
    "hotstar",
    "disney hotstar",
    "spotify",
    "youtube premium",
    "amazon prime video",
    "prime video",
    "zee5",
    "sonyliv",
    "jiocinema",
    "apple tv",
    "apple music",
    "wynk music",
    "gaana",
    "jiosaavn",
    "audible",
    "bookmyshow",
    "pvr cinemas",
    "inox",
    "cinepolis",
    "district app",
    "paytm movies",
    "wonderla",
    "imagica",
    "museum ticket",
    "concert ticket",
    "game pass",
    "playstation store",
    "xbox game pass",
    "steam",
    "epic games",
    "nintendo",
    "chess.com",
    "hotstar subscription",
    "crunchyroll",
    "voot",
    "aha video",
    "zee theatre",
    "prime membership",
    "youtube music",
    "saregama carvaan",
    "gaming cafe",
    "arcade",
    "bowling",
    "escape room",
    "live show",
    "movie ticket",
    "theatre ticket",
    "event ticket",
    "bookmyshow stream",
    "discovery plus",
  ],
};

export const MERCHANT_DICTIONARY: ReadonlyMap<string, string> = new Map(
  Object.entries(dictionaryGroups).flatMap(([category, merchants]) =>
    merchants.map((merchant) => [merchant, category] as const),
  ),
);

export function normalizeMerchant(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(?:upi|imps|neft|rtgs|pos|txn|ref|id|paid to|payment to)\b[:/\s-]*/g, " ")
    .replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\b/g, " ")
    .replace(/\b(?:\d[ -]*){5,}\b/g, " ")
    .replace(/\b(?:store|outlet|terminal|order|invoice|txn|ref)[\s#:-]*[a-z0-9-]+\b/g, " ")
    .replace(/\d+(?:\.\d+)?/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return row[right.length]!;
}

function similarity(left: string, right: string): number {
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    const shorter = Math.min(left.length, right.length);
    const longer = Math.max(left.length, right.length);
    return shorter >= 5 ? 0.9 : shorter / longer;
  }
  return 1 - editDistance(left, right) / Math.max(left.length, right.length, 1);
}

function activeCategoryId(categories: CategoryChoice[], name: string): string | null {
  const aliases: Record<string, string[]> = {
    Food: ["Food", "Dining & delivery", "Dining", "Restaurants"],
    Groceries: ["Groceries", "Grocery", "Household"],
    Shopping: ["Shopping", "Clothing", "Retail"],
    Transport: ["Transport", "Travel", "Commute"],
    Bills: ["Bills", "Utilities", "Household bills"],
    Education: ["Education", "School", "Learning"],
    Healthcare: ["Healthcare", "Health", "Medical"],
    Entertainment: ["Entertainment", "Subscriptions", "Leisure"],
  };
  const names = aliases[name] ?? [name];
  return (
    categories.find((category) =>
      names.some((candidate) => category.name.toLowerCase() === candidate.toLowerCase()),
    )?.id ?? null
  );
}

function naiveBayes(
  text: string,
  examples: CategoryLearningPair[],
): { id: string; confidence: number } | null {
  const words = normalizeMerchant(text)
    .split(" ")
    .filter((word) => word.length > 1);
  const categories = [...new Set(examples.map((example) => example.categoryId))];
  if (!words.length || !categories.length) return null;
  const vocabulary = new Set(
    examples.flatMap((example) => normalizeMerchant(example.text).split(" ")),
  );
  const scores = categories
    .map((categoryId) => {
      const examplesInCategory = examples.filter((example) => example.categoryId === categoryId);
      let score = Math.log(examplesInCategory.length / examples.length);
      for (const word of words) {
        const count = examplesInCategory.reduce(
          (total, example) =>
            total + Number(normalizeMerchant(example.text).split(" ").includes(word)),
          0,
        );
        score += Math.log((count + 1) / (examplesInCategory.length + vocabulary.size));
      }
      return { categoryId, score };
    })
    .sort((a, b) => b.score - a.score);
  const probabilities = scores.map((item) => Math.exp(item.score - scores[0]!.score));
  const confidence = probabilities[0]! / probabilities.reduce((sum, value) => sum + value, 0);
  return { id: scores[0]!.categoryId, confidence };
}

export async function categorize(
  text: string,
  context: CategorizerContext,
): Promise<CategorySuggestion> {
  const key = normalizeMerchant(text);
  if (!key || !context.categories.length)
    return { categoryId: null, confidence: 0, source: "NONE" };
  const categories = new Set(context.categories.map((category) => category.id));

  const correction = context.corrections?.find((entry) => entry.merchantKey === key);
  if (correction && categories.has(correction.categoryId)) {
    return { categoryId: correction.categoryId, confidence: 1, source: "CORRECTION" };
  }

  const history = context.sharedHistory ?? [];
  const exact = history.filter(
    (entry) => normalizeMerchant(entry.text) === key && categories.has(entry.categoryId),
  );
  const privateHistory = (context.ownPrivateHistory ?? []).filter((entry) =>
    categories.has(entry.categoryId),
  );
  if (exact.length) {
    const counts = new Map<string, number>();
    for (const entry of exact)
      counts.set(entry.categoryId, (counts.get(entry.categoryId) ?? 0) + 1);
    const [categoryId, count] = [...counts].sort((a, b) => b[1] - a[1])[0]!;
    return { categoryId, confidence: count / exact.length, source: "FAMILY_HISTORY" };
  }

  let best: { merchant: string; category: string; score: number } | undefined;
  for (const [merchant, category] of MERCHANT_DICTIONARY) {
    const score = similarity(key, merchant);
    if (score > (best?.score ?? 0)) best = { merchant, category, score };
  }
  if (best && best.score >= 0.72) {
    const categoryId = activeCategoryId(context.categories, best.category);
    if (categoryId)
      return { categoryId, confidence: Math.min(0.99, best.score), source: "DICTIONARY" };
  }

  const learned = naiveBayes(text, [...history, ...privateHistory]);
  if (learned && learned.confidence >= 0.55) {
    return { categoryId: learned.id, confidence: learned.confidence, source: "NAIVE_BAYES" };
  }

  if (context.suggestWithLlm) {
    const categoryId = await context.suggestWithLlm(text, context.categories);
    if (categoryId && categories.has(categoryId)) {
      return { categoryId, confidence: 0.6, source: "LLM" };
    }
  }
  return { categoryId: null, confidence: 0, source: "NONE" };
}
