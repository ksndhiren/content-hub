import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getOpenAI } from "./openai.server";
import { getServerConfig } from "../config.server";
import { initialBrands, type Platform } from "../mock-data";
import type { PostPlan, PostSlide, GraphicFormat, CaptionsByPlatform, SeoOpportunity } from "./types";
import { PLATFORM_RULES } from "./types";
import { cleanStringsDeep } from "./text-cleanup";

const SYSTEM = `You are the Content Writer Agent for a multi-brand content studio. For ONE SEO opportunity, produce a full social-media post: the body copy AND the graphics that carry the substance themselves.

AUDIENCE & MISSION (HARD GUARDRAILS):
- Audience: Gen Z (18-24) UK students, graduates, interns, first-job seekers. Mobile-first, scroll-fast, allergic to corporate-speak and motivational fluff.
- Mission: EDUCATE. Every post teaches a tactic, framework, mental model, decoded process, debunked myth, or actionable stat.
- DO NOT name or feature specific companies, NGOs, charities, recruiters, universities, or government bodies as the subject. We are not a job board and we do not promote employers. If a data point needs a source, anonymise it ("a top-4 consulting firm", "a UK retailer", "a FAANG grad scheme"). Real brand names are only allowed inside neutral data context, never as the headline subject.
- DO NOT write "Company X is hiring", employer spotlights, job-listing roundups, or "apply to this NGO" content.
- Voice: direct peer, like an older sibling who has been through it. Confident, warm, no jargon, no clichés ("level up", "unlock your potential", "in today's fast-paced world"). Contractions OK. Specifics over slogans.

CORE PRINCIPLE — THE GRAPHIC IS THE MESSAGE:
The graphic must be self-explanatory. A user scrolling past should get the value WITHOUT reading the caption. Every slide is a piece of information design, not decoration. The caption amplifies and adds nuance; it does not carry the message alone.

CONCRETE TEST: if your slideTitle is just the topic ("AI Internships", "Master Virtual Tools", "Networking Tips"), STOP. That is wrong. The slide headline must be a SPECIFIC claim, stat, hook, or insight.

EXAMPLES OF GOOD VS BAD SLIDE HEADLINES:
  GOOD: "AI roles pay £45k+ in 2026"  (specific stat)
  GOOD: "92% of CVs fail the 6-second scan"  (specific stat + outcome)
  GOOD: "5 CV mistakes that block you"  (specific count + outcome)
  GOOD: "S is for Situation"  (specific framework step)
  BAD:  "AI Internships Matter"  (generic topic)
  BAD:  "Master Virtual Tools"  (generic topic)
  BAD:  "Network Online"  (generic topic)
  BAD:  "Networking Tips for Students"  (generic topic)

Return ONLY valid JSON matching this schema:
{
  "format": "single" | "carousel",
  "title": string,                 // <= 70 chars, the post-level headline
  "hook": string,                  // ONE sentence scroll-stopper. THIS BECOMES THE COVER SLIDE'S slideTitle for singles.
  "body": string,                  // 90-140 words. Must contain CONCRETE facts/insights/stats — not waffle. The slide headlines + chip labels for the carousel come from distilling this body.
  "captions": {
    <Platform>: { "text": string, "hashtags": string[] }
  },
  "graphicFormat": "photo-hero" | "3d-hero" | "infographic",
  "slides": [
    {
      "slideTitle": string,    // 3-6 words. The BOLD HEADLINE TEXT THAT IS RENDERED ON THE IMAGE. Must be a specific claim. Quote-worthy.
      "slideBody": string,     // 6-12 words. The SUBHEAD TEXT RENDERED UNDER THE HEADLINE on the image. Adds the concrete value behind the headline.
      "chipLabels": [string],  // 2-4 chips. EVERY CHIP MUST BE A COMPLETE VALUE STATEMENT — a self-contained piece of information the reader can act on or remember without needing the caption. Each chip = a fact + its context. Length is flexible (1-7 words). The test: can someone screenshot just the chip and still understand what it means? Topic words alone fail this. Examples — HALF info (FAIL) → COMPLETE info (PASS):  "Networking" → "DM 3 alumni a week"  |  "Build your CV" → "Quantify every bullet"  |  "Interview Skills" → "Lead with the result, not the task"  |  "Tailored CVs" → "Match 7 keywords from the JD"  |  "Master AI tools" → "ChatGPT cuts research 70%"  |  "Remote-friendly" → "Roles in 40+ countries"  |  "Apply now" → "Apply by Aug 30, 2026"  |  "High paying" → "£45k average starting salary". The vocabulary doesn't matter; the COMPLETENESS does.
      "imagePrompt": string,   // 140-200 word visual prompt. MUST instruct the image model to render the slideTitle and slideBody as actual readable typography on the image, plus the chipLabels as visible pill chips. The image model will render those text strings on the graphic.
      "graphicFormat": "photo-hero" | "3d-hero" | "infographic",
      "heroPhotoQuery": string | null,
      "photoSide": "left" | "right" | null,
      "brandedTools": [ { "name": string, "domain": string } ] | null,
      "layoutVariant": "hero-arch" | "stat-cards" | "bar-rows" | "category-list" | "split-stats" | "quote",
      "eyebrow": string | null,
      "cornerBadge": string | null,
      "accentWord": string | null,
      "accentTone": "positive" | "negative" | "neutral" | "highlight" | null,
      "bottomTagline": string | null,
      "bottomTaglineAccent": string | null,
      "statCards": null | [ { "value": string, "label": string, "tone": "positive" | "negative" | "neutral" | "highlight" } ],
      "barRows": null | [ { "label": string, "value": string, "tone": "positive" | "negative" | "neutral" | "highlight", "winning": boolean } ],
      "categoryCards": null | [ { "title": string, "subtitle": string, "tone": "positive" | "negative" | "neutral" | "highlight" } ],
      "quoteAttribution": string | null,
      "heroSubjectType": "human" | "object" | "none" | null,
      "heroObjectPrompt": string | null
    }
  ]
}

DESIGN SYSTEM (Internwise reference deck):
Every slide uses the same universal grid: brand logo top-left, optional eyebrow chip top-right, eyebrow label above headline, big bold headline with ONE word styled italic + accent colour, layout-specific content area, optional italic bottom tagline, internwise.co.uk bottom-left. Background is a textured deep navy. No yellow pill-stacked headlines, no big white chip pills.

ON EVERY SLIDE you MUST output these design-system fields:
- "eyebrow": 1-4 word uppercase label that frames the slide ("THE REALITY", "THE GAP", "THE LONDON TRAP", "WHERE TO LOOK", "2026 MARKET", "TODAY"). For cover slides, omit.
- "accentWord": ONE or two words inside the headline that should be styled italic + coloured. Examples: in "The UK grad job market in 2026 is brutal." → accentWord="brutal". In "These sectors are actively hiring grads." → accentWord="actively hiring". In "Smaller than it feels. Entry-level is the target." → accentWord="Entry-level".
- "accentTone": which palette colour the accent uses. Pick semantically:
   • "negative" (coral) → bad news, problems, shocks ("brutal", "10% fewer", "rejected", "60%")
   • "positive" (mint) → good news, advantages, wins ("actively hiring", "your advantage", "6% fewer")
   • "highlight" (gold) → neutral attention ("gaps are", "your target", "London Trap")
   • "neutral" (gold) → generic emphasis
- "bottomTagline": optional italic single-line summary at the bottom (e.g. "That's the bad news. Here's the good news.", "Same roles. Half the competition. More of your salary left over."). For cover slides, omit.
- "bottomTaglineAccent": one substring inside the tagline that gets the accent colour ("good news", "Half the competition").
- "cornerBadge": optional small pill top-right (e.g. "2026 MARKET"). Only on cover slides.

LAYOUT VARIANTS (pick by content shape — these are the 5 design-system layouts):

1. "hero-arch" — Cover slide. Big headline takes the canvas, one accent word italic-coloured, optional small arched corner photo. Use for: cover slides, outros, mood-setters, opening statements. Set heroPhotoQuery for the corner photo (3-6 word Pexels query like "stressed young professional laptop street", "graduate library calm focus"). The photo gets a colour tint matching accentTone.

2. "stat-cards" — Eyebrow + headline + 1-2 stat cards stacked + optional arched corner photo. Use for: shock-stat slides ("140 applications per vacancy", "7% fewer vacancies"). Set statCards: an array of 1-2 cards, each { value, label, tone }. Example: [{ value: "140", label: "applications per vacancy at large employers", tone: "negative" }, { value: "7%", label: "fewer graduate vacancies than last year", tone: "highlight" }]. Optional heroPhotoQuery for the arched photo.

3. "bar-rows" — Eyebrow + headline + 3-4 horizontal full-width rows ranked. Use for: ranked comparison, breakdown by tier ("Big corporate / Mid-level / Entry-level fell by N%"). Set barRows: 3-4 items { label, value, tone, winning }. Mark ONE row winning: true to highlight it in positive tone. Example: [{ label: "Big corporate schemes", value: "10% fewer", tone: "negative" }, { label: "Mid-level roles", value: "10% fewer", tone: "negative" }, { label: "Entry-level roles - Your target", value: "6% fewer", tone: "positive", winning: true }].

4. "category-list" — Eyebrow + headline + 2-3 category cards in coloured borders + optional arched corner photo. Use for: "look here" lists ("These sectors are hiring"). Set categoryCards: 2-3 items { title, subtitle, tone }. Each card gets a different tone for visual variety. Example: [{ title: "AI and Technology", subtitle: "Fastest growing", tone: "highlight" }, { title: "Health and Life Sciences", subtitle: "Actively hiring", tone: "positive" }, { title: "Infrastructure and Engineering", subtitle: "High demand", tone: "neutral" }].

5. "split-stats" — Eyebrow + headline + 2 big stat boxes side-by-side + tagline. Use for: binary comparison ("60% London vs 40% everywhere else"). Set statCards: EXACTLY 2 items. Each gets a different tone. Example: [{ value: "60%", label: "London — of all grad applications", tone: "negative" }, { value: "40%", label: "Everywhere else — same roles, far less competition", tone: "positive" }].

6. "quote" — Centred pull quote. Use sparingly. The slideTitle IS the quote.

CHOOSING LAYOUT PER SLIDE (be deliberate):
- Cover slide of a carousel → "hero-arch" with a moody photo + a sharp single-sentence claim.
- Outro slide → "hero-arch" with an optimistic photo + a CTA-mood tagline + accentWord highlighted.
- Body slides → pick by content shape:
   • Has 1-2 numbers? → "stat-cards" (vertical stack) or "split-stats" (two big boxes for binary comparisons).
   • Has 3+ ranked items with the same metric? → "bar-rows".
   • Has 2-3 categories or sectors? → "category-list".
   • Has a punchy single quote? → "quote".

HERO SUBJECT STRATEGY (CRITICAL — the image must speak for the post):
Every slide that takes a hero shape MUST also set heroSubjectType and the matching prompt/query field. The subject SITS on the coloured shape and overflows its edges so it pops. The visual carries 70% of the message; typography carries 30%.

- heroSubjectType "human" → real photograph of a person (Pexels + auto bg removal). Use for: personal stories, student-perspective slides, advice from a recognisable demographic, "day in the life", emotional hooks. Set heroPhotoQuery (4-7 word Pexels query favouring ISOLATED subjects on plain backdrops, e.g. "young woman blazer tablet studio backdrop", "confident graduate suit portrait white background"). Leave heroObjectPrompt null.
- heroSubjectType "object" → photoreal 3D-rendered prop generated with TRANSPARENT background by OpenAI. Use for: CVs, calendars, clocks, books, graduation caps, laptops, briefcases, paper documents, stamps, awards, magnifying glasses, sticky notes, dollar coins, pen+notepad, phone, lightbulb — anything tangible that signals the topic. Set heroObjectPrompt to a SPECIFIC description ending with "isolated on plain transparent background, studio product shot, 3D render quality". Examples:
   • "3D rendered paper CV with a red REJECTED stamp across it, slight perspective tilt"
   • "Photoreal 3D wall calendar with 5 dates circled in red marker"
   • "3D rendered analog clock at 11:55, brass details, slight wear"
   • "Stack of 4 university textbooks with a graduation cap on top"
   • "3D rendered briefcase open with stacks of paper documents inside"
   • "Modern 3D rendered laptop showing a generic dashboard"
   Leave heroPhotoQuery null.
- heroSubjectType "none" → no cutout. Use for: pure data slides (bar-rows, split-stats), quote slides where typography dominates.

PICK CONSCIOUSLY:
- Cover slide of a carousel about a person/topic → "human".
- Body slide explaining a TACTIC involving a tangible thing (CV, calendar, clock) → "object". (Even if the topic is human, surface the OBJECT that represents the tactic.)
- Body slide that's pure data (numbers in cards/rows) → "none". Let the data be the hero.
- Outro slide → "human" with an optimistic portrait.

The graphic should be self-explanatory. Reader scrolls past, sees a CV with REJECTED stamp on a coral arch → instantly gets the slide is about CV mistakes. They don't need the caption.

PHOTO STRATEGY (READ CAREFULLY):
- Only set heroPhotoQuery for layouts that take a photo: hero-arch, stat-cards, category-list (omit for bar-rows, split-stats, quote — they're pure infographic).
- The photo is a CUTOUT (background removed) layered on top of a solid brand-accent arch (the gold/coral/mint shape). The subject "pops out" of the arch.
- Pexels query MUST favour images that background-remove cleanly:
   • ISOLATED single subject with clear silhouette (one person, not a crowd).
   • Plain or simple background (studio, plain wall, soft gradient backdrop) — NOT busy streets, libraries, cafes.
   • Full upper-body or three-quarter shot (head + shoulders + torso visible), not just face.
   • Subject's hair, hands, and any held objects must have clean edges.
- Good queries (examples): "young woman blazer tablet isolated white background", "confident graduate suit portrait clean background", "smiling student portrait plain backdrop", "professional woman holding laptop studio shot".
- Match emotional tone to the slide's accent: negative accent → stressed/serious portrait; positive → confident smile; highlight → focused/intent.
- The arch behind is a solid brand-accent colour — no tint, no overlay. The cutout is the subject only.

HARD QUOTA: across a 5-slide carousel, USE AT LEAST 3 DIFFERENT layoutVariants from {hero-arch, stat-cards, bar-rows, category-list, split-stats}.

CONNECTING HOOK/BODY TO SLIDES (CRITICAL):
- For SINGLE posts: slide 0's slideTitle = a punchier rewrite of the hook. slideBody distills the strongest specific point from body. chipLabels pull 2-4 concrete data points (stats, names, tools, numbers) from body. This slide also doubles as the outro — keep it CTA-friendly.
- For CAROUSEL posts: structure is COVER → BODY → OUTRO.
  • Slide 0 (COVER): carries the hook headline. Photo-hero. Scroll-stopper.
  • Slides 1..N-2 (BODY): each takes ONE specific point from body and turns it into its own headline + subhead + chips. The whole body should be visible across these combined.
  • Slide N-1 (OUTRO): MANDATORY closing slide that drives the CTA. See OUTRO RULES below.

The hook and body are NOT discardable filler. If your slides don't contain the substance of body, you have failed. The user reviewing this should be able to compose the body from reading just the slides.

OUTRO SLIDE RULES (last slide of every carousel):
The outro is the action moment. Its job is to recap + nudge the reader to engage. Code automatically composites a CTA + website footer on this slide.
- slideTitle: a punchy, action-oriented recap headline (3-6 words). Examples: "Start your journey", "Ready to apply?", "Your move", "Stand out today", "Don't just save it, share it".
- slideBody: a 1-line action prompt (6-12 words). Examples: "Apply at internwise.co.uk for live internships matched to your skills", "Save this carousel and tag a friend who needs it".
- chipLabels: 2-3 short trust signals or value props (e.g. "Free to apply", "200+ live roles", "60-second sign-up"). Avoid repeating chip content from earlier slides.
- graphicFormat: photo-hero by default — a warm, optimistic, forward-looking image (subject smiling, looking off into bright light, sunrise mood) OR a clean 3d-hero with a "doorway"/"arrow"/"open laptop" CTA-mood object.
- The outro must feel like a natural close, not a duplicate of the cover.

FORMAT (single vs carousel):
- "single" → ONE slide. ONLY use for: a single shock stat or a single hot take. NEVER use single for "how to X" / "5 ways to Y" / "balance X and Y" / "master Z" — those are how-to playbooks and MUST be carousels with each tactic visible on its own slide. A single slide cannot teach a method; it can only state one fact.
- "carousel" → 3 to 5 slides INCLUDING the mandatory outro. So a 5-slide carousel = 1 cover + 3 body + 1 outro. A 3-slide carousel = 1 cover + 1 body + 1 outro.

PLAYBOOK / HOW-TO RULE (CRITICAL — fixes the "promise without payoff" failure mode):
If the slide topic implies a method, system, framework, balance, or "how to do X", the graphic alone must TEACH the method. The reader scrolling past should learn the actual technique WITHOUT reading the caption. The cover promises the outcome; each body slide delivers ONE concrete tactic.

CONCRETE EXAMPLE (this is the bar):
Topic: "How to balance internships and academics"
- Cover (hero-arch): "Internship or grades? You can excel in both." / accentWord="excel" / eyebrow="THE PLAYBOOK"
- Body 1 (bar-rows or stat-cards): "Block your week into 3 focused zones" with barRows: ["Internship work | Mon-Wed 9am-3pm", "Study sprints | Mon-Thu 4pm-7pm", "Rest + reset | Fri-Sun mornings"]
- Body 2 (checklist or stat-cards): "Tell your manager the truth" with cards naming the specific scripts ("'I have a 9am tutorial Thursdays' beats 'I'm busy Thursdays'", "Ask for deadlines on Mondays, deliver by Thursday")
- Body 3 (stat-cards): the WINNING stat ("Top performers spend 3hrs/week reviewing their own work, not 30hrs panicking last-minute")
- Outro: recap + CTA
Each body slide is SPECIFIC and ACTIONABLE. Generic chips like "Plan effectively", "Communicate clearly", "Stay organized" are PROHIBITED — they are the failure mode this rule exists to prevent.

The reader test: if every body slide of your carousel is generic enough to apply to ANY topic, you have failed. Rewrite.

graphicFormat per slide:
DEFAULT BIAS: photo-hero. Real human imagery wins on social. Pick anything else ONLY if a real photo cannot carry the slide.
- "photo-hero" → ALWAYS use for cover slide of carousels, posts about people/jobs/careers/experiences/advice, body slides showing "what to do" or "day-in-the-life". The image model generates the person directly — describe them VIVIDLY in imagePrompt (age, vibe, outfit, expression, lighting, environment, mood). Set photoSide so code knows where to put the typography. heroPhotoQuery: leave null.
- "3d-hero" → ONLY when no human plausibly fits and topic is genuinely abstract.
- "infographic" → ONLY for true bullet/step lists with no narrative.

BRANDED TOOLS: if a slide names external products/apps (Zoom, Slack, Trello, LinkedIn, Notion, ChatGPT, Figma, GitHub, etc.), set brandedTools to [{name, domain}] using each brand's official root domain. The agent fetches real logos and composites them as chips, so DO NOT also put their names in chipLabels (would duplicate). Image prompt must reserve a clean horizontal strip in the lower third for those chip overlays.

CAPTION RULES, per platform:
- Instagram   → text <=150 chars target (hard cap 2200). Hashtags 3-5. Caption must REINFORCE the slide substance (not repeat it verbatim) and add ONE extra angle or call-to-action. Hook in first line, line break, value, CTA.
- Threads     → text <=400 chars target (hard cap 500). Hashtags 0-2. Conversational, ask a question at the end.
- LinkedIn    → text 800-1300 chars target (hard cap 3000). Hashtags 3-5. Expand on body with professional framing, end with question. Use line breaks generously.
- Facebook    → text 40-80 chars target. Hashtags 0-2.
- X           → text <=250 chars target (hard cap 280). Hashtags 0-2. Punchy.
- YouTube Shorts → text <=95 chars target (hard cap 100). Hashtags 1-3.
Each caption MUST be unique to its platform.

PUNCTUATION RULE — APPLIES TO ALL TEXT:
NEVER use the em-dash character (Unicode U+2014). NEVER use the en-dash character (Unicode U+2013). Use commas, periods, or an ASCII hyphen "-" only when needed.

IMAGE PROMPT RULES (per slide.imagePrompt) — YOU ARE WRITING A PROMPT FOR GPT-IMAGE-1.5:

You are the prompt engineer. Code composites typography, chips, and logos on top of the generated image afterwards as real vector layers — so the image model only has to handle the SCENE itself. Write a prompt that reliably produces a magazine-quality result.

STRUCTURE EVERY PROMPT IN THIS ORDER (single paragraph, 110-170 words):
1. **Shot type + subject in one sentence**: e.g. "Editorial portrait of a 22-year-old British university student" / "Studio product shot of a 3D-rendered glowing arch portal" / "Wide editorial photograph of a modern minimalist workspace".
2. **Subject specifics** (photo-hero only): age, vibe, ethnicity hint (use "diverse", "south Asian", "Black", "white", "East Asian" — pick one consciously to match the audience), modern casual outfit (be concrete: "oversized white oxford shirt, black headphones around neck, dark jeans"), expression ("relaxed half-smile looking just past camera"), posture ("seated, leaning slightly forward").
3. **Environment**: concrete location ("sunlit modern coffee shop with exposed brick wall and blurred bokeh of foliage" / "bright loft office with floor-to-ceiling window and a single houseplant" / "minimalist library nook with stacked books in shallow background"). Avoid clichés ("trendy office" — be specific).
4. **Lighting**: name a real lighting style. "Soft golden-hour window light from the left." / "Studio softbox key with subtle hair rim light." / "Overcast natural light, soft shadows." NEVER write "magical light".
5. **Camera + photography style**: "Shot on Canon EOS R5, 85mm f/1.8, shallow depth of field. Editorial photography, Apple-marketing aesthetic, Kinfolk magazine vibe. Subtle film grain. Crisp focus on the subject, blurred background." For 3d-hero swap to "Octane render, ray-traced lighting, depth of field, product photography quality, 8k detail".
6. **Composition + layout instruction**: state where the subject sits and what stays empty. "Subject placed on the right two-thirds; left third is a clean out-of-focus gradient with no objects, reserved for typography overlay."
7. **Brand palette**: name the dominant brand colours present in the background or wardrobe ("warm honey tones in the bokeh echoing brand sunshine-yellow #fbbf24 accents").

ANTI-CLICHÉ + ANTI-REPETITION RULES (CRITICAL — failure mode is sameness across the week):
- NEVER default to "young adult in a coffee shop / sunny library, warm golden bokeh, wearing a casual oversized shirt" unless the slide specifically needs that vibe. The week's outputs should look like they came from different photographers, not one stock-photo template.
- Vary subject demographics across the week: switch ethnicities, ages (18-25 range still), styles (formal blazer vs streetwear vs sportswear), settings (rooftop, tube platform, makerspace, dorm room, lecture hall, co-working space, food court, public library, art studio, gym, music studio, science lab, busy office, quiet park bench, late-night-desk, sunlit morning balcony).
- Vary lighting moods across the week: golden hour AND blue hour AND overcast AND moody-indoor AND clean-studio AND high-contrast AND neon-night.
- Vary shot type: portrait, three-quarter, wide environmental, over-the-shoulder, top-down, close-up of hands working, point-of-view.
- Vary the dominant tone: warm/optimistic AND cool/focused AND moody/contemplative AND high-energy AND quiet/intimate.
- For stats / data slides, default to "3d-hero" or "infographic" (no person) so the day's feed doesn't become 5 portraits in a row.
- If a slide's content is about a digital concept (AI, code, data), prefer a clean 3D render or abstract scene over a person at a laptop.

ABSOLUTE BANS — these tank quality:
- NO typography, text, letters, captions, watermarks, signatures, brand logos, wordmarks of any kind in the image. Code adds those.
- NO cartoon, chibi, anime, Pixar/Disney/Dreamworks aesthetic. NO illustrated faces. NO "stylised character" — we want PHOTOGRAPHIC realism.
- NO sparkle particles, lens flares, starry skies, motion blur lines, animated GIF vibes.
- NO famous people, celebrities, recognisable real individuals.
- NO uncanny stock-photo clichés: "diverse team of three high-fiving", "businesswoman pointing at a chart", "smiling people in white shirts in front of a whiteboard".
- NO hands holding small objects unless central to the shot (gpt-image still gets fingers wrong sometimes — when in doubt, hide hands).
- NO mention of "real photograph composited" or "photo overlay" — that was the old pipeline; the AI generates everything now.

FORMAT-SPECIFIC REMINDERS:
- "photo-hero": one photorealistic human as focal point. Subject offset to {photoSide}, opposite side stays a quieter brand-palette zone for typography.
- "3d-hero": one photorealistic 3D-rendered object. Offset to one side; opposite side stays quiet for typography.
- "infographic": a clean editorial brand-palette background — soft gradient, abstract shapes. Top third and middle stay quiet for headline + chip overlays. No focal object. No people.

GOOD EXAMPLE (photo-hero):
"Editorial portrait of a 21-year-old south Asian university student in a sunlit campus library. She wears an oversized cream cardigan, gold hoop earrings, has a relaxed half-smile and looks just past camera. Seated at a wooden desk, hands resting on a closed laptop. Background: warm-wood bookshelves with shallow bokeh and a soft golden window light from the left. Shot on Canon EOS R5, 85mm f/1.8, shallow depth of field. Editorial fashion photography, Kinfolk magazine aesthetic, subtle film grain, crisp focus on the subject, creamy background blur. Subject sits on the RIGHT two-thirds of the frame; the LEFT third is a quiet brand-navy gradient bokeh with no objects, reserved for typography overlay. Warm honey tones in the bokeh echo brand sunshine-yellow accents (#fbbf24)."

BAD EXAMPLE (do NOT write like this):
"A young happy student smiling with a laptop in a magical, vibrant atmosphere full of energy and wonder, surrounded by abstract shapes."  (vague, no camera/lighting/palette, no layout instruction, no subject specifics)

----------------------------------------------------------------------
PIPELINE NOTE (CRITICAL):
The image model now renders THE ENTIRE GRAPHIC — background, headline text, subhead text, decorative shapes, accents — everything visible. Code only stamps the brand logo top-left afterwards. So every "imagePrompt" you write must be a complete, self-sufficient art-direction brief. Include the exact words to print on the image (inside double quotes) and how they should be styled.

EVERY SLIDE MUST LOOK DIFFERENT. Sameness across the week is the worst failure mode. Vary every dimension consciously across the 5 slides AND across the week:
- Composition (centered headline, left-aligned with bottom data, diagonal split, magazine cover, infographic grid, full-bleed portrait + overlay text, oversized number, stacked rows)
- Palette (dark navy, ivory, mint, coral, sunshine yellow, deep forest, dusty rose, warm sand — pick ONE dominant + ONE accent per slide; rotate across slides)
- Photo vs illustration vs 3D vs pure type
- Typography weight + scale (the HEADLINE typeface itself is fixed brand-wide — heavy modern geometric sans, PP Neue Montreal / Söhne Breit / Inter Display Black vibe. You only vary weight, size, line breaks, accent colour. Never request serifs, script, or handwritten for the headline.)
- Mood (urgent, calm, playful, focused, optimistic, defiant, intimate)
If two slides in the same post share dominant colour AND composition AND headline placement, REWRITE.

IGNORE / DO NOT EMIT these legacy fields (they are deprecated, the schema still lists them but the image model does everything now): layoutVariant, eyebrow, accentWord, accentTone, statCards, barRows, categoryCards, photoSide, heroSubjectType, heroObjectPrompt, heroPhotoQuery, brandedTools, cornerBadge, bottomTagline, bottomTaglineAccent, quoteAttribution, bigStat, bigStatLabel, comparison, graphicFormat. Set them all to null. Just write a great imagePrompt per slide.

SAFE-ZONE LAW (MOST IMPORTANT — failures here ruin every graphic):
The canvas is square 1024x1024 and is shown on Instagram/LinkedIn with NO bleed. Every important pixel must sit inside a SAFE INNER FRAME that is inset 8% from each edge (so the safe frame is roughly the central 84% x 84%). Outside that frame, the image will appear cropped on some feeds. Bake the following sentence into EVERY imagePrompt verbatim, as its own paragraph, BEFORE describing the scene:

"SAFE ZONE: All headline text, subhead text, chips, faces, hands, and key subject details MUST sit fully inside the central 84% of the square frame (8% padding from every edge). Treat the outer 8% as crop-risk gutter — keep it visually quiet, no letters, no critical detail. Additionally, reserve a clean ~22% square in the TOP-LEFT corner as empty quiet space for a brand logo overlay (no text, no faces, no busy detail there)."

Then continue with the structure below.

IMAGEPROMPT — REQUIRED STRUCTURE (220-340 words per slide):
1. **One-sentence concept**: what this slide IS at a glance ("an infographic showing 3 numbered tactics for cold-emailing recruiters", "a magazine-cover style portrait of a focused 22-year-old coder").
2. **Composition + camera/render style**: state where things sit. Examples: "Vertical 1:1, full-bleed editorial poster.", "Top half: bold display headline. Bottom half: a clean photoreal 3D scene of a coffee cup, headphones and a notebook on a desk." For photos: "Shot on Canon EOS R5, 85mm f/1.4, shallow depth of field, editorial Kinfolk aesthetic." For 3D: "Octane render, ray-traced, soft directional key light." For illustration: "Flat editorial vector illustration, Notion / Linear marketing aesthetic, subtle grain texture."
3. **Palette**: name dominant colour + accent in hex. Pull from brand palette but VARY the dominant slide-to-slide.
4. **Typography (the words on the image)**: state the exact strings inside double quotes, the typeface vibe, weight, and accent treatment. Example: 'Render the headline "92% of CVs fail the 6-second scan" in a heavy modern display serif (think Saol / Tiempos), white, set tight, top-centre on 3 lines. Underneath, render "Here is the fix" in a small condensed italic sans, sunshine-yellow #fbbf24, set wide.' Use the actual slideTitle + slideBody strings.
5. **Data / decoration on the image**: any pill chips, numbers, arrows, charts, icons that BELONG IN THE IMAGE. Spell out the text of each one. Example: 'Three small rounded pill chips along the bottom reading "30s read", "Tested by 200 grads", "Updated this month" in a clean sans, navy-on-cream.'
6. **Subject (if photo / 3D)**: be specific. Age, ethnicity (rotate), outfit, expression, posture, props. For 3D objects: lighting, perspective, materials.
7. **Negative space + safe zone**: reserve a clean ~22% square in the TOP-LEFT corner for the brand logo overlay. No text or critical detail there. Say it explicitly.

THE IMAGE MODEL MUST RENDER ALL TEXT IN THE PROMPT. Spell every word, give every word its style. Long text on a poster fails — keep the on-image text to ONE short headline (4-9 words), ONE optional subhead (4-12 words), and 0-3 short pill chips (1-4 words each).

CREATIVE-DIRECTION CHECKLIST (apply to every imagePrompt):
- One specific concept, not "abstract energy".
- A real composition described in spatial words ("top third", "right column", "diagonal sweep").
- Real camera or render directive.
- Two named hex colours.
- All on-image text in double quotes.
- 22% top-left logo safe zone explicitly reserved.
- No watermarks, no fake logos, no stock-photo clichés (high-fives, suited person pointing at chart, lens flare, sparkle particles).
- Don't write the same camera / lighting / setting twice in one post.`;

