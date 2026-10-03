// Public product documentation only. Never place member research, secrets or live prices here.
export type HelpTopic = {
  id: string;
  title: string;
  category: string;
  phrases: string[];
  answer: string;
  href: string;
  link: string;
};
export const helpTopics: HelpTopic[] = [
 {id:"alerts",title:"How do official decision alerts work?",category:"Account",phrases:["alerts","push notifications","notify me","notifications"],answer:"Sign in and open Account → App notifications. Enable alerts on each device. On iPhone, install Vegas Quant on your Home Screen first. New official publications trigger a generic notification with no pick or bankroll details on your lock screen. Delivery depends on your browser and device; research updates are separate from official decisions. Disable alerts in Account.",href:"/membership",link:"Manage alerts"},
 {id:"install",title:"How do I install Vegas Quant?",category:"Account",phrases:["install","home screen","app store","download app"],answer:"Use Install app at the top of the site. On iPhone, open Safari, tap Share, then Add to Home Screen. Android browsers may offer an installation prompt. The installed app needs an internet connection for current research, prices and account tools. Updates are offered inside the app.",href:"/membership",link:"Open Account"},
 {id:"recovery",title:"I forgot my password",category:"Account",phrases:["forgot password","reset password","recover account"],answer:"Open Account, enter your email and tap Forgot password. Use the newest reset email and check spam. Requests can be rate limited to protect accounts. Never share passwords or reset links with Ask Vegas.",href:"/membership",link:"Recover your account"},
 {id:"methodology",title:"Are the edges guaranteed?",category:"Research",phrases:["calibration","methodology","guaranteed edge","proof"],answer:"No. Analyst probabilities are estimates, not guarantees or independently calibrated predictions. Public Records includes every published decision and flags missing closing data. The methodology page explains edge, uncertainty and CLV. An unavailable defensible estimate means WAIT or PASS.",href:"/methodology",link:"Read the methodology"},
  { id: "feed", title: "What is the Feed?", category: "Start here", phrases: ["feed", "watchlist", "what we are watching", "what are we eyeing", "latest thoughts"], answer: "Open the center VQ logo tab for short analyst updates: matchup watchlists, injury watches, observed prices and the next items to check. Read What changed, Why it matters and Next check; open Sources & uncertainty for context or Open matchup research for the full notebook. Feed posts are timestamped and preserved. Watching a market does not make it an official play. Detailed feed content requires research access.", href: "/feed", link: "Open the Feed" },
  {
    id: "purpose",
    title: "What is Vegas Quant?",
    category: "Start here",
    phrases: [
      "what is vegas quant",
      "what is this",
      "purpose",
      "value",
      "worth",
      "how does this app work",
      "how it works",
      "what does this do",
      "get started",
    ],
    answer:
      "Vegas Quant is an NFL research and decision-tracking platform. The value is seeing the reasoning, the original price, what changed, and what we learned—not just a list of picks. The 5-Spot Challenge gives that process a five-stage format. Results, price quality and decision quality stay on record. It is entertainment and analysis; no outcome or profit is guaranteed.",
    href: "/",
    link: "Explore the challenge",
  },
  {
    id: "challenge",
    title: "How does the 5-Spot Challenge work?",
    category: "Start here",
    phrases: [
      "5 spot",
      "five spot",
      "challenge",
      "stages",
      "ladder",
      "640",
      "five games",
    ],
    answer:
      "The five windows are Thursday night, one Sunday 1 PM game, one Sunday late-afternoon game, Sunday night and Monday night. The suggested start is $20, but your run can use a different starting amount. The roughly $640 path is aspirational. Actual progression uses recorded stakes and odds. A stage can be passed; five scheduled windows do not mean five mandatory wagers.",
    href: "/",
    link: "See your run",
  },
  {
    id: "join",
    title: "How do I join or follow a run?",
    category: "Start here",
    phrases: [
      "join",
      "sign up for challenge",
      "start my run",
      "follow along",
      "check in",
      "check-in",
      "run settings",
    ],
    answer:
      "Sign in through Account, then open Home and use the challenge’s join or Run settings controls. Following a stage is a check-in, not proof that you placed a wager. To track real results, enter your bankroll and record your actual entry separately. You can follow the research without placing a bet.",
    href: "/",
    link: "Open Home",
  },
  {
    id: "home",
    title: "What belongs on Home?",
    category: "Find your way",
    phrases: ["home", "homepage", "home screen", "full slip", "official slip"],
    answer:
      "Home is your challenge hub: the published official leg, its full slip, stage progress and your personal run. Read the publication time and the price on the slip. Open Matchup for the deeper research, or Records for historical outcomes. A lean in research is not an official challenge leg.",
    href: "/",
    link: "Open Home",
  },
  {
    id: "matchups",
    title: "How do I find a game’s analysis?",
    category: "Find your way",
    phrases: [
      "matchup",
      "research",
      "notebook",
      "search games",
      "directory",
      "every game",
      "intel",
    ],
    answer:
      "Open Matchup and search for the team or game. Each game groups its market snapshot, model notes, availability, weather, bias checks and target board into expandable sections. Use the update history to review earlier versions. A snapshot is timestamped research, not a promise of a currently available price. Detailed research requires account access.",
    href: "/matchups",
    link: "Open Matchup",
  },
  {
    id: "targets",
    title: "Is a potential leg an official pick?",
    category: "Understand the research",
    phrases: [
      "potential leg",
      "target",
      "lean",
      "watch",
      "wait",
      "injury dependent",
      "weather dependent",
      "not official",
    ],
    answer:
      "No. Potential legs are research candidates. WATCH, WAIT, injury-dependent and weather-dependent labels tell you what still needs checking. A review number is not automatically a playable price. Only an explicitly published OFFICIAL PLAY enters the official challenge record. Targets do not reserve your bankroll or create a wager.",
    href: "/matchups",
    link: "Read the target board",
  },
  {
    id: "pass",
    title: "Why did the challenge pass or pause?",
    category: "Understand the research",
    phrases: [
      "pass",
      "pause",
      "no bet",
      "no pick",
      "not betting",
      "forced",
      "why no play",
    ],
    answer:
      "A pass is intentional. The analyst may pass when supported edge is below 3 percentage points, price value has disappeared, or injury, weather or data uncertainty is too high. A paused stage leaves the bankroll unchanged. There is no random replacement simply to keep the challenge moving.",
    href: "/matchups",
    link: "Read the current decision",
  },
  {
    id: "copy",
    title: "How do I copy a pick?",
    category: "Use a slip",
    phrases: ["copy", "clipboard", "paste", "copy pick"],
    answer:
      "On Home, find the OFFICIAL PLAY slip and tap Copy Pick. It copies the published selection, odds and stake. If your browser blocks clipboard access, a text box appears: select its text and copy manually. Copying does not place a wager or create a personal entry. The copied stake is the published stake, which may differ from yours.",
    href: "/",
    link: "Go to the official slip",
  },
  {
    id: "share",
    title: "How do sharing and screenshots work?",
    category: "Use a slip",
    phrases: ["share", "screenshot", "watermark", "share card"],
    answer:
      "Use the share controls available on your run or slip. Official pick share cards are currently restricted to admins. Access to member research does not automatically give public sharing permission. A watermark identifies content; a website cannot reliably block or detect every screenshot. Ask Vegas does not monitor screenshots.",
    href: "/",
    link: "Open your run",
  },
  {
    id: "sportsbook",
    title: "Does this app place bets for me?",
    category: "Use a slip",
    phrases: [
      "place a bet",
      "place bets",
      "sportsbook",
      "fanduel",
      "draftkings",
      "draft kings",
      "gambly",
      "bet this",
      "bet slip",
      "betslip",
    ],
    answer:
      "Vegas Quant records research and entries; it does not place a wager, hold your betting funds or confirm sportsbook acceptance. Copy Pick copies text only. Informational market links do not execute a bet. If you already placed a wager elsewhere, record the actual line, odds and stake on Home. Never assume a later sportsbook price matches the published slip.",
    href: "/",
    link: "Open the slip and your run",
  },
  {
    id: "bankroll",
    title: "How do I update my bankroll?",
    category: "Your run",
    phrases: [
      "bankroll",
      "starting amount",
      "20 dollars",
      "different amount",
      "enter my money",
      "balance",
      "formula",
    ],
    answer:
      "On Home, enter your starting bankroll. $20 is suggested, not required. Your one personal path uses the entries you actually record. Use Update bankroll beside your balance to enter a new total and choose deposit, withdrawal, or balance correction. Each adjustment is preserved separately from bet results. Bankroll equals starting amount plus adjustments plus settled profit/loss; available funds exclude stakes still in play. An “if win” value is only a possible outcome. Saving a starting amount does not automatically place or record future bets.",
    href: "/",
    link: "Manage your bankroll",
  },
  {
    id: "entry",
    title: "How do I record a wager I already placed?",
    category: "Your run",
    phrases: [
      "record",
      "actual entry",
      "tailed",
      "tailing",
      "i played",
      "my odds",
      "stake",
      "negative odds",
      "minus",
      "payout",
      "profit",
      "in play",
      "glow",
    ],
    answer:
      "After setting your bankroll on Home, use Record my actual entry for the current official leg. Enter your actual number, signed American odds (such as -110 or +120) and stake. Review the calculated profit and total return before saving. Total return includes your stake. An open recorded entry shows IN PLAY and highlights the bankroll. This is tracking only; the platform cannot verify your sportsbook ticket.",
    href: "/",
    link: "Record an actual entry",
  },
  {
    id: "correction",
    title: "I entered the wrong odds or stake",
    category: "Your run",
    phrases: [
      "wrong odds",
      "wrong stake",
      "mistake",
      "edit",
      "correction",
      "correct my",
      "delete bet",
    ],
    answer:
      "Use the entry correction controls available for your recorded entry. Corrections preserve an audit trail; they do not rewrite the analyst’s published recommendation. If the entry is locked or the correction option is unavailable, ask the platform administrator to review it. Ask Vegas cannot change your account or ledger.",
    href: "/",
    link: "Review your entry",
  },
  {
    id: "settlement",
    title: "When does my result or balance update?",
    category: "Your run",
    phrases: [
      "result",
      "settle",
      "settled",
      "won",
      "lost",
      "push",
      "void",
      "hit",
      "graded",
      "new bankroll",
    ],
    answer:
      "An entry remains open until its applicable result is graded. A win adds actual profit; a loss subtracts the recorded stake; a push or void returns the stake. Different recorded numbers can need separate grading, so an official win does not always mean your entry won. Source scores are not the same as a settled player prop. Check Records and your run for the recorded status.",
    href: "/history",
    link: "Open Records",
  },
  {
    id: "records",
    title: "What is in Records and Performance?",
    category: "Find your way",
    phrases: [
      "records",
      "ledger",
      "history",
      "performance",
      "roi",
      "win rate",
      "record",
      "export",
      "csv",
      "units",
    ],
    answer:
      "Records preserves official selections, entry and closing prices, stakes, results, profit/loss and process grades, including losses. Filters help narrow the ledger; Export downloads the available ledger. The Performance view summarizes settled outcomes and decision quality. Your personal bankroll on Home uses your actual entries, not the official stake. Empty statistics mean there is not enough recorded data yet.",
    href: "/history",
    link: "Open Records",
  },
  {
    id: "clv",
    title: "What do CLV and key numbers mean?",
    category: "Understand the research",
    phrases: [
      "clv",
      "closing line",
      "key number",
      "recommended line",
      "published price",
      "odds changed",
      "price changed",
    ],
    answer:
      "Closing-line value compares your entry with the closing market. Better entry value does not guarantee a win. Recommended, actual and closing numbers are stored separately; NFL margins such as 3 and 7 matter. A blank CLV field means the necessary closing data is missing or not comparable. Later prices never rewrite the original published price.",
    href: "/history",
    link: "Review price history",
  },
  {
    id: "edge",
    title: "What do edge, confidence and process grade mean?",
    category: "Understand the research",
    phrases: [
      "edge",
      "ev",
      "probability",
      "confidence",
      "risk",
      "process grade",
      "fear index",
      "true line",
      "fair line",
    ],
    answer:
      "Edge compares the analyst’s probability with the market’s implied probability, in percentage points. Confidence and risk are analyst assessments, not guarantees. A process grade reviews decision quality after the game, separately from winning or losing. Fair lines and Fear Index are research assessments, not a sportsbook’s internal data. Missing estimates stay blank rather than being invented.",
    href: "/matchups",
    link: "Read the analysis context",
  },
  {
    id: "updates",
    title: "Are odds, news and results live?",
    category: "Understand the research",
    phrases: [
      "live",
      "refresh",
      "updated",
      "update",
      "feed",
      "fresh",
      "automatic",
      "timestamp",
      "daily",
    ],
    answer:
      "Check each source timestamp and feed status. Connected schedule, score and news feeds can refresh automatically; that does not mean every odds, injury, closing-line or prop result is live. Analyst updates are separate timestamped versions. Ask Vegas has no live-data connection and cannot supply a current quote, injury update or result.",
    href: "/matchups",
    link: "Check timestamps in Matchup",
  },
  {
    id: "account",
    title: "How do I sign in or unlock research?",
    category: "Account & access",
    phrases: [
      "login",
      "log in",
      "sign in",
      "sign up",
      "register",
      "account",
      "locked",
      "unlock",
      "access",
      "cant see",
      "cannot see",
      "member",
    ],
    answer:
      "Use Account for the single sign-in flow. Visitors see the general platform; detailed research depends on your account’s access. Your account page shows your pass or subscription status. If you are signed in but research stays locked, check that you used the correct email and that access is active, then refresh. Ask Vegas cannot look up accounts or grant access.",
    href: "/membership",
    link: "Open Account",
  },
  {
    id: "billing",
    title: "How do pricing, renewal and cancellation work?",
    category: "Account & access",
    phrases: [
      "price",
      "cost",
      "pay",
      "billing",
      "subscription",
      "monthly",
      "season pass",
      "cancel",
      "refund",
      "charged",
      "checkout",
    ],
    answer:
      "Account shows the current plans and whether checkout is available. Monthly access renews until canceled; a season pass is for the stated season and includes its playoffs and Super Bowl. For an active monthly subscription, use Manage payment / cancel subscription on Account. Cancel before renewal to avoid the next charge; access continues through the paid period. If checkout is disabled, payment is not available. Ask the administrator about billing issues or refund requests.",
    href: "/membership",
    link: "Check plans and billing",
  },
  {
    id: "promo",
    title: "Where do I enter a friend code?",
    category: "Account & access",
    phrases: [
      "promo",
      "code for friends",
      "friend code",
      "friend pass",
      "free access",
      "redeem",
      "discount",
    ],
    answer:
      "Sign in and use the friend-pass redemption controls on Account. Codes have redemption limits and may no longer work once exhausted. Ask the person who supplied the code if it is invalid. Ask Vegas does not reveal private codes, generate passes or bypass access requirements.",
    href: "/membership",
    link: "Open friend-pass redemption",
  },
  {
    id: "security",
    title: "Why does admin require verification?",
    category: "Account & access",
    phrases: [
      "admin",
      "authenticator",
      "qr",
      "two step",
      "2fa",
      "mfa",
      "verify",
      "verification",
      "security",
      "password",
    ],
    answer:
      "Admins sign in through the same Account link, then complete the additional security verification for protected tools. On one phone, use the manual authenticator setup option instead of scanning your own screen. Never send passwords, setup secrets or verification codes to Ask Vegas. Admin tools cover publishing, accounts, activity, feeds and private Data Intelligence; this guide does not grant access.",
    href: "/membership",
    link: "Open account security",
  },
  {
    id: "intelligence",
    title: "What is private Data Intelligence?",
    category: "Understand the research",
    phrases: [
      "data intelligence",
      "market tape",
      "sharp consensus",
      "retail consensus",
      "public vs sharp",
      "news tape",
      "model vs market",
    ],
    answer:
      "This is the administrator’s research workspace: chronological market snapshots, sharp and retail comparisons, public/handle context, model comparisons, timestamped news and official-pick CLV. It is private. These are evidence and research tools, not proof of a sportsbook’s liability or certainty about sharp bettors. Members use Matchup for published analysis.",
    href: "/matchups",
    link: "Read published research",
  },
  {
    id: "trouble",
    title: "A tab, email or button is not working",
    category: "Account & access",
    phrases: [
      "not working",
      "unresponsive",
      "broken",
      "error",
      "rate limit",
      "rate exceeded",
      "email",
      "stuck",
      "loading",
    ],
    answer:
      "Try the direct destination below and refresh once. For locked research, check Account access. If email says rate limit exceeded, stop repeated resend attempts and try again later; ask the administrator if it persists. For other issues, note the page, button, device and exact error for the administrator. Ask Vegas cannot reset passwords, resolve payments or change email limits.",
    href: "/membership",
    link: "Check Account",
  },
];

