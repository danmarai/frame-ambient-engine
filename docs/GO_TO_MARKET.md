# Curateur — Go-to-Market & Marketing Plan

**"An AI with impeccable taste, trained on yours."**

---

## 1. Executive Summary

Curateur is an AI-powered art curation app for Samsung Frame TVs that replaces Samsung's native Art Mode with a personalized, learning experience. Where Samsung offers a static library for $5.99/month, Curateur learns what you love through simple thumbs up/down ratings, generates original AI art matched to your taste, and auto-rotates your display based on preferences.

The product is live and working end-to-end on Samsung Frame TVs (2020+). The architecture consists of a thin Tizen TV app, a cloud backend, an Android companion app, and a web control panel. Distribution will be phased: direct/sideload first, then Samsung TV App Store and Google Play.

**Revenue model**: Freemium. Free tier with limited monthly art pushes; paid tier ($4.99/mo or $39.99/yr) with unlimited AI generation, priority rotation, and full library access.

**Primary insight**: Samsung Frame TV owners already pay for art. They are conditioned to the subscription model. We offer a better product at an equal or lower price point, with personalization Samsung cannot match.

---

## 2. Target Market & Customer Personas

### Market Size

- Samsung has sold 1M+ Frame TVs globally since 2017
- Samsung Art Store has ~500K subscribers (estimated at $5.99/mo = ~$36M ARR)
- The addressable market for Frame TV art alternatives is growing as new Frame models ship yearly

### Persona 1: "Frustrated Subscriber" (Primary)

**Who**: Current Samsung Art Mode subscriber, 30-50, homeowner
**Pain**: Pays $5.99/mo but the art rotation feels stale. Can't customize. Has scrolled through the same categories for months. Feels like paying for screensavers.
**Behavior**: Active on r/SamsungFrame, searches "Samsung Frame TV custom art" regularly
**Trigger**: Seeing the same painting for the third week in a row
**Quote**: "I'm paying six bucks a month for art I stopped noticing."

### Persona 2: "The Decorator" (Secondary)

**Who**: Interior design enthusiast, 25-45, likely has a curated Instagram feed
**Pain**: Wants their Frame TV to feel like gallery wall, not a Best Buy demo. Wants art that matches their aesthetic — mid-century, japandi, maximalist, whatever.
**Behavior**: Follows interior design accounts, uses Pinterest for mood boards
**Trigger**: Redecorating a room and wanting the TV to match
**Quote**: "I want my TV to feel like it belongs in the room, not fight against it."

### Persona 3: "The Tinkerer" (Early Adopter)

**Who**: Tech-forward smart home enthusiast, 28-45, likely male
**Pain**: Wants more control over their Frame TV. May have tried sideloading apps. Interested in AI/automation.
**Behavior**: Active on r/hometheater, r/smartHome, watches smart home YouTubers
**Trigger**: Discovering that Samsung's ecosystem is more open than expected
**Quote**: "Wait, you can actually push custom art to the Frame without Samsung's app?"

### Persona 4: "The Art Lover" (Niche, High-Value)

**Who**: Genuinely interested in art, may collect prints, visits galleries
**Pain**: Samsung's library is generic. Wants art that reflects their actual taste — not hotel lobby selections.
**Behavior**: Follows artists on Instagram, may use Artsy or Saatchi Art
**Trigger**: Hearing that AI can generate art in styles they love
**Quote**: "If it could learn that I like Rothko-adjacent color fields but not Mondrian, I'd pay double."

---

## 3. Competitive Analysis

| Feature         | Samsung Art Store    | Meural (Netgear)         | Cast-to-TV Apps     | **Curateur**               |
| --------------- | -------------------- | ------------------------ | ------------------- | -------------------------- |
| Price           | $5.99/mo             | $300-600 hardware + free | Free (ad-supported) | Free tier + $4.99/mo       |
| Personalization | None (manual browse) | Basic categories         | None                | AI-powered taste learning  |
| AI Generation   | No                   | No                       | No                  | **Yes**                    |
| Custom Upload   | Limited (phone only) | Yes                      | Yes (low quality)   | Yes (phone, web, batch)    |
| Auto-Rotation   | Time-based only      | Basic shuffle            | No                  | **Preference-weighted**    |
| Frame TV Native | Yes                  | No (separate hardware)   | Casting only        | **Yes (native Tizen app)** |
| Multi-art Cart  | No                   | No                       | No                  | **Yes**                    |
| Learning System | No                   | No                       | No                  | **Yes (thumbs up/down)**   |
| Web Control     | No                   | Yes                      | No                  | **Yes**                    |