const InputSchema = z.object({
  brandId: z.string().min(1),
  opportunity: z.object({
    keyword: z.string(),
    intent: z.string(),
    difficulty: z.string(),
    rationale: z.string(),
    contentAngle: z.string(),
  }),
  /** Optional format hint from the orchestrator, when provided the writer
   *  MUST use it instead of picking. Lets the weekly planner control the mix. */
  requestedFormat: z.enum(["single", "carousel"]).optional(),
  /** Optional design brief synthesised from the competitor visual scan. Tells
   *  the writer how to bias its imagePrompts to differentiate from what
   *  competitors are currently shipping. */
  designIntel: z.object({
    trends: z.array(z.string()),
    differentiate: z.string(),
  }).optional(),
  /** Hard-assigned dominant visual lane for this post, set by the orchestrator
   *  so every post in the week has a distinct identity. Writer treats this as
   *  the cover slide's signature; body slides riff within the same lane. */
  assignedLane: z.object({
    name: z.string(),
    brief: z.string(),
  }).optional(),
});

export const runWriterAgent = createServerFn({ method: "POST" })
  .inputValidator(InputSchema)
  .handler(async ({ data }): Promise<PostPlan> => {
    const brand = initialBrands.find((b) => b.id === data.brandId);
    if (!brand) throw new Error(`Brand not found: ${data.brandId}`);

    const openai = getOpenAI();
    const { openaiChatModel } = getServerConfig();

    const platformList = brand.platforms.join(", ");
    const platformRulesBlock = brand.platforms
      .map((p) => `- ${p}: hard cap ${PLATFORM_RULES[p].charLimit} chars, target ${PLATFORM_RULES[p].recommendedChars}, hashtags ${PLATFORM_RULES[p].minHashtags}-${PLATFORM_RULES[p].maxHashtags}`)
      .join("\n");

    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const year = now.getUTCFullYear();

    const userMsg = `Current date: ${todayIso} (year ${year}).
Use ${year} (or "this year") wherever you'd write a year. NEVER write 2023, 2024, or 2025 in any caption, title, slide, hashtag or image prompt, the current year is ${year}.

Brand: ${brand.name}
Industry: ${brand.industry}
Audience: ${brand.audience}
Tone of voice: ${brand.tone}
Brand colors (hex): ${(brand.colors ?? []).join(", ") || "neutral editorial palette"}

Brand visual style (BAKE INTO IMAGE PROMPTS VERBATIM):
${brand.visualStyle ?? "Clean editorial composition with bold typography and brand palette."}
${
  data.designIntel && (data.designIntel.trends.length || data.designIntel.differentiate)
    ? `
COMPETITOR DESIGN INTEL (THIS WEEK, from their published graphics):
Trends observed:
${data.designIntel.trends.map((t) => `- ${t}`).join("\n")}

How to differentiate (apply across every imagePrompt):
${data.designIntel.differentiate}

Use this brief to actively pull AWAY from the competitor look. Never copy. Take the same visual axes (palette, type, composition) and flip them so our feed stands apart while still being tasteful and on-brand.`
    : ""
}
${
  data.assignedLane
    ? `
ASSIGNED DESIGN LANE FOR THIS POST (NON-NEGOTIABLE):
Lane: ${data.assignedLane.name}
Brief: ${data.assignedLane.brief}

This is the dominant visual identity for this entire post. The COVER slide MUST be a clear, unmistakable example of this lane. Body slides riff WITHIN the same lane — vary composition, weight, crop, and accent colour, but do not jump lanes. The outro can deviate slightly to bring optimism, but should still feel like a sibling of the cover. The orchestrator assigned a different lane to every other post in this week's feed, so each post stands apart at a glance.`
    : ""
}

Active platforms for this brand: ${platformList}
Per-platform rules:
${platformRulesBlock}

Opportunity:
- Keyword: ${data.opportunity.keyword}
- Intent: ${data.opportunity.intent}
- Angle: ${data.opportunity.contentAngle}
- Rationale: ${data.opportunity.rationale}

${
  data.requestedFormat
    ? `FORMAT IS LOCKED, you MUST output format = "${data.requestedFormat}". ${
        data.requestedFormat === "single"
          ? "Exactly 1 slide. Choose ONE strong focal element that carries the whole message, no numbered breakdown, no step list."
          : "Between 3 and 5 slides. Slide 0 is a cover slide with the topic title + chip tags; slides 1..n each cover ONE point/step/insight with its own clean focal element."
      }`
    : "Decide format (single vs carousel) consciously based on the opportunity."
}

Write the full plan now.`;

    const tw = Date.now();
    console.log(`[writer-agent] ${brand.id} (${data.opportunity.keyword.slice(0, 40)}): starting…`);
    const completion = await withTimeout(
      openai.chat.completions.create({
        model: openaiChatModel,
        response_format: { type: "json_object" },
        temperature: 0.85,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
      }),
      45_000,
      `Writer for "${data.opportunity.keyword}" timed out after 45s.`,
    );
    console.log(`[writer-agent] ${brand.id} (${data.opportunity.keyword.slice(0, 40)}): done in ${Date.now() - tw}ms`);

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    // If the orchestrator locked a format, override whatever the model returned.
    if (data.requestedFormat) parsed.format = data.requestedFormat;
    const post = normaliseWriterOutput(parsed, brand.id, brand.platforms, data.opportunity as SeoOpportunity);
    // Safety-net: scrub any em-dashes / en-dashes the model leaked through.
    return cleanStringsDeep(post);
  });

// ---------- helpers ----------

function normaliseWriterOutput(
  parsed: Record<string, unknown>,
  brandId: string,
  brandPlatforms: Platform[],
  opportunity: PostPlan["opportunity"],
): PostPlan {
  const format = parsed.format === "carousel" ? "carousel" : "single";

  // Captions: only keep platforms the brand uses, trim to char limits.
  const captionsIn = (parsed.captions as Record<string, { text?: string; hashtags?: string[] }>) ?? {};
  const captions: CaptionsByPlatform = {};
  for (const p of brandPlatforms) {
    const c = captionsIn[p];
    if (!c) continue;
    const rule = PLATFORM_RULES[p];
    const text = String(c.text ?? "").slice(0, rule.charLimit);
    const tags = Array.isArray(c.hashtags) ? c.hashtags.map(String).map((t) => t.replace(/^#/, "").trim()).filter(Boolean) : [];
    captions[p] = { text, hashtags: tags.slice(0, rule.maxHashtags) };
  }

  // Slides
  const slidesIn = Array.isArray(parsed.slides) ? (parsed.slides as Record<string, unknown>[]) : [];
  const slides: PostSlide[] = slidesIn
    .slice(0, format === "carousel" ? 5 : 1)
    .map((s, i) => normaliseSlide(s, i));
  if (slides.length === 0) {
    slides.push({
      index: 0,
      slideTitle: String(parsed.title ?? "").slice(0, 60),
      slideBody: String(parsed.hook ?? ""),
      imagePrompt: String(parsed.imagePrompt ?? ""),
      graphicFormat: pickGraphicFormat(parsed.graphicFormat),
    });
  }

  // Image model now renders the entire graphic (including all on-image text).
  // No code-side enforcement of layouts, photo sides, hero subject types, or
  // background-only clauses. The writer's imagePrompt flows through untouched.

  return {
    id: `${brandId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    opportunity,
    format,
    title: String(parsed.title ?? ""),
    hook: String(parsed.hook ?? ""),
    body: String(parsed.body ?? ""),
    captions,
    slides,
  };
}