export function normalizeHelp(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
export function findHelp(question: string): HelpTopic | null {
  const q = ` ${normalizeHelp(question)} `;
  if (!q.trim()) return null;
  // Actual predictions/selection advice always route away, including compound prompts.
  if (
    /\b(who (will|wins|should win)|should i (bet|tail|play|take)|best (bet|pick|prop)|what (is|are|s) (the |your |our )?(pick|play|lean)|will .* (hit|win|cover)|predict|parlay|cash out|lock of|tonights pick|todays pick)\b/.test(
      q,
    )
  )
    return pickHelp;
  const scored = helpTopics
    .map((topic) => ({
      topic,
      score: Math.max(
        0,
        ...topic.phrases.map((p) => {
          const phrase = normalizeHelp(p);
          return q.includes(` ${phrase} `)
            ? phrase.split(" ").length * 10 + phrase.length / 100
            : 0;
        }),
      ),
    }))
    .sort((a, b) => b.score - a.score);
  if (scored[0].score) return scored[0].topic;
  if (
    /\b(pick|picks|bet|bets|odds|under|over|steelers|browns|warren|touchdown|receiving|yards)\b/.test(
      q,
    )
  )
    return pickHelp;
  return null;
}
export const pickHelp: HelpTopic = {
  id: "pick-routing",
  title: "Looking for a pick or game update?",
  category: "Research",
  phrases: [],
  answer:
    "I explain the platform; I don’t analyze games, recommend wagers or provide live odds. Open Matchup for game research and potential legs. The current published OFFICIAL PLAY is on Home. Check its timestamp and original price—an informational target is not an official wager.",
  href: "/matchups",
  link: "Open Matchup research",
};