### Key Competitive Advantages

1. **Only personalized art solution for Frame TV** — nobody else learns your taste
2. **AI generation** — infinite, unique art nobody else has on their wall
3. **Lower price than Samsung** for a better experience
4. **Works on existing hardware** — no separate device needed (vs. Meural)
5. **Batch push from curated library** — faster workflow than Samsung's one-at-a-time approach

---

## 4. Value Proposition & Positioning

### Core Value Proposition

> Stop paying Samsung for art you ignore. Curateur learns what you love and fills your Frame TV with art that actually belongs in your home.

### Positioning Statement

For Samsung Frame TV owners who are tired of generic art, Curateur is the AI art curator that learns your taste and generates personalized artwork for your wall. Unlike Samsung Art Store, Curateur gets better over time and creates art that is uniquely yours.

### Key Messages (by persona)

| Persona               | Message                                                 |
| --------------------- | ------------------------------------------------------- |
| Frustrated Subscriber | "Your Frame TV finally lives up to its name."           |
| The Decorator         | "Art that matches your room, not the other way around." |
| The Tinkerer          | "Full control. AI-powered. Open."                       |
| The Art Lover         | "A gallery that knows your taste better than you do."   |

### Elevator Pitch (30 seconds)

"You know how Samsung charges six bucks a month for Frame TV art that all looks the same? Curateur replaces that with an AI that learns what you like. You rate a few pieces — thumbs up, thumbs down — and it starts generating original art matched to your taste. It gets better every week. Same TV, way better art, less money."

---

## 5. Pricing Strategy

### Free Tier — "Gallery"