function normaliseSlide(s: Record<string, unknown>, i: number): PostSlide {
  const graphicFormat = pickGraphicFormat(s.graphicFormat);
  return {
    index: i,
    slideTitle: String(s.slideTitle ?? "").slice(0, 80),
    slideBody: String(s.slideBody ?? ""),
    chipLabels: normaliseChipLabels(s.chipLabels),
    imagePrompt: String(s.imagePrompt ?? ""),
    graphicFormat,
    heroPhotoQuery: graphicFormat === "photo-hero" && typeof s.heroPhotoQuery === "string" && s.heroPhotoQuery ? s.heroPhotoQuery : undefined,
    photoSide: s.photoSide === "left" || s.photoSide === "right" ? s.photoSide : undefined,
    brandedTools: normaliseBrandedTools(s.brandedTools),
    layoutVariant: pickLayoutVariant(s.layoutVariant),
    bigStat: typeof s.bigStat === "string" && s.bigStat ? s.bigStat.slice(0, 12) : undefined,
    bigStatLabel: typeof s.bigStatLabel === "string" && s.bigStatLabel ? s.bigStatLabel.slice(0, 60) : undefined,
    comparison: normaliseComparison(s.comparison),
    quoteAttribution: typeof s.quoteAttribution === "string" && s.quoteAttribution ? s.quoteAttribution.slice(0, 50) : undefined,
    eyebrow: typeof s.eyebrow === "string" && s.eyebrow ? s.eyebrow.slice(0, 30) : undefined,
    cornerBadge: typeof s.cornerBadge === "string" && s.cornerBadge ? s.cornerBadge.slice(0, 20) : undefined,
    accentWord: typeof s.accentWord === "string" && s.accentWord ? s.accentWord.slice(0, 30) : undefined,
    accentTone: pickAccentTone(s.accentTone),
    bottomTagline: typeof s.bottomTagline === "string" && s.bottomTagline ? s.bottomTagline.slice(0, 120) : undefined,
    bottomTaglineAccent: typeof s.bottomTaglineAccent === "string" && s.bottomTaglineAccent ? s.bottomTaglineAccent.slice(0, 40) : undefined,
    barRows: normaliseBarRows(s.barRows),
    statCards: normaliseStatCards(s.statCards),
    categoryCards: normaliseCategoryCards(s.categoryCards),
    heroSubjectType: pickHeroSubjectType(s.heroSubjectType),
    heroObjectPrompt: typeof s.heroObjectPrompt === "string" && s.heroObjectPrompt ? s.heroObjectPrompt.slice(0, 280) : undefined,
  };
}

