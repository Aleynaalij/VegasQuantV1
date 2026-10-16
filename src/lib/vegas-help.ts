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
  {
    id: "navigation",
    title: "Where do I start in the redesigned app?",
    category: "App guide",
    phrases: [
      "navigation",
      "tabs",
      "analysis tab",
      "redesigned app",
      "where do i start",
      "new app",
    ],
    answer:
      "Home shows the next kickoff, game research, Pick of the Day and the separate Hail Mary feature. The Zone is the main analyst feed and research hub. Community is for member slips and discussion. Records opens with your tailed picks; Account manages profile, access, notifications and deletion. The sport switch at the top changes between NFL and NBA.",
    href: "/feed",
    link: "Start in The Zone",
  },
  {
    id: "nba",
    title: "How do I switch to NBA?",
    category: "App guide",
    phrases: ["nba", "basketball", "sport switch", "switch sports"],
    answer:
      "Use the NFL / NBA tabs at the top. NBA has its own Home, analysis, Zone, Records and rules pages. It is in preparation: discussion and research foundations are available, but pregame picks will not publish until the NBA regular season starts. NFL publications and histories stay separate.",
    href: "/nba",
    link: "Open NBA",
  },
  {
    id: "pick-of-day",
    title: "What is Pick of the Day?",
    category: "App guide",
    phrases: ["pick of the day", "pick of day", "pod"],
    answer:
      "Pick of the Day is the single strongest supported editorial selection featured on Home. Ordinary Legs we like belong in The Zone. Hail Mary has its own separate Home slot. Pick of the Day is not automatically an OFFICIAL wager or a validated edge; read the target, source times, case and risks.",
    href: "/",
    link: "View Home features",
  },
  {
    id: "hail-mary",
    title: "What is the Hail Mary?",
    category: "App guide",
    phrases: ["hail mary", "hailmary"],
    answer:
      "Hail Mary is a separate featured ticket on Home. It is distinct from Pick of the Day and individual liked legs. A parlay needs every included leg to settle successfully under the sportsbook rules; correlated legs have shared failure paths. Original published tickets and prices are preserved, and later observations do not rewrite them.",
    href: "/",
    link: "Open Home",
  },
  {
    id: "moderation",
    title: "How do I report or block someone?",
    category: "App guide",
    phrases: ["report", "block", "moderation", "harassment", "scam"],
    answer:
      "Use the report or block controls on member posts in Community. Reporting submits content for moderation; it does not guarantee immediate removal. Blocking hides that member\u2019s posts and comments from your community feed, and blocked members can be managed there. Keep discussion respectful: threats, scams and guaranteed-return claims are prohibited. Member-reported wins are not verified Vegas Quant picks.",
    href: "/community",
    link: "Open Community",
  },
  {
    id: "account-deletion",
    title: "How do I delete my account?",
    category: "App guide",
    phrases: [
      "delete account",
      "delete my account",
      "account deletion",
      "erase account",
    ],
    answer:
      "Open Account \u2192 Delete account, enter your current password and type DELETE. Successful deletion removes your account data and cancels linked recurring memberships; it is not a refund. Published analyst history is retained with personal attribution handled separately. Administrators must transfer their role before deletion. Ask Vegas cannot delete an account for you.",
    href: "/membership",
    link: "Open account deletion",
  },
  {
    id: "age-verification",
    title: "How does age verification work?",
    category: "App guide",
    phrases: [
      "age verification",
      "verify my age",
      "verify age",
      "21",
      "age check",
    ],
    answer:
      "Vegas Quant is for adults 21+. The verification flow is prepared under Account, but mandatory enforcement is not activated yet. When enabled after launch checks, new and existing accounts will need the age check; a birthday checkbox alone is not proof. Follow the secure verification screen rather than sending identity documents to Ask Vegas or posting them in Community. Current rollout instructions appear on the verification page.",
    href: "/account/verify-age",
    link: "Open age verification",
  },
  {
    id: "support",
    title: "Who operates Vegas Quant and where is support?",
    category: "App guide",
    phrases: [
      "support",
      "journeybuilt",
      "llc",
      "privacy",
      "terms",
      "faq",
      "disclaimer",
    ],
    answer:
      "Vegas Quant is a product of JourneyBuilt, LLC. Help and legal links are available in the footer: About, FAQs, Support, Privacy, Terms and Responsible play. Use Support for the currently available contact route; do not assume an email inbox or SMS support is active. Ask Vegas cannot inspect accounts or payments.",
    href: "/support",
    link: "Open Help & Support",
  },
  {
    id: "free-premium",
    title: "What is free and what is Premium?",
    category: "Account & access",
    phrases: [
      "free features",
      "paid features",
      "premium",
      "free versus paid",
      "free picks",
    ],
    answer:
      "The Zone contains published picks and analyst updates; Community is for member posts, comments and follows. Signed-in members can save and tail published picks and view their personal Records. Premium unlocks detailed research. New accounts receive a 14-day Premium trial with no card or automatic charge; current paid plans and access status appear in Account. NBA is in preparation, with no pregame picks until its regular season begins. No daily pick, outcome or profit is promised.",
    href: "/membership",
    link: "Compare access options",
  },
  {
    id: "community",
    title: "How do community profiles work?",
    category: "Start here",
    phrases: [
      "community",
      "profile",
      "avatar",
      "username",
      "run card",
      "share card",
      "instagram",
      "region",
    ],
    answer:
      "Community is where members post tickets, discuss games and follow each other. Manage your username, optional photo and profile visibility under Account settings. Your email, bets and balance stay private. The Zone contains Vegas Quant research. Tail a published pick before kickoff to add it to your personal Records; verified outcomes appear there without assumed wager amounts.",
    href: "/community",
    link: "Open Community",
  },
  {
    id: "payout-pending",
    title: "My payout has not cleared. Do I miss the next stage?",
    category: "Personal Records",
    phrases: [
      "payout pending",
      "funds cleared",
      "payout",
      "late payout",
      "missed window",
      "pause my run",
      "settlement delay",
    ],
    answer:
      "Vegas Quant does not hold betting funds or control sportsbook payouts. The 5-Spot Challenge and its pause/resume controls have been retired. Check your sportsbook directly for settlement and payment delays. Past recorded wagers remain under Records → Previous recorded wager history; a delayed payout is not a new loss.",
    href: "/history",
    link: "Review previous wagers",
  },
  {
    id: "alerts",
    title: "How do official decision alerts work?",
    category: "Account",
    phrases: ["alerts", "push notifications", "notify me", "notifications"],
    answer:
      "Sign in and open Account → App notifications. Enable alerts on each device. On iPhone, install Vegas Quant on your Home Screen first. New official publications trigger a generic notification with no pick or bankroll details on your lock screen. Delivery depends on your browser and device; research updates are separate from official decisions. Disable alerts in Account.",
    href: "/membership",
    link: "Manage alerts",
  },
  {
    id: "install",
    title: "How do I install Vegas Quant?",
    category: "Account",
    phrases: ["install", "home screen", "app store", "download app"],
    answer:
      "Use Install app at the top of the site. On iPhone, open Safari, tap Share, then Add to Home Screen. Android browsers may offer an installation prompt. The installed app needs an internet connection for current research, prices and account tools. Updates are offered inside the app.",
    href: "/membership",
    link: "Open Account",
  },
  {
    id: "recovery",
    title: "I forgot my password",
    category: "Account",
    phrases: ["forgot password", "reset password", "recover account"],
    answer:
      "Open Account, enter your email and tap Forgot password. Use the newest reset email and check spam. Requests can be rate limited to protect accounts. Never share passwords or reset links with Ask Vegas.",
    href: "/membership",
    link: "Recover your account",
  },
  {
    id: "methodology",
    title: "Are the edges guaranteed?",
    category: "Research",
    phrases: ["calibration", "methodology", "guaranteed edge", "proof"],
    answer:
      "No. Analyst probabilities are estimates, not guarantees or independently calibrated predictions. Public Records includes every published decision and flags missing closing data. The methodology page explains edge, uncertainty and CLV. An unavailable defensible estimate means WAIT or PASS.",
    href: "/methodology",
    link: "Read the methodology",
  },
  {
    id: "community-posting",
    title: "How do I share a slip?",
    category: "Start here",
    phrases: [
      "community",
      "share slip",
      "post parlay",
      "follow members",
      "comment",
    ],
    answer:
      "Open Community to share an NFL slip, discuss a game, or post a member-reported result. Add a photo optionally, preview it and add a caption. JPG, PNG and WebP images under 5 MB are supported; cover private ticket details first. A slip photo can replace typed selections. Tap the published image to open it at full size. Sign in and complete your visible profile first. You can comment, react and follow members. Member posts are separate from Vegas Quant analyst picks; no social action records a wager. NBA is discussion-only during preparation.",
    href: "/community",
    link: "Join Community",
  },
  {
    id: "parlay-builder",
    title: "How do I create my own parlay?",
    category: "App guide",
    phrases: [
      "create parlay",
      "create my own parlay",
      "custom parlay",
      "parlay builder",
      "recommended sticker",
      "3 percent edge",
    ],
    answer:
      "In The Zone, open Parlays and tap Create parlay. Choose 2–7 upcoming player legs from this week’s published research, remove any you do not want, name your combination and save. Your parlays are private and do not place wagers or change your tail record. Copy parlay & open Gambly copies only player names and stat lines. Combined odds are unknown until your sportsbook prices the ticket. The Legs tab is the weekly library, including individual legs from published tickets and closed selections. Published research is not automatically recommended: the sticker needs a current accepted publishing check and an approved model showing at least a three-percentage-point edge. SHADOW_ONLY estimates cannot earn it.",
    href: "/feed?view=parlays",
    link: "Create your parlay",
  },
  {
    id: "feed",
    title: "What is the Feed?",
    category: "Start here",
    phrases: [
      "feed",
      "watchlist",
      "what we are watching",
      "what are we eyeing",
      "latest thoughts",
    ],
    answer:
      "Open The Zone for game research and short analyst updates: matchup watchlists, injury watches, observed prices and the next items to check. Read What changed, Why it matters and Next check; open Sources & uncertainty for context or Open matchup research for the full notebook. Feed posts are timestamped and preserved. Watching a market does not make it an official play. Detailed feed content requires research access.",
    href: "/feed",
    link: "Open The Zone",
  },
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
      "Vegas Quant is a sports research and community platform operated by JourneyBuilt, LLC. Home highlights the next kickoff, Pick of the Day and a separate Hail Mary. The Zone holds analyst research and Legs we like. Community lets members share slips and discuss games. Records shows the picks you tail and retains the published history. Use the NFL/NBA switch at the top; NBA is being prepared and is not publishing pregame picks yet. It is research, not a sportsbook.",
    href: "/",
    link: "Explore Vegas Quant",
  },
  {
    id: "challenge",
    title: "What happened to the 5-Spot Challenge?",
    category: "Start here",
    phrases: ["5 spot", "five spot", "challenge", "stages", "ladder"],
    answer:
      "The challenge has been retired from the member experience. Past published picks and outcomes remain in the historical ledger. Home now focuses on current research, Pick of the Day and Hail Mary.",
    href: "/history",
    link: "Open Records",
  },
  {
    id: "join",
    title: "How do I track picks I tail?",
    category: "Start here",
    phrases: [
      "join",
      "tail",
      "follow along",
      "my record",
      "my tailed picks",
      "start my run",
    ],
    answer:
      "Sign in and tap I’m tailing on a published pick before kickoff. Records → My tailed picks shows its verified published outcome: win, loss, push, void or pending. Existing tails are included. You can cancel a tail before kickoff; once started it stays on your record, including losses. Saving or copying a pick is separate from tailing. No wager, stake or profit is assumed.",
    href: "/history",
    link: "Open my Records",
  },
  {
    id: "home",
    title: "What belongs on Home?",
    category: "Find your way",
    phrases: ["home", "homepage", "home screen", "full slip", "official slip"],
    answer:
      "Home shows the next kickoff, current game research, Pick of the Day and the separate Hail Mary feature. The Zone holds the research updates and picks. Records tracks your tailed picks and preserves the published history.",
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
      "Start in The Zone for research updates, injury watches and Legs we like. Home → Open game research or Full board opens the game notebook and searchable slate. Each notebook groups sources, availability, weather, market observations and target legs, with prior analysis versions retained. Timestamps identify the observation; a historical quote is not a current executable price. Detailed research depends on account access.",
    href: "/feed",
    link: "Open The Zone",
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
      "Potential targets are research candidates, with role, injury or weather blockers still to check. Legs we like are editorial selections; an analyst-selected stat target is separate from a verified sportsbook line. Pick of the Day is one editorial feature on Home, not automatically an OFFICIAL or qualifying-edge release. Research targets do not reserve money or create a wager.",
    href: "/feed",
    link: "Read picks and watch targets",
  },
  {
    id: "pass",
    title: "Why is there no pick?",
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
      "A watch target is not a finalized pick. We may publish no selection when role, availability, sources or matchup evidence are insufficient. Qualitative Legs we like can be unpriced, with analyst stat targets clearly separated from sportsbook lines. The three-percentage-point requirement applies to qualifying-edge releases, not every qualitative liked leg. A desired parlay leg count does not justify forcing picks.",
    href: "/feed",
    link: "Read the latest research",
  },
  {
    id: "copy",
    title: "How do I copy a pick?",
    category: "Use a slip",
    phrases: ["copy", "clipboard", "paste", "copy pick"],
    answer:
      "On a published card in The Zone, use its Copy / Gambly control. Copy the selection text, open Gambly and paste it when prompted; do not assume the external service automatically inserts or finds the exact market. Verify every player, target, sportsbook price and rule there. Copying, saving and opening Gambly do not place a bet or add a tail. Tap I’m tailing separately to add the publication to your Records.",
    href: "/feed",
    link: "Open cards in The Zone",
  },
  {
    id: "share",
    title: "How do sharing and screenshots work?",
    category: "Use a slip",
    phrases: [
      "download card",
      "download this page",
      "export card",
      "share",
      "screenshot",
      "watermark",
      "share card",
    ],
    answer:
      "Use Download card on supported published cards in The Zone. It generates watermarked Vegas Quant images in phone-sized 9:16 pages; browse the pages and choose Download this page or the available multi-page export. This is a designed card, not a long page screenshot. Member slips can be posted separately in Community. A watermark identifies the brand but cannot prevent screenshots or copying.",
    href: "/feed",
    link: "Download a published card",
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
      "Vegas Quant is research and community, not a sportsbook. It does not place bets, accept betting deposits, hold gambling funds or confirm sportsbook acceptance. Copy/Gambly helps transfer selection text to an external service; confirm the exact market, rules and price there. Tailing adds a published selection to your Records, without assuming a wager or stake.",
    href: "/feed",
    link: "Review published selections",
  },
  {
    id: "bankroll",
    title: "How do I update my bankroll?",
    category: "Personal Records",
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
      "The old challenge bankroll controls have been retired from Home. My tailed picks in Records tracks followed selections and verified outcomes without assuming a stake, balance or profit. Previous recorded wagers remain accessible separately in Records. Vegas Quant cannot see your sportsbook balance and does not manage betting funds.",
    href: "/history",
    link: "Open personal Records",
  },
  {
    id: "entry",
    title: "How do I record a wager I already placed?",
    category: "Personal Records",
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
      "Tap I’m tailing before kickoff to track a published selection in My tailed picks. This records following that exact published target, not a sportsbook wager or your actual odds and stake. The retired challenge entry form is no longer on Home. Older recorded entries remain under Previous recorded wager history. Check your sportsbook for actual tickets and balances.",
    href: "/history",
    link: "Open personal Records",
  },
  {
    id: "correction",
    title: "I entered the wrong odds or stake",
    category: "Personal Records",
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
      "Original publications and previous recorded wagers are preserved. The old challenge correction controls are no longer on Home. Review your previous recorded wager history in Records and use Support for an incorrect historical entry. Ask Vegas cannot edit grades, wagers or your account. You can cancel a current tail before kickoff; started tails remain recorded.",
    href: "/support",
    link: "Get help with a historical entry",
  },
  {
    id: "settlement",
    title: "When does my result or balance update?",
    category: "Personal Records",
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
      "Supported published NFL full-game player yardage and reception legs are checked automatically every five minutes. Live target reached is provisional; final Records update after ESPN final stats match nflverse weekly stats. Missing, conflicting or unsupported results remain pending; a final score alone does not settle every player prop. A different sportsbook number may settle differently. Tail results do not change a bankroll or invent profit. Older recorded wagers retain their separate settlement records.",
    href: "/history",
    link: "Check my tailed picks",
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
      "Records opens with My tailed picks: only the published selections you have tailed, using verified outcomes. Unverified or unavailable publications remain pending. It does not calculate winnings from a tail. Previous recorded wager history preserves your older actual entries separately. Expand Vegas Quant published record & historical ledger to review the platform record, archived challenge picks, source results and the historical ledger export. Performance summarizes platform publications, not your personal bets.",
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
      "A qualifying edge compares a documented estimate with the comparison market probability in percentage points. Qualitative liked legs are editorial stat targets and do not claim validated EV, confidence scores or numerical edge. Experimental SHADOW_ONLY output is not validated or BETTABLE. The three-point threshold does not apply to merely displaying a defensible qualitative liked leg. Missing estimates remain unknown.",
    href: "/methodology",
    link: "Read the research standards",
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
      "Use Account for the single sign-in flow. Visitors can see published picks, edge cards and official results. Free accounts add Community and personal tracking; detailed research requires Premium access. Your account page shows your pass or subscription status. If you are signed in but research stays locked, check that you used the correct email and that access is active, then refresh. Ask Vegas cannot look up accounts or grant access.",
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
  if (/^what is (the )?pick of (the )?day$/.test(q.trim()))
    return helpTopics.find((t) => t.id === "pick-of-day")!;
  // Actual predictions/selection advice always route away, including compound prompts.
  if (
    /\b(who (will|wins|should win)|should i (bet|tail|play|take)|best (bet|pick|prop)|what (is|are|s) (the |your |our )?(pick|play|lean)|will .* (hit|win|cover)|predict|build (me )?(a )?parlay|cash out|lock of|tonights pick|todays pick)\b/.test(
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
    "I explain the platform; I do not analyze games or provide live odds. Open The Zone for analyst research and Legs we like. Home features Pick of the Day and the separate Hail Mary. Check source times, targets and risks; an analyst stat target is not a verified sportsbook quote.",
  href: "/feed",
  link: "Open The Zone",
};