- 5 art pushes per month from curated library
- Basic rotation (time-based)
- Limited AI taste profile (shows recommendations, can't generate)
- Web and Android control
- Unlimited personal photo uploads (bring your own art)

### Paid Tier — "Atelier" ($4.99/mo or $39.99/yr)

- Unlimited art pushes from curated library
- Unlimited AI-generated art (personalized to taste profile)
- Smart rotation (preference-weighted, time-of-day, seasonal)
- Priority new additions to library
- Full taste analytics ("Your Art DNA" page)
- Multi-room support (multiple TVs)
- Batch push with advanced scheduling

### Why $4.99/mo

- **Below Samsung** ($5.99/mo) — easy switching pitch: "better AND cheaper"
- **Annual discount** ($39.99/yr = $3.33/mo) — incentivizes lock-in
- **Psychological**: "Cancel Samsung, get something better for less" is a powerful one-line pitch

### Future Consideration: Premium Tier ($9.99/mo)

- Commission custom AI art pieces (high-res, print-quality)
- Artist collaboration collections (revenue share with digital artists)
- Family taste profiles (different art for different times/people)
- API access for smart home integration (rotate art based on Home Assistant scenes)

---

## 6. Distribution & Launch Strategy (Phased)

### Phase 1: "Friends & Framers" (Weeks 1-4) — Soft Launch

**Goal**: 50-100 active users, validate core loop, collect testimonials

- Direct distribution via frameapp.dmarantz.com (web pairing)
- Android APK via direct download (sideload instructions)
- Tizen app via manual install (developer mode)
- Seed with r/SamsungFrame community members who volunteer
- Personal outreach to Frame TV owners in tech communities

**Success criteria**: 25+ daily active users, 80%+ rating at least 10 pieces, 3+ unsolicited testimonials

### Phase 2: "Open Beta" (Weeks 5-12)

**Goal**: 500-1000 users, prove retention, app store submissions

- Google Play Store listing (open beta track)
- Samsung TV App Store submission (requires Samsung partnership program enrollment)
- Product Hunt launch
- Begin content marketing (YouTube, blog posts)
- Implement referral system ("Give a friend 3 free months")

**Success criteria**: 30-day retention >40%, paid conversion >5%, app store rating >4.5

### Phase 3: "Growth" (Months 4-8)

**Goal**: 5,000+ users, sustainable revenue, press coverage

- Full Google Play launch
- Samsung TV App Store live (if approved; continue direct if not)
- Paid acquisition experiments (Google Ads, Reddit ads)
- Influencer partnerships
- SEO content machine running

**Success criteria**: MRR >$5K, CAC < $30, LTV > $150

### Phase 4: "Scale" (Months 9-12+)

**Goal**: 20,000+ users, profitability

- Samsung partnership discussions (pre-install on new Frame TVs)
- Expand to LG Gallery TVs, other "art display" hardware
- Artist marketplace (revenue share platform)
- Enterprise/hospitality tier (hotels, offices, waiting rooms)

---

## 7. Marketing Channels & Tactics

### Channel 1: Reddit (Highest Priority — Free, Targeted)

**Subreddits**:

- r/SamsungFrame (3K+ members, highly targeted)
- r/hometheater (2M+ members, Frame TV threads weekly)
- r/SmartHome (1M+ members)
- r/InteriorDesign (3M+ members, Frame TV posts exist)
- r/midjourney, r/StableDiffusion (AI art crossover audience)

**Tactics**:

- Post "I built an alternative to Samsung Art Mode" with before/after photos
- Comment helpfully on "what do you display on your Frame?" threads
- Share interesting AI-generated art with "made this for my Frame TV" context
- Weekly "what's on your Frame this week" engagement posts
- AMA: "I reverse-engineered Samsung Frame's art protocol, AMA"

**Rules**: Never spam. Be genuinely helpful. Share the product only when contextually relevant. Build reputation first.

### Channel 2: YouTube (High Priority — Long Shelf Life)

**Content types**:

1. **"Samsung Art Mode vs Curateur — Is it worth switching?"** (comparison review format)
   - Show side-by-side: Samsung's generic art vs personalized Curateur selections
   - Walk through the rating process and show AI learning in real-time
   - Target keywords: "samsung frame tv art mode alternative"

2. **"I trained an AI to curate art for my living room"** (story format)
   - Personal narrative, home setup shots, family reactions
   - Show the evolution: day 1 generic → week 4 perfectly matched

3. **"5 things Samsung doesn't tell you about Frame TV Art Mode"** (listicle/SEO)
   - Pain points that Curateur solves, soft product intro at the end

4. **"Setting up Curateur on Samsung Frame TV — Full Tutorial"** (utility)
   - Step-by-step, captures search traffic for the brand

5. **Short-form (Reels/Shorts/TikTok)**:
   - "Watch my TV learn my taste in 30 seconds" (timelapse of ratings → generation)
   - "POV: your TV finally gets you" (aesthetic room reveal)
   - Before/after room transformations

### Channel 3: Influencer Partnerships

**Tier 1 targets** (50K-500K followers, likely to respond):

- Smart home YouTubers: Shane Whatley, Smart Home Solver, Paul Hibbert
- Interior design: Lone Fox, Alexandra Gater (younger, tech-open)
- Tech reviewers who've covered Frame TV: Chris Majestic, Tim Schofield

**Approach**:

- Offer free lifetime paid tier + early access
- Provide B-roll of the app in action on a Frame TV
- No scripts — let them be honest (product is good enough)
- Affiliate code: 20% revenue share on conversions

**Tier 2** (5K-50K, micro-influencers):

- Frame TV owners who post setup photos on Instagram
- Interior design bloggers with Samsung Frame content
- DM with free access: "Saw your Frame setup — thought you might like this"

### Channel 4: SEO & Content Marketing

**Target keywords** (with estimated monthly search volume):

| Keyword                       | Vol   | Difficulty | Content Type    |
| ----------------------------- | ----- | ---------- | --------------- |
| samsung frame tv art          | 8,100 | Medium     | Landing page    |
| samsung art store alternative | 1,600 | Low        | Blog post       |
| frame tv custom art           | 2,900 | Low        | Tutorial        |
| samsung frame tv art mode     | 5,400 | Medium     | Comparison page |
| best art for frame tv         | 3,600 | Low        | Gallery/blog    |
| frame tv ai art               | 720   | Very Low   | Feature page    |
| samsung art mode cancel       | 1,300 | Low        | Migration guide |
| frame tv art subscription     | 1,900 | Low        | Pricing page    |

**Content plan**:

- "How to Cancel Samsung Art Mode and Switch to Something Better" (captures cancellation intent)
- "The 50 Best Art Styles for Samsung Frame TV" (captures browsing intent, showcases AI generation)
- "Samsung Frame TV Art Mode Review 2026: Pros, Cons, and Alternatives" (captures evaluation intent)
- "How to Upload Custom Art to Samsung Frame TV" (captures DIY intent, introduces Curateur as easier path)

### Channel 5: App Store Optimization (ASO)

**Google Play**:

- Title: "Curateur - AI Art for Samsung Frame TV"
- Short description: "Replace Samsung Art Mode with AI-personalized art curation"
- Keywords: samsung frame, frame tv art, art mode, tv art, ai art, digital art frame
- Screenshots: Before/after comparisons, rating interface, AI generation results
- Video: 30-second demo showing rate → learn → generate cycle

**Samsung TV App Store**:

- Category: Lifestyle > Art & Design
- Key differentiator in description: "The only art app that learns your taste"
- Screenshots showing on-TV experience

### Channel 6: Communities & Forums

- Samsung Community Forums (official Samsung forum, high SEO value)
- AVS Forum (home theater enthusiasts)
- Hacker News (for the "I built this" launch post)
- Indie Hackers (for the builder journey narrative)
- Twitter/X tech community (build-in-public thread)

### Channel 7: Email Marketing

- Capture emails on landing page with "Get early access" or "Join the waitlist"
- Weekly "Art of the Week" email featuring AI-generated pieces (drives re-engagement)
- Onboarding sequence: Day 1 (welcome), Day 3 (rate your first 10), Day 7 (see your taste profile), Day 14 (try AI generation)

---

## 8. Content Strategy

### Brand Voice

- **Knowledgeable but not pretentious** — we know art, but we're not gatekeeping
- **Slightly irreverent toward Samsung** — "their art store is fine... if you like hotel lobbies"
- **Warm and personal** — "your taste is unique, your TV should reflect that"
- **Technical when needed** — we built something real, and we're proud of the engineering

### Content Pillars

1. **Product education**: How it works, tutorials, feature deep-dives
2. **Art inspiration**: AI-generated showcases, style spotlights, "what's trending"
3. **Home design**: How art transforms a room, seasonal rotation ideas
4. **Behind the build**: Technical posts about the AI, the protocol, the journey (earns trust)
5. **Community**: User setups, taste profiles, "my TV this week" features

### Launch Content Calendar (First 4 Weeks)

| Week | Reddit                                            | YouTube                                   | Blog                                    | Social                       |
| ---- | ------------------------------------------------- | ----------------------------------------- | --------------------------------------- | ---------------------------- |
| 1    | "I built an alternative to Samsung Art Mode" post | Setup tutorial video                      | Launch announcement post                | Daily room/art photos        |
| 2    | AMA on r/SamsungFrame                             | "Samsung Art Mode vs Curateur" comparison | "How to cancel Art Mode" SEO post       | User testimonial clips       |
| 3    | Helpful comments in Frame TV threads              | "AI learned my taste in 2 weeks" story    | "Best art styles for Frame TV" listicle | Behind-the-scenes dev clips  |
| 4    | r/hometheater featured setup post                 | Short-form: "POV your TV gets you"        | Technical deep-dive on AI taste engine  | Influencer content goes live |

---

## 9. Metrics & KPIs

### North Star Metric

**Weekly Active Raters** — users who rate at least 1 piece of art per week. This measures engagement with the core learning loop.

### Acquisition Metrics

| Metric                  | Phase 1 Target | Phase 2 Target | Phase 3 Target |
| ----------------------- | -------------- | -------------- | -------------- |
| New signups/week        | 15             | 50             | 200            |
| Pairing completion rate | >80%           | >85%           | >90%           |
| Source attribution      | Track          | Optimize       | Scale winners  |

### Engagement Metrics

| Metric                                 | Target     |
| -------------------------------------- | ---------- |
| Ratings per user per week              | >5         |
| Art pushes per user per week           | >2         |
| AI generations per paid user per month | >10        |
| Session length                         | >3 minutes |
| 7-day retention                        | >60%       |
| 30-day retention                       | >40%       |

### Revenue Metrics

| Metric                  | Target  |
| ----------------------- | ------- |
| Free-to-paid conversion | >8%     |
| Monthly churn (paid)    | <5%     |
| LTV (paid user)         | >$150   |
| CAC (organic)           | <$5     |
| CAC (paid)              | <$30    |
| MRR (Month 6)           | $5,000  |
| MRR (Month 12)          | $20,000 |

### Product-Specific Metrics

- Taste profile accuracy (do users agree with AI recommendations? >70% thumbs up on AI picks)
- AI generation satisfaction (% of generated art that gets pushed to TV: >30%)
- Time-to-first-value (time from signup to first art displayed on TV: <5 minutes)

---

## 10. Risks & Mitigations

### Risk 1: Samsung blocks third-party art apps

**Likelihood**: Medium (Samsung has historically been open, but could change)
**Impact**: Critical
**Mitigation**:

- Build web-based fallback that works without Tizen app (use SmartThings API)
- Document the "sideload" path as backup distribution
- Build relationship with Samsung developer relations early
- Position as complementary ("we drive Frame TV sales") not competitive
- Explore Samsung partnership: license Curateur as their AI upgrade

### Risk 2: Samsung adds AI personalization to Art Store

**Likelihood**: Medium-High (obvious feature gap they'll eventually fill)
**Impact**: High
**Mitigation**:

- Move fast — establish user base and brand before Samsung reacts
- Build switching costs (taste profile history, generated art library)
- Go deeper on personalization than Samsung's likely "basic recommendation" approach
- Differentiate on generation quality and community
- Pivot to "works across all art display hardware" if Samsung locks down

### Risk 3: Low conversion from free to paid

**Likelihood**: Medium
**Impact**: High
**Mitigation**:

- Make the free tier genuinely useful (builds word of mouth)
- Ensure the "aha moment" (AI generating art you love) is gated behind paid
- A/B test paywall placement and free tier limits
- Consider lifetime deal for early adopters ($99 lifetime = good early revenue + testimonials)

### Risk 4: AI art quality disappoints

**Likelihood**: Low (current models are excellent)
**Impact**: Medium
**Mitigation**:

- Use best available models (DALL-E 3, Midjourney API, Stable Diffusion XL)
- Curate generated results (show top 4, let user pick)
- Frame-specific optimization (aspect ratio, color calibration, matte rendering)
- Allow style-locking: "more like this" on pieces that work

### Risk 5: Small addressable market limits growth

**Likelihood**: Medium
**Impact**: Medium
**Mitigation**:

- Expand to LG Gallery, Hisense CanvasTV, and other art-display TVs
- Build standalone digital frame product (Raspberry Pi + display, $99 kit)
- License AI taste engine to other platforms
- Add "print this" feature (physical prints from AI art, one-time purchases)

### Risk 6: Tizen app approval rejected by Samsung

**Likelihood**: Medium (Samsung's review process is opaque)
**Impact**: Medium (not critical path)
**Mitigation**:

- Web pairing works without any TV app (QR code on phone → WebSocket)
- Maintain direct APK distribution as primary path
- Build relationship with Samsung Developer Program contacts
- Ensure Tizen app follows all Samsung guidelines meticulously

---

## 11. Timeline

### Month 1: Foundation

- [ ] Finalize product name, branding, logo
- [ ] Landing page live at curateur.app (or similar)
- [ ] Waitlist collection active
- [ ] Reddit accounts warmed up (genuine participation, no product mentions yet)
- [ ] 5 blog posts drafted for SEO pipeline
- [ ] Google Play beta track submitted
- [ ] 50 beta users onboarded manually

### Month 2: Soft Launch

- [ ] Product Hunt launch (target Tuesday, prep community for upvotes)
- [ ] Reddit launch posts across 3-4 subreddits
- [ ] First YouTube video live
- [ ] Email onboarding sequence active
- [ ] Google Play approved and live
- [ ] First 10 paying customers
- [ ] Collect 5+ testimonials with photos

### Month 3: Content Engine

- [ ] 2 YouTube videos/month cadence
- [ ] Weekly blog post (SEO-focused)
- [ ] First influencer partnership live
- [ ] Referral program launched
- [ ] Samsung TV App Store submission
- [ ] 100+ paying subscribers
- [ ] Begin A/B testing pricing and paywall

### Months 4-6: Growth

- [ ] Paid acquisition experiments ($500/mo budget)
- [ ] 3-5 influencer partnerships active
- [ ] SEO traffic growing (target 5K organic visits/month)
- [ ] Community features (shared galleries, taste matching)
- [ ] 500+ paying subscribers
- [ ] Approach Samsung for partnership conversation
- [ ] Expand to additional TV platforms if feasible

### Months 7-12: Scale

- [ ] Sustainable content machine (outsource some production)
- [ ] $20K+ MRR
- [ ] Samsung partnership or clear independent path
- [ ] Artist marketplace beta
- [ ] Enterprise/hospitality pilot
- [ ] Consider fundraising if unit economics prove out
- [ ] Multi-platform support (LG, Hisense)

---

## Appendix: Launch Week Playbook

### Day -7: Pre-Launch

- Queue Reddit posts (don't publish yet)
- Brief 5 friends/supporters to upvote Product Hunt on launch day
- Send "launching next week" email to waitlist
- Finalize all app store screenshots and descriptions
- Test the entire signup-to-art-on-TV flow end-to-end

### Day 0: Launch Day

**Morning (6 AM PT)**:

- Product Hunt goes live
- Post to Hacker News ("Show HN: I built an AI art curator for Samsung Frame TV")
- Tweet/X thread: the build story
- Email blast to waitlist: "We're live"

**Midday**:

- Reddit post to r/SamsungFrame
- Reddit post to r/SmartHome
- Cross-post to r/SideProject

**Evening**:

- Respond to every comment (Product Hunt, HN, Reddit)
- Share early user screenshots/reactions
- Fix any reported bugs immediately

### Days 1-3: Momentum

- Daily Reddit engagement (comments, not new posts)
- Share Product Hunt badge everywhere
- DM people who upvoted asking for honest feedback
- Post "Day 1 stats" transparency thread on Twitter/X

### Days 4-7: Sustain

- Publish YouTube launch video
- Send follow-up email: "What 100 people taught their TVs this week"
- Reach out to tech blogs with results/story
- Begin outreach to Tier 2 influencers with "we just launched, here's what happened" narrative

---

## Appendix: Key Messaging by Channel

| Channel          | Tone                     | Hook                                                                                     |
| ---------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| Reddit           | Casual, builder-story    | "I got tired of paying Samsung for art I hate, so I built my own AI curator"             |
| Product Hunt     | Concise, feature-focused | "AI-powered art curation for Samsung Frame TV. Learns your taste, generates unique art." |
| YouTube          | Personal, visual         | "What if your TV could learn what art you actually like?"                                |
| App Store        | Benefits-first           | "Replace Samsung Art Mode with personalized AI art curation"                             |
| Email            | Warm, helpful            | "Your Frame TV is about to get a lot more interesting"                                   |
| Influencer brief | Authentic, flexible      | "We built a better art experience for Frame TV. Try it, be honest."                      |

---

_Last updated: 2026-04-30_
_Status: Draft — ready for review and iteration_