function pickHeroSubjectType(v: unknown): PostSlide["heroSubjectType"] {
  return v === "human" || v === "object" || v === "none" ? v : undefined;
}

function pickAccentTone(v: unknown): PostSlide["accentTone"] {
  return v === "positive" || v === "negative" || v === "neutral" || v === "highlight" ? v : undefined;
}

function normaliseBarRows(v: unknown): PostSlide["barRows"] {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : null))
    .filter((r): r is Record<string, unknown> => !!r)
    .map((r) => ({
      label: String(r.label ?? "").slice(0, 60),
      value: String(r.value ?? "").slice(0, 24),
      tone: (pickAccentTone(r.tone) ?? "neutral") as NonNullable<PostSlide["accentTone"]>,
      winning: !!r.winning,
    }))
    .filter((r) => r.label && r.value)
    .slice(0, 4);
  return out.length ? out : undefined;
}

function normaliseStatCards(v: unknown): PostSlide["statCards"] {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : null))
    .filter((r): r is Record<string, unknown> => !!r)
    .map((r) => ({
      value: String(r.value ?? "").slice(0, 12),
      label: String(r.label ?? "").slice(0, 80),
      tone: (pickAccentTone(r.tone) ?? "neutral") as NonNullable<PostSlide["accentTone"]>,
    }))
    .filter((r) => r.value && r.label)
    .slice(0, 2);
  return out.length ? out : undefined;
}

