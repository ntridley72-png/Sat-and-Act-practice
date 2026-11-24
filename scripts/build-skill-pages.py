"""Digital SAT skill pages: one page per official skill, plus a hub per section.

Each page says what the skill asks for and how to approach it (written by hand below), shows sample questions from the
FunSAT bank with their answers and explanations in plain HTML, and links into the app to drill that skill. The questions
come from the corrected bank (scripts/dump-bank.cjs runs the app's own quality and logic-audit passes), and only
questions that pass those checks are shown. Run after build-hubs.py and before build-sitemaps.py.

Skill names and domains follow the College Board's published Digital SAT test specifications.
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from seo_common import ORIGIN, ROOT, TODAY, breadcrumbs, e, faq_schema, page, write  # noqa: E402

# official skill -> (section, domain, bank skill names, what it tests, approach bullets)
SKILLS = [
    # ---------------- Math: Algebra
    ("Linear equations in one variable", "math", "Algebra", ["Linear equations in one variable"],
     "Solve an equation like 3(x - 4) = 2x + 5 for x, or build one from a short word problem and solve it. Some items ask how many solutions an equation has.",
     ["Clear parentheses and fractions first, then collect x on one side.",
      "For 'how many solutions', simplify both sides: the same x-coefficient with different constants means no solution; identical sides mean infinitely many.",
      "Check the answer by substituting it back in; it takes seconds and catches sign slips."]),
    ("Linear functions", "math", "Algebra", ["Linear functions"],
     "Read and use a function of the form f(x) = mx + b: find a value, interpret the slope or intercept in context, or match a table or graph to the function.",
     ["Slope is the change in output per one unit of input; say its units out loud (dollars per hour, meters per second).",
      "The y-intercept is the output when the input is 0, often a starting amount or fixed fee.",
      "From two points, slope = (y2 - y1) / (x2 - x1); then use one point to find b."]),
    ("Linear equations in two variables", "math", "Algebra", ["Linear equations in two variables"],
     "Work with an equation like 4x + 3y = 24: find intercepts or slope, check which point lies on the line, or model a situation with two unknown amounts.",
     ["Set x = 0 or y = 0 to get intercepts quickly.",
      "Solve for y to read the slope: y = -(4/3)x + 8.",
      "In word problems, each term is (rate) x (count); match the coefficients to the story."]),
    ("Systems of two linear equations in two variables", "math", "Algebra", ["Systems of two linear equations"],
     "Solve two linear equations together, decide whether a system has one, none or infinitely many solutions, or set up a system from a word problem.",
     ["Use elimination when coefficients already line up; substitution when one variable is alone.",
      "No solution: same slope, different intercepts. Infinitely many: one equation is a multiple of the other.",
      "Desmos is fast here: graph both lines and read the intersection."]),
    ("Linear inequalities in one or two variables", "math", "Algebra", ["Linear inequalities", "Linear inequalities in one variable"],
     "Solve an inequality, find the least or greatest integer that works, or write an inequality for a budget, capacity or minimum-requirement situation.",
     ["Solve like an equation, but flip the sign when you multiply or divide by a negative.",
      "'At least' means >=, 'at most' and 'no more than' mean <=.",
      "For the least integer, solve, then round in the direction the inequality allows."]),
    # ---------------- Math: Advanced Math
    ("Nonlinear functions", "math", "Advanced Math", ["Nonlinear functions", "Exponential functions"],
     "Use quadratic, exponential and other nonlinear functions: evaluate them, read growth or decay rates, connect a graph's vertex or intercepts to its equation, and interpret parameters in context.",
     ["In y = a(1 + r)^t, r is the percent change per period; (1 - r) means decay.",
      "Vertex form a(x - h)^2 + k shows the vertex (h, k) directly; factored form shows the x-intercepts.",
      "When a question gives a graph, read exact points from it before doing algebra."]),
    ("Nonlinear equations in one variable and systems of equations in two variables", "math", "Advanced Math",
     ["Nonlinear equations", "Quadratic equations", "Radical equations"],
     "Solve quadratic, radical, rational and absolute-value equations, or a system where one equation is a line and the other a parabola or circle.",
     ["Factor first; use the quadratic formula when factoring is not quick. The discriminant b^2 - 4ac tells you how many real solutions.",
      "After squaring both sides of a radical equation, check every answer in the original; extra roots appear.",
      "For a line and a parabola, substitute the line into the parabola and solve the quadratic."]),
    ("Equivalent expressions", "math", "Advanced Math", ["Equivalent expressions"],
     "Rewrite expressions: expand, factor, combine rational expressions, or use exponent rules to find which form is equivalent.",
     ["Pick a simple number for x (like 2) and evaluate the original and each choice; the matching value is the answer.",
      "Know the patterns: a^2 - b^2 = (a - b)(a + b) and (a + b)^2 = a^2 + 2ab + b^2.",
      "Exponents: x^a * x^b = x^(a+b), (x^a)^b = x^(ab), and x^(1/2) is the square root of x."]),
    # ---------------- Math: Problem-Solving and Data Analysis
    ("Ratios, rates, proportional relationships, and units", "math", "Problem-Solving & Data Analysis",
     ["Ratios and proportional relationships", "Unit rates"],
     "Set up and solve proportions, compare unit rates, and convert units (including squared or cubic units) in real-world contexts.",
     ["Write units on every number; they tell you whether to multiply or divide.",
      "For a ratio a:b, the parts are a/(a+b) and b/(a+b) of the whole.",
      "Square and cubic units convert by the square or cube of the linear factor: 1 ft^2 = 144 in^2."]),
    ("Percentages", "math", "Problem-Solving & Data Analysis", ["Percentages"],
     "Find a percent of a number, a percent change, or an original amount before an increase or discount, including successive percent changes.",
     ["Percent change = (new - old) / old.",
      "An increase of p% multiplies by (1 + p/100); a decrease multiplies by (1 - p/100).",
      "Successive changes multiply: up 20% then down 20% is 1.2 x 0.8 = 0.96, a 4% net decrease."]),
    ("One-variable data: distributions and measures of center and spread", "math", "Problem-Solving & Data Analysis",
     ["Measures of center", "Measures of spread"],
     "Compute or compare mean, median, range and standard deviation from lists, dot plots, histograms and frequency tables, and predict how a change to the data moves them.",
     ["The median resists outliers; the mean moves toward them.",
      "Standard deviation measures how spread out values are from the mean, not how large they are.",
      "For a frequency table, the median is the middle position of the full list, not the middle row."]),
    ("Two-variable data: models and scatterplots", "math", "Problem-Solving & Data Analysis", ["Scatterplots"],
     "Read scatterplots and lines of best fit, interpret the slope and intercept of a model, and use it to predict values.",
     ["The slope of a fitted line is the predicted change in y for each one-unit increase in x.",
      "A prediction from the line is an estimate; the actual data point can sit above or below it.",
      "Linear models add a constant amount each step; exponential models multiply by a constant factor."]),
    ("Probability and conditional probability", "math", "Problem-Solving & Data Analysis",
     ["Probability", "Probability and conditional probability"],
     "Find simple and conditional probabilities, usually from a two-way table or a description of outcomes.",
     ["Probability = favorable outcomes / total outcomes.",
      "For 'given that', shrink the total to the given group: use that row or column total as the denominator.",
      "Read the table labels twice; most errors come from using the grand total instead of a row total."]),
    ("Inference from sample statistics and margin of error", "math", "Problem-Solving & Data Analysis", ["Statistical inference"],
     "Decide what a random sample supports about a population, use a margin of error to state a plausible range, and judge how sample size affects precision.",
     ["Results from a random sample generalize only to the population the sample was drawn from.",
      "Estimate +/- margin of error gives the plausible range; it is not a guarantee.",
      "Larger random samples give smaller margins of error."]),
    # ---------------- Math: Geometry and Trigonometry
    ("Area and volume", "math", "Geometry & Trigonometry", ["Area and volume"],
     "Find area, surface area or volume of common shapes and solids, often after a scale change or with a missing dimension.",
     ["The reference sheet in the test gives the formulas; know where each one is.",
      "Scaling every length by k multiplies area by k^2 and volume by k^3.",
      "Break odd shapes into rectangles, triangles and circles."]),
    ("Lines, angles, and triangles", "math", "Geometry & Trigonometry", ["Lines, angles, and triangles", "Angles", "Similar triangles"],
     "Use parallel-line angle relationships, triangle angle sums, and similar triangles to find missing angles or lengths.",
     ["Angles on a line sum to 180 degrees; the angles of a triangle also sum to 180.",
      "With parallel lines, alternate interior and corresponding angles are equal.",
      "Similar triangles have equal angles and proportional sides; set up the ratio with matching sides."]),
    ("Right triangles and trigonometry", "math", "Geometry & Trigonometry",
     ["Right triangles and trigonometry", "Right triangles", "Right triangle trigonometry"],
     "Use the Pythagorean theorem, special right triangles, and sine, cosine and tangent in right triangles.",
     ["SOH-CAH-TOA: sin = opposite/hypotenuse, cos = adjacent/hypotenuse, tan = opposite/adjacent.",
      "In a right triangle, sin of one acute angle equals cos of the other.",
      "Special triangles: 45-45-90 sides x, x, x*sqrt(2); 30-60-90 sides x, x*sqrt(3), 2x."]),
    ("Circles", "math", "Geometry & Trigonometry", ["Circles"],
     "Work with circumference, area, arc length and sector area, and with circle equations of the form (x - h)^2 + (y - k)^2 = r^2.",
     ["Arc length and sector area are the same fraction of the whole circle as the central angle is of 360 degrees.",
      "The equation (x - h)^2 + (y - k)^2 = r^2 has center (h, k) and radius r.",
      "If the equation is expanded, complete the square in x and in y to find the center and radius."]),
    # ---------------- Reading and Writing: Information and Ideas
    ("Central Ideas and Details", "rw", "Information & Ideas", ["Central Ideas and Details"],
     "Identify the main idea of a short passage or a detail it states directly.",
     ["Say the main point in your own words before you look at the choices.",
      "Wrong choices are often true details that are too narrow, or claims that go beyond the text.",
      "The correct answer is supported by the text, not just plausible."]),
    ("Command of Evidence", "rw", "Information & Ideas", ["Command of Evidence", "Quantitative Evidence"],
     "Choose the quotation, finding or data from a table or graph that best supports or weakens a stated claim.",
     ["Restate the exact claim first; the answer must address that claim, not the topic in general.",
      "For data questions, check every number in the choice against the graph or table.",
      "A choice can be accurate about the data and still not support the claim."]),
    ("Inferences", "rw", "Information & Ideas", ["Inferences"],
     "Pick the choice that most logically completes the passage, based only on what the text establishes.",
     ["The answer follows from the passage's own reasoning; outside knowledge does not count.",
      "Look for the gap the last sentence sets up, then fill it as narrowly as possible.",
      "Extreme words (always, never, proves) are rarely supported."]),
    # ---------------- Reading and Writing: Craft and Structure
    ("Words in Context", "rw", "Craft & Structure", ["Words in Context"],
     "Choose the word or phrase that is most logical and precise in a sentence, based on the surrounding context.",
     ["Cover the choices and predict a word from the context clues.",
      "Check tone and direction: is the blank positive, negative, a contrast, a cause?",
      "A familiar word with the wrong shade of meaning is the most common trap."]),
    ("Text Structure and Purpose", "rw", "Craft & Structure", ["Text Structure and Purpose"],
     "Describe the main purpose of a passage or the function of one sentence within it.",
     ["Ask what the author is doing (describing, arguing, contrasting, introducing a problem), not just what the text says.",
      "For one sentence, look at what comes right before and after it.",
      "Purpose answers start with verbs; check that the verb matches the author's move."]),
    ("Cross-Text Connections", "rw", "Craft & Structure", ["Cross-Text Connections"],
     "Read two short texts on the same topic and predict how one author would respond to the other.",
     ["Summarize each text's claim in one line before reading the choices.",
      "Find the exact point where the authors agree or disagree.",
      "The right answer reflects the second author's stated view, not a general attitude."]),
    # ---------------- Reading and Writing: Expression of Ideas
    ("Rhetorical Synthesis", "rw", "Expression of Ideas", ["Rhetorical Synthesis"],
     "Use a student's bulleted notes to write a sentence that accomplishes a stated goal, such as emphasizing a difference or introducing a study.",
     ["Read the goal in the question first; it decides the answer.",
      "Every choice uses accurate notes, so judge only whether it meets the goal.",
      "If the goal names two things (a similarity and a reason), the answer must include both."]),
    ("Transitions", "rw", "Expression of Ideas", ["Transitions"],
     "Choose the transition word or phrase that shows the logical relationship between ideas.",
     ["Name the relationship first: contrast, cause and effect, example, addition, or sequence.",
      "Read the sentence before the blank and the sentence with it, not just the blank's sentence.",
      "Choices that mean the same thing (however, nevertheless) cannot both be right, so eliminate both if one is wrong."]),
    # ---------------- Reading and Writing: Standard English Conventions
    ("Boundaries", "rw", "Standard English Conventions", ["Boundaries", "Punctuation"],
     "Punctuate between and within sentences: commas, semicolons, colons, dashes, and how they join or separate clauses.",
     ["Two complete sentences need a period, a semicolon, or a comma plus a FANBOYS conjunction (for, and, nor, but, or, yet, so).",
      "A colon follows a complete sentence and introduces an explanation, list or example.",
      "Nonessential information is set off by a matching pair: two commas or two dashes."]),
    ("Form, Structure, and Sense", "rw", "Standard English Conventions",
     ["Subject-Verb Agreement", "Verb tense", "Pronouns", "Possessives", "Modifiers", "Parallel structure"],
     "Choose the correct verb form, pronoun, possessive or plural, and keep modifiers and lists grammatically consistent.",
     ["Find the true subject; ignore prepositional phrases between it and the verb.",
      "A pronoun must match its antecedent in number; its = belonging to it, it's = it is.",
      "A modifier at the start of a sentence describes the noun right after the comma."]),
]

SECTION_HUB = {
    "math": ("/sat-math/", "SAT Math Practice by Skill", "SAT math"),
    "rw": ("/sat-reading-writing/", "SAT Reading and Writing Practice by Skill", "SAT Reading and Writing"),
}
DOMAIN_ORDER = {
    "math": ["Algebra", "Advanced Math", "Problem-Solving & Data Analysis", "Geometry & Trigonometry"],
    "rw": ["Information & Ideas", "Craft & Structure", "Expression of Ideas", "Standard English Conventions"],
}
SAMPLES = 4


def slug(name):
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return {"nonlinear-equations-in-one-variable-and-systems-of-equations-in-two-variables": "nonlinear-equations",
            "one-variable-data-distributions-and-measures-of-center-and-spread": "one-variable-data",
            "ratios-rates-proportional-relationships-and-units": "ratios-rates-and-units",
            "inference-from-sample-statistics-and-margin-of-error": "statistical-inference",
            "systems-of-two-linear-equations-in-two-variables": "systems-of-linear-equations",
            "linear-inequalities-in-one-or-two-variables": "linear-inequalities"}.get(s, s)


def load_bank():
    out = subprocess.run(["node", str(ROOT / "scripts" / "dump-bank.cjs")], capture_output=True, text=True, check=True).stdout
    return [q for q in json.loads(out) if not q.get("withheld") and q.get("exp")]


def coherent(q):
    """A writing item's passage must contain the sentence being edited; templated items that pair a fixed sentence with an
    unrelated passage are left off these pages."""
    if q.get("kind") != "writing" or not q.get("passage"):
        return True
    head = re.split(r"_{2,}", q["q"])[0].strip()[:28].lower()
    return bool(head) and head in q["passage"].lower()


def pick_samples(qs):
    """Deterministic: prefer items with per-choice explanations, one per family and stem, spread across difficulty."""
    seen, out = set(), []
    def key(q):
        big = 1 if re.search(r"\d{4,}", q["q"].replace(",", "")) else 0   # SAT-sized numbers read as real questions
        return (big, 0 if q.get("dw") else 1, 1 if q.get("templateVariant") else 0, hashlib.sha1(q["id"].encode()).hexdigest())
    pool = sorted([q for q in qs if coherent(q)], key=key)
    for diff in ("easy", "medium", "hard", None):
        for q in pool:
            if len(out) >= SAMPLES:
                break
            stem = re.sub(r"\d+", "#", q["q"])[:60]
            fam = q.get("family") or q["id"]
            # Templated items share an explanation pattern; one example of each pattern is enough.
            pattern = "x:" + re.sub(r"'[^']*'|\d+|[^a-z ]", "", q["exp"].lower())[:50]
            if q in out or fam in seen or stem in seen or pattern in seen or (diff and q.get("diff") != diff):
                continue
            out.append(q)
            seen.update({fam, stem, pattern})
            if diff:
                break
    return out[:SAMPLES]


def para(text):
    return "".join(f"<p>{e(t)}</p>" for t in str(text).split("\n") if t.strip())


def question_html(i, q):
    letters = "ABCDE"
    parts = [f'<section class="gq" id="q{i}"><h3>Sample question {i} <small class="muted">({e(q.get("diff") or "medium")})</small></h3>']
    if q.get("passage") and q["passage"][:40] not in q["q"]:
        parts.append(f'<blockquote class="gq-passage">{para(q["passage"])}</blockquote>')
    parts.append(f'<div class="gq-stem">{para(q["q"])}</div>')
    if q.get("kind") == "gridin":
        parts.append('<p class="muted">Type your answer (a number, decimal or fraction).</p>')
        answer = e(q.get("answer") or q["choices"][0])
    else:
        parts.append('<ol class="gq-choices" type="A">' + "".join(f"<li>{e(c)}</li>" for c in q["choices"]) + "</ol>")
        answer = f'{letters[q["ans"]]}) {e(q["choices"][q["ans"]])}'
    why = ""
    dw = q.get("dw") or []
    if dw and q.get("kind") != "gridin":
        wrong = [i2 for i2 in range(len(q["choices"])) if i2 != q["ans"]]
        if len(dw) == len(wrong):
            why = "<p><strong>Why the others are wrong:</strong></p><ul>" + "".join(
                f"<li>{letters[w]}) {e(t)}</li>" for w, t in zip(wrong, dw)) + "</ul>"
    parts.append(f'<details class="gq-ans"><summary>Show the answer and explanation</summary><p><strong>Answer:</strong> {answer}</p>{para(q["exp"])}{why}</details></section>')
    return "".join(parts)


def app_link(section, domain, bank_skill):
    key = "|".join(["sat", section, domain, bank_skill])
    return "/?practice=" + "%7C".join(part.replace(" ", "%20").replace("&", "%26") for part in key.split("|"))


def sup(text):
    """Squares and cubes as superscripts in the hand-written text (x^2 -> x²); other exponents stay readable as ^."""
    return re.sub(r"\^3(?![0-9(])", "³", re.sub(r"\^2(?![0-9(])", "²", text))


def skill_page(spec, bank, siblings):
    name, section, domain, bank_skills, what, how = spec
    what, how = sup(what), [sup(t) for t in how]
    hub_path, hub_title, sec_label = SECTION_HUB[section]
    path = f"{hub_path}{slug(name)}/"
    qs = [q for q in bank if q["section"] == section and q.get("skill") in bank_skills]
    samples = pick_samples(qs)
    # One drill link per (domain, skill) pair the app's skill picker actually uses, with that pair's own count.
    pairs = {}
    for q in qs:
        pairs[(q.get("domain"), q["skill"])] = pairs.get((q.get("domain"), q["skill"]), 0) + 1
    title = f"SAT {name}: Practice Questions with Explanations"
    desc = (f"Free Digital SAT {name.lower()} practice: what the test asks, how to approach it, {len(samples)} worked examples "
            f"and {len(qs)} questions to drill, no account needed.")
    drill = "".join(f'<li><a href="{app_link(section, d, s)}">Drill {e(s.lower())}{" (" + e(d) + ")" if d != domain else ""}</a> '
                    f'<span class="muted">({n} questions)</span></li>'
                    for (d, s), n in sorted(pairs.items(), key=lambda kv: -kv[1]))
    sib = " &middot; ".join(f'<a href="{SECTION_HUB[section][0]}{slug(s[0])}/">{e(s[0])}</a>' for s in siblings if s[0] != name)
    body = (f'<nav class="gnav"><a href="/">&larr; FunSAT</a><a href="{hub_path}">{e(hub_title)}</a></nav>'
            f'<p class="gkicker">{e(sec_label)} &middot; {e(domain)}</p>'
            f'<h1>SAT {e(name)}</h1>'
            f'<p class="glead">{e(what)}</p>'
            f'<h2>How to approach it</h2><ul>' + "".join(f"<li>{e(t)}</li>" for t in how) + '</ul>'
            f'<h2>Practice this skill</h2><p>FunSAT has {len(qs)} original practice questions for this skill, each checked for a single '
            f'correct answer and an explanation. Drills run in the browser with no account; progress stays on your device.</p>'
            f'<ul class="gdrill">{drill}</ul>'
            f'<h2>Sample questions</h2><p class="muted">Original questions written in the style of the Digital SAT. They are not '
            f'official College Board items, and FunSAT is not affiliated with the College Board.</p>'
            + "".join(question_html(i + 1, q) for i, q in enumerate(samples)) +
            f'<h2>Other {e(domain)} skills</h2><p>{sib}</p>'
            f'<p><a href="{hub_path}">All {e(sec_label)} skills</a> &middot; <a href="/sat-practice-test/">Take a full practice test</a></p>')
    faqs = [(f"What does the SAT test in {name.lower()}?", what),
            (f"How should I approach SAT {name.lower()} questions?", " ".join(how))]
    schema = [breadcrumbs([("Home", "/"), (hub_title, hub_path), (name, path)]), faq_schema(faqs),
              {"@type": "LearningResource", "name": title, "url": ORIGIN + path, "educationalLevel": "High school",
               "learningResourceType": "Practice questions", "teaches": f"Digital SAT {name}", "isAccessibleForFree": True,
               "inLanguage": "en", "dateModified": TODAY}]
    return path, page(path=path, title=title, description=desc, body=body, schema=schema), len(qs)


def hub_page(section, specs, counts):
    hub_path, hub_title, sec_label = SECTION_HUB[section]
    other = SECTION_HUB["rw" if section == "math" else "math"]
    blocks = []
    for domain in DOMAIN_ORDER[section]:
        rows = [s for s in specs if s[2] == domain]
        blocks.append(f"<h2>{e(domain)}</h2><ul>" + "".join(
            f'<li><a href="{hub_path}{slug(s[0])}/">{e(s[0])}</a> <span class="muted">({counts[s[0]]} questions)</span> &mdash; {e(sup(s[4]))}</li>'
            for s in rows) + "</ul>")
    intro = ("The Digital SAT Math section has 44 questions in two modules, and the Desmos graphing calculator is allowed on all of them. "
             "Questions come from four content domains; each skill below has its own page with worked examples and a drill."
             if section == "math" else
             "The Digital SAT Reading and Writing section has 54 short-passage questions in two modules. "
             "Each question tests one skill from four content domains; each skill below has its own page with worked examples and a drill.")
    body = (f'<nav class="gnav"><a href="/">&larr; FunSAT</a><a href="/sat-practice/">SAT practice</a></nav>'
            f'<p class="gkicker">Digital SAT &middot; Practice by skill</p><h1>{e(hub_title)}</h1><p class="glead">{e(intro)}</p>'
            + "".join(blocks) +
            f'<p><a href="{other[0]}">{e(other[1])}</a> &middot; <a href="/sat-practice-test/">Full practice test</a> &middot; '
            f'<a href="/score-calculator/">Score calculator</a></p>')
    desc = f"Free {sec_label} practice by skill: every Digital SAT {sec_label} skill with worked examples, explanations and a drill. No account needed."
    schema = [breadcrumbs([("Home", "/"), ("SAT practice", "/sat-practice/"), (hub_title, hub_path)]),
              {"@type": "CollectionPage", "name": hub_title, "url": ORIGIN + hub_path, "dateModified": TODAY}]
    return hub_path, page(path=hub_path, title=hub_title + " | FunSAT", description=desc, body=body, schema=schema)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public")
    out = (ROOT / ap.parse_args().out).resolve()
    bank = load_bank()
    n = 0
    for section in ("math", "rw"):
        specs = [s for s in SKILLS if s[1] == section]
        counts = {}
        for spec in specs:
            siblings = [s for s in specs if s[2] == spec[2]]
            path, html, count = skill_page(spec, bank, siblings)
            counts[spec[0]] = count
            write(out / path.strip("/") / "index.html", html)
            n += 1
        path, html = hub_page(section, specs, counts)
        write(out / path.strip("/") / "index.html", html)
        n += 1
    print(f"  SAT skill pages: {n} (2 hubs)")


if __name__ == "__main__":
    main()