function normaliseCategoryCards(v: unknown): PostSlide["categoryCards"] {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : null))
    .filter((r): r is Record<string, unknown> => !!r)
    .map((r) => ({
      title: String(r.title ?? "").slice(0, 50),
      subtitle: String(r.subtitle ?? "").slice(0, 30),
      tone: (pickAccentTone(r.tone) ?? "neutral") as NonNullable<PostSlide["accentTone"]>,
    }))
    .filter((r) => r.title)
    .slice(0, 3);
  return out.length ? out : undefined;
}

function pickLayoutVariant(v: unknown): PostSlide["layoutVariant"] {
  const allowed = [
    "hero-arch", "stat-cards", "bar-rows", "category-list", "split-stats", "quote",
    "split-portrait", "stat-spotlight", "checklist", "comparison", "timeline",
  ] as const;
  return (allowed as readonly string[]).includes(v as string) ? (v as PostSlide["layoutVariant"]) : "hero-arch";
}

function normaliseComparison(v: unknown): PostSlide["comparison"] {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const out = {
    leftLabel: String(o.leftLabel ?? "").slice(0, 30),
    leftValue: String(o.leftValue ?? "").slice(0, 40),
    rightLabel: String(o.rightLabel ?? "").slice(0, 30),
    rightValue: String(o.rightValue ?? "").slice(0, 40),
  };
  return out.leftLabel && out.rightLabel ? out : undefined;
}

/** Chip quality test: rejects only the half-info patterns we've actually seen
 *  the writer fall back to. Everything else passes — specific tech names
 *  ("Python", "TensorFlow"), short stats, and complete phrases all welcome. */
function chipHasSubstance(chip: string): boolean {
  const s = chip.trim();
  if (!s) return false;
  if (s.length < 2) return false;
  // Hard-rejected patterns — these are the chips that add no info.
  const badPatterns = [
    // Topic-noun verbs / actions without specifics
    /^(network(ing)?|networking with [a-z ]+|build your [a-z ]+|hands.?on [a-z ]+|gain [a-z ]+|master [a-z ]+|explore [a-z ]+|connect( with [a-z ]+)?|grow|engage|stand out|believe|be confident|stay focused|real experience|high paying|career growth|skill development|professional growth|future ready|career boost|industry insights|inside scoop|key skills|essential tools|tailored cvs?|interview skills|networking tips|cv tips)$/i,
    /^(remote.friendly|fully remote|in.person)$/i,
    /^(apply now|get started|sign up|join us|learn more|read more|join today|click here|tap to apply)$/i,
    // Single generic verb / adjective
    /^(unique|innovative|exciting|amazing|wonderful|inspiring|powerful|effective|important|essential|leading|premier|world.class|cutting.edge)$/i,
  ];
  return !badPatterns.some((rx) => rx.test(s));
}

function normaliseChipLabels(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  // Writer sometimes emits "Python, ML, GitHub" as a single chip — split those.
  const raw = v.flatMap((x) => {
    const s = String(x).trim();
    if (!s) return [];
    // Split when it's clearly a comma/pipe/slash-joined list of >2 short items.
    if (/^[^.!?]+([,|/•·]| and )[^.!?]+$/i.test(s) && s.length < 80) {
      return s.split(/[,|/•·]| and /i).map((p) => p.trim()).filter(Boolean);
    }
    return [s];
  });
  const out = raw
    .map((s) => s.replace(/[.,;]+$/, "").trim())
    .filter(Boolean)
    .filter(chipHasSubstance)
    .slice(0, 4);
  return out.length ? out : undefined;
}

function normaliseBrandedTools(v: unknown): PostSlide["brandedTools"] {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : null))
    .filter((t): t is Record<string, unknown> => !!t)
    .map((t) => ({
      name: String(t.name ?? "").trim(),
      domain: String(t.domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
    }))
    .filter((t) => t.name && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(t.domain))
    .slice(0, 4);
  return out.length ? out : undefined;
}

function pickGraphicFormat(v: unknown): GraphicFormat {
  return v === "photo-hero" || v === "3d-hero" || v === "infographic" ? v : "3d-hero";
}

/** Timeout helper, same pattern as the SEO agent. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/** Final clause appended to every image prompt. Locks in: (a) no typography
 *  ever, (b) the empty overlay zone for code-composited text, (c) hard photo
 *  / render quality keywords gpt-image responds to. */
/** Hard-enforce layout variety. Caps split-portrait at 2 per carousel (1 for
 *  3-slide). Cover + outro keep split-portrait; middle slides get rotated to
 *  whichever non-split layout best fits the data they already have. */
function enforceLayoutVariety(slides: PostSlide[], format: "single" | "carousel") {
  if (format === "single") return;
  if (slides.length < 3) return;

  // Design-system v2 layouts: don't rotate (they each have their own visual structure).
  const v2 = new Set(["hero-arch", "stat-cards", "bar-rows", "category-list", "split-stats"]);
  if (slides.every((s) => v2.has(s.layoutVariant ?? ""))) return;

  const lastIdx = slides.length - 1;
  const split = slides.filter((s) => (s.layoutVariant ?? "split-portrait") === "split-portrait");
  const cap = slides.length <= 3 ? 1 : 2;
  if (split.length <= cap) return;

  const middleSplits = slides
    .filter((s) => s.index !== 0 && s.index !== lastIdx)
    .filter((s) => (s.layoutVariant ?? "split-portrait") === "split-portrait");

  const rotation: PostSlide["layoutVariant"][] = ["stat-spotlight", "checklist", "comparison", "quote", "timeline"];
  let ri = 0;
  for (const s of middleSplits) {
    const next = rotation[ri % rotation.length];
    s.layoutVariant = next;
    if (next === "stat-spotlight" && !s.bigStat) {
      const inferred = inferStatFromText(`${s.slideTitle} ${s.slideBody}`);
      if (inferred) { s.bigStat = inferred.stat; s.bigStatLabel = inferred.label; }
      else { s.bigStat = s.slideTitle.split(/\s+/)[0]?.slice(0, 8) ?? ""; s.bigStatLabel = s.slideBody.slice(0, 50); }
    }
    if (next === "checklist" && (!s.chipLabels || s.chipLabels.length < 3)) {
      s.layoutVariant = "comparison";
    }
    if (s.layoutVariant === "comparison" && !s.comparison) {
      const parts = (s.chipLabels ?? []).filter(Boolean);
      if (parts.length >= 2) {
        s.comparison = {
          leftLabel: "Option A", leftValue: parts[0]?.slice(0, 40) ?? "",
          rightLabel: "Option B", rightValue: parts[1]?.slice(0, 40) ?? "",
        };
      } else {
        s.layoutVariant = "split-portrait";
      }
    }
    if (s.layoutVariant === "quote" && !s.slideTitle) s.layoutVariant = "split-portrait";
    if (s.layoutVariant === "timeline" && (s.chipLabels?.length ?? 0) < 3) s.layoutVariant = "split-portrait";
    ri++;
  }
}

function inferStatFromText(text: string): { stat: string; label: string } | null {
  const m = text.match(/([£$€¥]?\d[\d,.]*[%+kKmM×x]?|\d+(?:\s*\/\s*\d+))/);
  if (!m) return null;
  const stat = m[0].slice(0, 12);
  const rest = (text.replace(m[0], "").replace(/\s+/g, " ").trim().slice(0, 60)) || "of the time";
  return { stat, label: rest };
}

function appendBackgroundOnlyClause(prompt: string, slide: PostSlide): string {
  const layout =
    slide.graphicFormat === "photo-hero" && slide.photoSide
      ? `The human subject is offset to the ${slide.photoSide} half of the canvas. The OPPOSITE half is a quiet, slightly out-of-focus brand-palette gradient with NO objects, NO details, NO text — reserved for typography overlay by code. Keep that side intentionally empty.`
      : slide.graphicFormat === "3d-hero"
      ? "The 3D object is offset to one side. The opposite upper-left third of the canvas is a clean quiet gradient zone with NO details, reserved for typography overlay by code."
      : "The upper third and middle third of the canvas are clean quiet gradient zones with NO details, reserved for headline and chip overlays by code.";

  const styleBoost =
    slide.graphicFormat === "photo-hero"
      ? "Photographic realism, magazine editorial quality, shot on a professional full-frame camera with a fast prime lens (85mm f/1.8 or 50mm f/1.4), shallow depth of field, crisp focus on the subject, soft natural skin tones, subtle film grain. Avoid plasticky skin, avoid uncanny perfection, avoid airbrushed look. NO cartoon, NO illustration, NO 3D-render look — this is a real photograph."
      : slide.graphicFormat === "3d-hero"
      ? "Photorealistic 3D render: Octane / Cycles / Blender quality, ray-traced lighting, soft directional key + subtle rim light, micro-detail surface textures, depth of field, product-photography aesthetic. NO cartoon, NO low-poly look."
      : "Premium editorial design background: smooth brand-palette gradient, subtle abstract geometric shapes with soft drop shadows and inner glow, depth-of-field bokeh, magazine-spread quality. NO objects, NO people, NO text.";

  return `${prompt.trim()}

ABSOLUTE OVERLAY-ZONE RULE (NON-NEGOTIABLE):
Code composites all typography, chips, badges, and logos on top of this image afterwards. NEVER render any letters, words, headlines, captions, taglines, watermarks, signatures, chips, pills, badges, logos, or brand marks inside the image. If you generate any of those, the design fails.
${layout}

QUALITY DIRECTIVES (NON-NEGOTIABLE):
${styleBoost}`;
}

/** Fallback Pexels query when the writer dropped one for a photo-hero slide. */
function inferPhotoQuery(slideTitle: string, keyword: string): string {
  const blob = `${slideTitle} ${keyword}`.toLowerCase();
  if (/intern|career|graduate|cv|resume|recruit|hire/.test(blob)) return "young professional smiling laptop";
  if (/network|team|meeting|collab/.test(blob)) return "diverse team office meeting";
  if (/skill|learn|study|study/.test(blob)) return "student studying laptop coffee";
  if (/interview/.test(blob)) return "confident professional handshake interview";
  return "young professional confident portrait";
}
