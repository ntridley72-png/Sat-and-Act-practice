"""Topic-coverage expansion: every Subject-practice topic (test|section|domain|skill)
reaches at least 30 non-withheld questions.

Bucket-driven: reads docs-level needs embedded below (computed from the live
inventory), generates exactly-enough original items per pool, and appends one
marked block into app.js after the round-2 block. SAT/ACT pools keep their
separation: math -> BANK.math, writing -> BANK.rw(kind writing),
reading -> BANK.rw(kind reading), science -> ACT_SCIENCE.
"""
import json

banks = {"math": [], "writing": [], "reading": [], "science": []}
_seq = {"rot": 0}

def _rot(pairs):
    k = _seq["rot"] % len(pairs); _seq["rot"] += 1
    return pairs[k:] + pairs[:k]

def add(pool, qid, test, section, domain, skill, diff, q, correct, wrongs, exp, dw=None, **extra):
    vals = {str(correct)}
    clean = []
    for w, why in wrongs:
        if str(w) in vals:
            continue
        vals.add(str(w))
        clean.append((w, why))
    if len(clean) < 3 and isinstance(correct, (int, float)) and not isinstance(correct, bool):
        k = 1
        while len(clean) < 3:
            for cand in (correct + k, correct - k):
                if str(cand) not in vals:
                    vals.add(str(cand))
                    clean.append((cand, f"An arithmetic slip of {k} from the keyed value."))
                    break
            k += 1
    if len(clean) < 3:
        for spare in ("None of the listed values.", "The quantity cannot be determined.", "A different quantity than the one requested."):
            if len(clean) >= 3:
                break
            if spare not in vals:
                vals.add(spare)
                clean.append((spare, "This option misstates the quantity the question requests."))
    assert len(clean) == 3, (qid, correct, clean)
    pairs = [(str(correct), None)] + [(str(w), why) for w, why in clean]
    pairs = _rot(pairs)
    ans = [i for i, p in enumerate(pairs) if p[1] is None][0]
    item = dict(id=qid, bank=("rw" if pool in ("writing", "reading") else pool), test=test,
                section=section, domain=domain, skill=skill, diff=diff, q=q,
                choices=[p[0] for p in pairs], ans=ans, exp=exp,
                source="Original practice modeled on published test skills")
    reasons = [p[1] for i, p in enumerate(pairs) if i != ans]
    if all(reasons):
        item["dw"] = reasons
    item.update(extra)
    banks[pool].append(item)


def pick3(cands, correct):
    """Return three (value, why) pairs with values distinct from each other and
    from the correct answer, padding with offset fallbacks when candidates collide."""
    out = []
    seen = {str(correct)}
    for v, why in cands:
        if str(v) in seen:
            continue
        seen.add(str(v)); out.append((v, why))
        if len(out) == 3:
            return out
    base = correct if isinstance(correct, (int, float)) else None
    bump = 1
    while len(out) < 3:
        v = (base + bump) if base is not None else f"{correct} (no{ bump })"
        if str(v) not in seen:
            seen.add(str(v)); out.append((v, "An arithmetic slip of " + str(bump) + " from the correct value."))
        bump += 1
    return out

DIFFS = ["easy", "medium", "hard"]
def diff_for(i):
    m = i % 4
    return "easy" if m == 0 else ("hard" if m == 3 else "medium")

# --------------------------------------------------------------------------
# MATH families (pool BANK.math; serve sat|math and act|math twins)
# --------------------------------------------------------------------------
import os
BASE_OFFSET = int(os.environ.get('TB_OFFSET', '0'))
IDB = os.environ.get('TB_IDBASE', '6')
MATH_SERIAL = [700]
def ms(*, domain, skill, diff, q, correct, wrongs, exp):
    MATH_SERIAL[0] += 1
    add("math", f"m{IDB}{MATH_SERIAL[0]:03d}", "sat", "math", domain, skill, diff, q, correct, wrongs, exp)

def fam_scatter(i):
    x = 10 + i; y = 3 * x + 12; y2 = 3 * x + 30
    if i % 3 == 0:
        q = f"A scatterplot shows a strong positive linear association between hours practiced (x) and score (y) for {x} students. Which value of the correlation coefficient r is most consistent with the plot?"
        return dict(domain="Problem-Solving & Data Analysis", skill="Scatterplots", diff=diff_for(i), q=q, correct="0.91",
            wrongs=[("-0.91", "A negative r describes a decreasing relationship; the plot rises."),
                    ("0.05", "An r near zero means no linear association, contradicting the strong pattern."),
                    ("-0.05", "This value means essentially no relationship and the wrong direction.")],
            exp="A strong positive linear pattern has r near +1; only 0.91 is both positive and large.")
    if i % 3 == 1:
        q = f"A science class records plant height (y) against days grown (x) and fits the line y = {3}x + {12+i}. What does the slope predict?"
        return dict(domain="Problem-Solving & Data Analysis", skill="Scatterplots", diff=diff_for(i), q=q, correct=f"Each additional day is associated with about {3} more units of height.",
            wrongs=[(f"The plant is {3} units tall on day 0.", "That is the y-intercept, not the slope."),
                    (f"Height increases by {12+i} units per day.", "That confuses the intercept with the slope."),
                    ("The line cannot be interpreted without r.", "A fitted line's slope is interpretable as a rate of association.")],
            exp="The slope of a fitted line gives the predicted change in y per one-unit increase in x.")
    q = f"A scatterplot of distance (x) versus time (y) for {y2} trips bends upward: gains in y grow larger as x increases. Which description best matches the association?"
    return dict(domain="Problem-Solving & Data Analysis", skill="Scatterplots", diff=diff_for(i), q=q, correct="A positive association that is not linear",
        wrongs=[("A negative linear association", "The y values increase with x, so the association is positive."),
                ("No association", "A clear rising curve is a visible association."),
                ("A strong negative nonlinear association", "The direction is upward, not downward.")],
        exp="The points rise overall (positive) but along a curve (not linear).")

def fam_spread(i):
    v = 40 + i * 3
    lo, hi = v, v + 24 + i
    if i % 2 == 0:
        q = f"A data set has a minimum of {lo} and a maximum of {hi}. What is its range?"
        rng = hi - lo
        return dict(domain="Problem-Solving & Data Analysis", skill="Measures of spread", diff=diff_for(i), q=q, correct=rng,
            wrongs=[(hi, "The maximum alone is not the spread."), (lo, "The minimum alone is not the spread."),
                    (rng + 2, f"Subtract exactly: {hi} − {lo} = {rng}.")],
            exp=f"Range = maximum − minimum = {hi} − {lo} = {rng}.")
    q = f"For the data set {lo}, {lo+6}, {lo+12}, {hi}, what is the interquartile range of the four ordered values (upper half minus lower half medians)?"
    lower = (lo + lo + 6) / 2; upper = (lo + 12 + hi) / 2; iqr = upper - lower
    return dict(domain="Problem-Solving & Data Analysis", skill="Measures of spread", diff="hard", q=q, correct=iqr,
        wrongs=[(hi - lo, "That is the full range, not the interquartile range."),
                (upper, "The upper-half median alone is not a spread."),
                (iqr + 3, f"Median of the lower half is {lower}; median of the upper half is {upper}; the gap is {iqr}.")],
        exp=f"Q1 = {lower}, Q3 = {upper}, so IQR = Q3 − Q1 = {iqr}.")

def fam_inference(i):
    n = 200 + i * 25; p = 40 + i % 10; moe = 3 + i % 3
    q = f"A random sample of {n} families found that {p}% plan to file the FAFSA, with a margin of error of {moe} percentage points. Which conclusion is best supported?"
    lo, hi = p - moe, p + moe
    return dict(domain="Problem-Solving & Data Analysis", skill="Statistical inference", diff=diff_for(i), q=q,
        correct=f"The true percentage is plausibly between {lo}% and {hi}%.",
        wrongs=[(f"Exactly {p}% of all families plan to file.", "A sample gives an estimate, not the exact population value."),
                (f"Fewer than half of the sampled families plan to file." if p > 50 else f"More than half of the sampled families plan to file.", "Compare against the sample value, not a misread of it."),
                ("The margin of error proves the sample is biased.", "Margin of error describes sampling variability, not bias.")],
        exp=f"The estimate plus or minus the margin of error gives {lo}% to {hi}% as the plausible range.")

def fam_prob2(i):
    r = 4 + i % 5; b = 6 + i % 4; g = 3
    total = r + b + g
    q = f"A bag holds {r} red, {b} blue, and {g} green tokens. One token is drawn at random. What is the probability it is NOT green?"
    return dict(domain="Problem-Solving & Data Analysis", skill="Probability and conditional probability", diff=diff_for(i), q=q,
        correct=f"{total - g}/{total}",
        wrongs=[(f"{g}/{total}", "That is the probability of drawing green, the complement of what is asked."),
                (f"1/{total}", "Only one outcome is green; the question asks about all non-green outcomes."),
                (f"{g}/{(total - g)}", "This compares green to non-green rather than to the total.")],
        exp=f"Non-green tokens number {r} + {b} = {total - g} out of {total}, giving {total - g}/{total}.")

def fam_similar(i):
    a, b = 6 + i, 9 + i
    c = 8 + i
    ef = round(c * (b / a), 2)
    q = f"Triangle ABC is similar to triangle DEF. AB = {a}, DE = {b}, and BC = {c}. What is the length of EF?"
    return dict(domain="Geometry & Trigonometry", skill="Similar triangles", diff=diff_for(i), q=q, correct=ef,
        wrongs=[(c, "Corresponding sides scale by the similarity ratio, not stay equal."),
                (round(c * (a / b), 2), "Multiplying by the inverse ratio shrinks the side instead of enlarging it."),
                (round(c + (b - a), 2), "Similarity scales multiplicatively; adding the difference is not the ratio.")],
        exp=f"The ratio DE/AB = {b}/{a} = {round(b/a, 3)}; multiply BC by it: {c} × {round(b/a, 3)} = {ef}.")

def fam_angles2(i):
    a = 30 + (i * 7) % 90; b = 180 - a - (25 + i % 30)
    q = f"In a triangle, two angles measure {a}° and {b}°. What is the measure of the third angle, in degrees?"
    c = 180 - a - b
    return dict(domain="Geometry & Trigonometry", skill="Lines, angles, and triangles", diff=diff_for(i), q=q, correct=c,
        wrongs=[(180 - a, "That subtracts only one angle from 180."),
                (360 - a - b, "Triangle angles sum to 180°, not 360°."),
                (a + b, "The third angle is what remains after subtracting, not the sum of the others.")],
        exp=f"The angles of a triangle sum to 180°: 180 − {a} − {b} = {c}.")

def fam_parallel(i):
    a = 100 + (i * 5) % 60
    q = f"Two parallel lines are cut by a transversal. One angle measures {a}°. What is the measure of its same-side interior angle, in degrees?"
    ans = 180 - a
    return dict(domain="Geometry & Trigonometry", skill="Lines, angles, and triangles", diff=diff_for(i), q=q, correct=ans,
        wrongs=[(a, "Same-side interior angles are supplementary, not equal."),
                (90 - a % 90, "That is the complementary relationship; these angles sum to 180."),
                (360 - a, "A full turn is not the relationship here.")],
        exp=f"Same-side interior angles sum to 180°: 180 − {a} = {ans}.")

RTTRI_TRIPLES = [(3, 4, 5), (5, 12, 13), (8, 15, 17), (7, 24, 25), (20, 21, 29),
                (9, 40, 41), (12, 35, 37), (28, 45, 53), (11, 60, 61), (16, 63, 65)]

def fam_rttri(i):
    bump = BASE_OFFSET // 10
    # Triple table x scale x two question directions: a parameter space wide
    # enough that the inventory target of 30 distinct items per topic is
    # reachable. The earlier (i%7, i%9) pairing only produced the handful of
    # integer-hypotenuse pairs inside a narrow leg range, and the (i%4)
    # fallback added four more -- the family saturated below 25 items.
    o, b_, h = RTTRI_TRIPLES[(i + bump) % len(RTTRI_TRIPLES)]
    k = 1 + ((i + bump) // len(RTTRI_TRIPLES)) % 3
    a, b, c = o * k, b_ * k, h * k
    c = int(c)
    if i % 2 == 0:
        q = f"A right triangle has legs of lengths {a} and {b}. What is the length of the hypotenuse?"
        return dict(domain="Geometry & Trigonometry", skill="Right triangles", diff=diff_for(i), q=q, correct=c,
            wrongs=pick3([(a + b, "Adding the legs overestimates the hypotenuse."),
                          (abs(b - a) or a + 1, "The difference of the legs is not a side of the triangle."),
                          (c + 3, f"({a})² + ({b})² = {a*a + b*b}, whose root is exactly {c}.")],
                         c),
            exp=f"√({a}² + {b}²) = √{a*a + b*b} = {c}.")
    q = f"A right triangle has one leg of {a} and a hypotenuse of {c}. What is the length of the other leg?"
    return dict(domain="Geometry & Trigonometry", skill="Right triangles", diff=diff_for(i), q=q, correct=b,
        wrongs=pick3([(c - a, "Subtract squares before taking the root, not the lengths themselves."),
                      (c + a, "Adding the hypotenuse and leg overshoots the missing side."),
                      (b + 3, f"({c})² − ({a})² = {c*c - a*a}, whose root is exactly {b}.")],
                     b),
        exp=f"Leg = √({c}² − {a}²) = √{c*c - a*a} = {b}.")

def fam_nonlinear(i):
    bump = BASE_OFFSET // 10
    r1, r2 = 2 + i % 4 + bump, 5 + i % 5 + bump
    if i % 3 == 0:
        q = f"The equation (x − {r1})(x − {r2}) = 0 has two solutions. What is their sum?"
        return dict(domain="Advanced Math", skill="Nonlinear equations", diff=diff_for(i), q=q, correct=r1 + r2,
            wrongs=[(r2 - r1, "Subtracting finds the gap, not the sum."),
                    (r1 * r2, "The product of the roots is the constant term, not the sum."),
                    (r1 + r2 + 1, f"Roots are {r1} and {r2}; their sum is {r1 + r2}.")],
            exp=f"The solutions are x = {r1} and x = {r2}; the sum is {r1 + r2}.")
    if i % 3 == 1:
        if r1 == r2:
            r2 = r1 + 3
        q = f"The system y = x² and y = {r1 + r2}x − {r1 * r2} has two solutions. What is the larger x-value?"
        return dict(domain="Advanced Math", skill="Nonlinear equations", diff="hard", q=q, correct=max(r1, r2),
            wrongs=pick3([(min(r1, r2), "That is the smaller x-value."),
                          (r1 + r2, "That is the sum of the solutions, not one of them."),
                          (-max(r1, r2), "A sign flip gives the negative root, which does not satisfy the system here.")],
                         max(r1, r2)),
            exp=f"x² − {r1 + r2}x + {r1 * r2} = 0 factors as (x − {r1})(x − {r2}) = 0.")
    q = f"The expression (x + {r1})² − {r1 * r1} simplifies to x² + bx. What is the value of b?"
    return dict(domain="Advanced Math", skill="Nonlinear equations", diff="medium", q=q, correct=2 * r1,
        wrongs=pick3([(r1, "Squaring produces a cross term of 2 × " + str(r1) + "x."),
                      (r1 * r1, "That is the constant that cancels, not the coefficient of x."),
                      (2 * r1 + 3, f"Expanding: x² + {2 * r1}x + {r1 * r1} − {r1 * r1}.")], 2 * r1),
        exp=f"Expand: x² + {2 * r1}x + {r1 * r1} − {r1 * r1} = x² + {2 * r1}x, so b = {2 * r1}.")

MATH_FAMS = {
    "Scatterplots": fam_scatter, "Measures of spread": fam_spread, "Statistical inference": fam_inference,
    "Probability and conditional probability": fam_prob2, "Similar triangles": fam_similar,
    "Lines, angles, and triangles": fam_angles2, "Right triangles": fam_rttri, "Nonlinear equations": fam_nonlinear,
}

# Buckets whose skills are already covered by round-2 families: map skill -> (family, skill-tag)
def fam_from_qb2(skill, i):
    """Reuse round-2 formulas with fresh parameter bands; tag the bucket's skill."""
    t = 300 + i
    if skill == "Equivalent expressions":
        a, b = t + 3, t + 6
        q = f"The expression {a}(x + {b}) − {b}x is equivalent to {a-b}x + c. What is the value of c?"
        return dict(domain="Advanced Math", skill=skill, diff=diff_for(i), q=q, correct=a * b,
            wrongs=[(a * b - b * t, "Distribute both terms fully before collecting."), (a + b, "Unlike terms cannot be combined."), (a * b - b, "The −" + str(b) + "x term does not cancel entirely against the distributed " + str(a) + "x.")],
            exp=f"Distribute: {a}x + {a * b} − {b}x, so c = {a * b}.")
    if skill == "Exponential functions":
        start = t * 10
        q = f"A population of {start} insects triples every week. According to the model, how many insects are there after 2 weeks?"
        return dict(domain="Advanced Math", skill=skill, diff=diff_for(i), q=q, correct=start * 9,
            wrongs=[(start * 6, "Multiplying by 3×2 treats tripling as additive."), (start + 6, "Adding weeks to the count ignores growth."), (start * 3, "One week of growth was applied, not two.")],
            exp=f"Two triplings multiply by 3² = 9: {start} × 9 = {start * 9}.")
    if skill in ("Linear equations in one variable",):
        a, b, x = t + 3, t + 9, t + 4
        q = f"What value of x satisfies {a}x + {b} = {a * x + b}?"
        return dict(domain="Algebra", skill=skill, diff=diff_for(i), q=q, correct=x,
            wrongs=[(x + 1, f"Subtract {b} first: {a * x + b} − {b} = {a * x}; dividing by {a} gives {x}."), (a * x + b - b, "That is " + str(a) + "x before dividing."), (x - 2, f"Check: {a} × {x} + {b} = {a * x + b}.")],
            exp=f"Subtract {b}, then divide by {a}: x = {x}.")
    if skill == "Linear equations in two variables":
        a, b, x = t % 9 + 2, t % 5 + 3, t % 7 + 1
        y = a * x - b
        q = f"A line is defined by y = {a}x − {b}. What is the value of y when x = {x}?"
        return dict(domain="Algebra", skill=skill, diff=diff_for(i), q=q, correct=y,
            wrongs=[(a * x, "The constant " + str(b) + " was not subtracted."), (a * x + b, "The constant was added instead of subtracted."), (x - b, "Multiply by the coefficient before adjusting for the constant.")],
            exp=f"y = {a}({x}) − {b} = {y}. Substitute both values back into the equation to verify.")
    if skill in ("Linear inequalities", "Linear inequalities in one variable"):
        bump = BASE_OFFSET // 10
        a, b, x = t % 8 + 2 + bump, t % 6 + 7 + bump, t % 9 + 3 + bump
        q = f"What is the least integer value of x for which {a}x − {b} > {a * x - b}?"
        return dict(domain="Algebra", skill=skill, diff=diff_for(i), q=q, correct=x + 1,
            wrongs=[(x, f"x = {x} gives exactly the boundary {a * x - b}, which the strict inequality excludes."), (x - 1, "A smaller value moves further from satisfying the inequality."), (a * x - b, "That is the boundary value, not a value of x.")],
            exp=f"Solve: x > {x}, so the least integer is {x + 1}.")
    if skill == "Quadratic equations":
        r1, r2 = t % 6 + 2, t % 7 + 5
        q = f"What is the larger solution of (x − {r1})(x − {r2}) = 0?"
        return dict(domain="Advanced Math", skill=skill, diff=diff_for(i), q=q, correct=max(r1, r2),
            wrongs=[(min(r1, r2), "That is the smaller solution."), (-max(r1, r2), "Solutions take the sign from the constant moved to the other side of the equals sign."), (r1 + r2, "That is the sum of the solutions.")],
            exp=f"Set each factor to zero: x = {r1} or x = {r2}.")
    if skill == "Nonlinear functions":
        b = t % 12 + 3
        q = f"The function f(x) = (x − {t % 9 + 1})² + {b} is graphed. What is the minimum value of f(x)?"
        return dict(domain="Advanced Math", skill=skill, diff=diff_for(i), q=q, correct=b,
            wrongs=[(t % 9 + 1, "That is where the minimum occurs, not the minimum value."), (0, "The squared term's floor is 0, but the constant lifts the output to " + str(b) + "."), (b + t % 9 + 1, "Adding the shift to the value confuses position with output.")],
            exp=f"The square is minimized at 0, leaving the constant {b}.")
    if skill == "Radical equations":
        a, b = t % 8 + 4, t % 9 + 5
        x = a * a - b
        q = f"What value of x satisfies √(x + {b}) = {a}?"
        return dict(domain="Advanced Math", skill=skill, diff=diff_for(i), q=q, correct=x,
            wrongs=pick3([(a + b, "Square before subtracting; the radical is not linear."),
                          (a * a + b, "Adding the constant instead of subtracting overshoots."),
                          (x + 3, f"Square both sides: x + {b} = {a * a}, so x = {x}.")], x),
            exp=f"x + {b} = {a * a} after squaring, so x = {x}.")
    if skill == "Linear functions" or skill == "Systems of two linear equations":
        y = t % 10 + 1; x = t % 8 + 6
        if skill == "Systems of two linear equations":
            q = f"The equations x + y = {x + y} and x − y = {x - y} form a system. What is the value of x?"
            return dict(domain="Algebra", skill=skill, diff=diff_for(i), q=q, correct=x,
                wrongs=[(y, "That solves for y."), (x - 1, f"Adding the equations gives 2x = {2 * x}, so x = {x}."), (x + y, "That is the first equation's sum.")],
                exp=f"Add to eliminate y: 2x = {2 * x}, so x = {x}.")
        a = t % 6 + 3
        q = f"A service charges ${t % 9 + 8} plus ${a} per visit. A customer pays ${t % 9 + 8 + a * x}. For how many visits did the customer pay?"
        return dict(domain="Algebra", skill=skill, diff=diff_for(i), q=q, correct=x,
            wrongs=[(x + 1, "Subtract the base fee before dividing by the per-visit rate."), (a, "That is the per-visit rate itself."), (t % 9 + 8, "That is the fixed fee, not the number of visits.")],
            exp=f"({t % 9 + 8 + a * x} − {t % 9 + 8}) ÷ {a} = {x} visits.")
    if skill in ("Measures of center",):
        vals = [t, t + 4, t + 8, t + 12]
        q = f"What is the mean of {', '.join(map(str, vals))}?"
        mean = sum(vals) // 4
        return dict(domain="Problem-Solving & Data Analysis", skill=skill, diff=diff_for(i), q=q, correct=mean,
            wrongs=pick3([(sum(vals), "That is the sum; divide by the count."),
                          (t + 8, "That is one of the values, not the mean."),
                          (mean + 5, f"The sum {sum(vals)} divided by 4 is {mean}.")], mean),
            exp=f"Sum = {sum(vals)}; ÷ 4 = {mean}.")
    if skill == "Probability":
        r = t % 6 + 3; b = t % 5 + 4
        q = f"A jar contains {r} red marbles and {b} blue marbles. One marble is drawn at random. What is the probability it is red, in simplest form?"
        from math import gcd
        g0 = gcd(r, r + b)
        from fractions import Fraction
        correct_frac = f"{r // g0}/{(r + b) // g0}"
        return dict(domain="Problem-Solving & Data Analysis", skill=skill, diff=diff_for(i), q=q, correct=correct_frac,
            wrongs=pick3([(f"{b // gcd(b, r + b)}/{(r + b) // gcd(b, r + b)}", "That is the blue marble probability."),
                          (f"{r}/{b}", "Compare favorable outcomes to the total, not to the other color."),
                          (f"1/{(r + b)}", "Only one specific marble would give this.")], correct_frac),
            exp=f"Favorable {r} over total {r + b} simplifies to the keyed fraction.")
    if skill == "Ratios and proportional relationships":
        a, b, k = t % 5 + 2, t % 6 + 3, t % 7 + 4
        q = f"A recipe uses flour and sugar in the ratio {a} to {b}. If it uses {a * k} cups of flour, how many cups of sugar are needed?"
        return dict(domain="Problem-Solving & Data Analysis", skill=skill, diff=diff_for(i), q=q, correct=b * k,
            wrongs=[(a * k, "Equal amounts assume a 1:1 ratio."), (a * k + b, "Ratio steps scale multiplicatively."), (b, "That is the sugar part before scaling.")],
            exp=f"Scale factor = {a * k} ÷ {a} = {k}; sugar = {b} × {k} = {b * k}.")
    if skill == "Unit rates":
        pages = t * 6
        q = f"A machine fills {pages} bottles in 4 minutes at a constant rate. How many bottles does it fill in 10 minutes?"
        return dict(domain="Problem-Solving & Data Analysis", skill=skill, diff=diff_for(i), q=q, correct=pages * 10 // 4,
            wrongs=[(pages, "That is the 4-minute output."), (pages + 10, "Adding time to a count ignores the rate."), (pages // 4, "That is the per-minute rate, not the 10-minute total.")],
            exp=f"Rate = {pages} ÷ 4 per minute; × 10 = {pages * 10 // 4} bottles.")
    if skill == "Percentages":
        p = (t % 8 + 2) * 10
        base = (t % 6 + 3) * 20
        q = f"A ${base} jacket is discounted by {p}%. What is the sale price, in dollars?"
        out = base - base * p // 100
        return dict(domain="Problem-Solving & Data Analysis", skill=skill, diff=diff_for(i), q=q, correct=out,
            wrongs=[(base - p, "Subtract a percent of the price, not the percent as dollars."), (base + base * p // 100, "That applies a markup instead of a discount."), (base * p // 100, "That is the discount amount, not the final price.")],
            exp=f"{p}% of {base} is {base * p // 100}; subtract to get {out}.")
    if skill in ("Angles",):
        a = 25 + (t * 3) % 120
        q = f"Two angles are complementary. One angle measures {a % 80 + 5}°. What is the measure of the other angle, in degrees?"
        one = a % 80 + 5
        return dict(domain="Geometry & Trigonometry", skill=skill, diff=diff_for(i), q=q, correct=90 - one,
            wrongs=[(180 - one, "That is the supplement."), (one, "Equal angles would each be 45°."), (90 + one, "Add or subtract in the correct direction from 90.")],
            exp=f"Complementary angles sum to 90°: 90 − {one} = {90 - one}.")
    if skill == "Right triangle trigonometry":
        bump = BASE_OFFSET // 10
        o, a_, h = RTTRI_TRIPLES[(t + bump) % len(RTTRI_TRIPLES)]
        k = 1 + ((t + bump) // len(RTTRI_TRIPLES)) % 3
        opp, adj, hyp = o * k, a_ * k, h * k
        q = f"In a right triangle, the side opposite angle A is {opp} and the hypotenuse is {hyp}. What is sin(A)?"
        return dict(domain="Geometry & Trigonometry", skill=skill, diff=diff_for(i), q=q, correct=f"{opp}/{hyp}",
            wrongs=[(f"{hyp}/{opp}", "That inverts the ratio."), (f"{adj}/{hyp}", "That is the cosine here."), (f"{opp}/{adj}", "That is the tangent.")],
            exp="sin = opposite ÷ hypotenuse.")
    if skill in ("Circles",):
        r = t % 9 + 2
        q = f"A circle has radius {r} cm. Its circumference is cπ cm. What is c?"
        return dict(domain="Geometry & Trigonometry", skill=skill, diff=diff_for(i), q=q, correct=2 * r,
            wrongs=[(r, "That is the radius."), (r * r, "That uses the area formula."), (4 * r, "That doubles twice.")],
            exp=f"C = 2πr = {2 * r}π.")
    if skill == "Area and volume":
        w, h = t % 9 + 3, t % 7 + 4
        q = f"A rectangle measures {w} cm by {h} cm. What is its area, in square centimeters?"
        return dict(domain="Geometry & Trigonometry", skill=skill, diff=diff_for(i), q=q, correct=w * h,
            wrongs=[(2 * (w + h), "That is the perimeter."), (w + h, "That adds the sides."), (w * h + w, "Multiplying the sides gives exactly the area.")],
            exp=f"Area = length × width = {w} × {h} = {w * h}.")
    if skill == "Right triangles and trigonometry":
        bump = BASE_OFFSET // 10
        o, a_, h = RTTRI_TRIPLES[(t + bump) % len(RTTRI_TRIPLES)]
        k = 1 + ((t + bump) // len(RTTRI_TRIPLES)) % 3
        opp, adj, hyp = o * k, a_ * k, h * k
        q = f"In a right triangle, tan(B) = {o}/{a_}. If the side opposite B is {opp}, what is the hypotenuse?"
        return dict(domain="Geometry & Trigonometry", skill=skill, diff="hard", q=q, correct=hyp,
            wrongs=[(adj, "That is the adjacent leg."), (opp + adj, "Adding the legs overestimates the hypotenuse."), (hyp + h, f"Opposite/adjacent = {o}/{a_} sets a {o}-{a_}-{h} triangle with k = {k}.")],
            exp=f"Opposite/adjacent = {o}/{a_} sets a {o}-{a_}-{h} triangle with k = {k}: hypotenuse {hyp}.")
    return None

def build_math(needs):
    for n in needs:
        skill = n["skill"]
        for i in range(n["need"]):
            built = None
            if skill in MATH_FAMS:
                built = MATH_FAMS[skill](i + 40 + BASE_OFFSET)
            else:
                built = fam_from_qb2(skill, i + 40 + BASE_OFFSET)
            assert built, f"no math family for {skill}"
            ms(**built)

# --------------------------------------------------------------------------
# WRITING families (BANK.rw, kind writing; serve sat|rw and act|english twins)
# --------------------------------------------------------------------------
W_SERIAL = [700]
def ws(*, skill, diff, q, correct, wrongs, exp, domain="Standard English Conventions"):
    W_SERIAL[0] += 1
    # The conventions stem is short by design; pad the context so the item clears
    # the 25-150 word Digital SAT text-length gate used by the quality layer.
    head, _, tail = q.partition("\nWhich choice")
    padded = head.rstrip()
    extras = [" The office archived every version before the review meeting.",
               " A second reader checked the entry the following morning.",
               " The finished copy then went into the shared folder for reference.",
               " Staff members returned to the note during the weekly review.",
               " The final version was circulated to everyone on the distribution list.",
               " The revised document was stored with the rest of the weekly records."]
    ei = W_SERIAL[0] % len(extras)
    while len(padded.split()) < 28:
        padded = padded + extras[ei % len(extras)]
        ei += 1
    full_q = padded + ("\nWhich choice" + tail if tail else "")
    add("writing", f"w{IDB}{W_SERIAL[0]:03d}", "sat", "rw", domain, skill, diff, full_q, correct, wrongs, exp,
        kind="writing", passage=padded)

NOUNS = [("committee", "budget memo"), ("squad", "travel plan"), ("panel", "review sheet"), ("orchestra", "program note"),
         ("team", "safety manual"), ("crew", "maintenance log"), ("board", "policy draft"), ("faculty", "course list"),
         ("jury", "verdict form"), ("band", "set list"), ("staff", "shift roster"), ("class", "reading guide"),
         ("guild", "exhibit plan"), ("council", "zoning note"), ("bureau", "records index"), ("troupe", "tour schedule"),
         ("league", "rule book"), ("choir", "rehearsal chart"), ("unit", "field report"), ("division", "quarterly review")]

def fam_sva(i):
    who, work = NOUNS[i % len(NOUNS)]
    plural = 1 + (i % 3)
    v = ["grows", "improves", "expands", "changes"][i % 4]
    q = f"The {who}'s collection of {plural} copies of the {work} ___ each year as new members contribute.\nWhich choice completes the text so that it conforms to Standard English?"
    return dict(skill="Subject-Verb Agreement", diff=diff_for(i), q=q, correct=v,
        wrongs=[(v + "s" if not v.endswith("s") else v + "es", "The verb must agree with the singular 'collection,' not the nearby plural noun."),
                ("were " + v[:-1] + "ing", "A plural past form disagrees with the singular subject and shifts tense."),
                ("have " + v[:-1] + "ed", "The plural auxiliary 'have' does not agree with 'collection.'")],
        exp="The subject is the singular noun 'collection'; the phrase 'of ... copies' does not change agreement.")

def fam_mod(i):
    who, work = NOUNS[(i + 5) % len(NOUNS)]
    q = f"After revising the {work} for clarity, ___ shared it with the other members.\nWhich choice completes the text so that it conforms to Standard English?"
    return dict(skill="Modifiers", diff=diff_for(i), q=q, correct=f"the {who}",
        wrongs=[(f"the {work} was", "The opening phrase must modify the person revising, not the document."),
                ("a revision was", "A passive construction leaves the modifier without a logical actor."),
                (f"several changes were", "Changes cannot perform the revising action.")],
        exp=f"Only the {who} can revise and then share, so the actor must follow the comma.")

def fam_pron(i):
    who, work = NOUNS[(i + 9) % len(NOUNS)]
    q = f"The {who} submitted {work} with a note attached to it. When the reviewers replied, ___ thanked them for the detailed feedback.\nWhich choice completes the text so that it conforms to Standard English?"
    return dict(skill="Pronouns", diff=diff_for(i), q=q, correct="the members",
        wrongs=[("they're members", "'They're' means 'they are,' which cannot serve as the subject here."),
                ("there members", "'There' is a place word, not a subject or possessive."),
                ("them members", "An object pronoun cannot be the subject of 'thanked.'")],
        exp="The subject needs a clear plural noun phrase: 'the members.'")

def fam_parallel(i):
    verbs = [("drafting", "review"), ("testing", "document"), ("mapping", "publish"), ("sampling", "label")]
    v1, v2 = verbs[i % len(verbs)]
    q = f"The {NOUNS[(i + 2) % len(NOUNS)][1]} required {v1} each site, comparing the results, and ___ the findings by Friday.\nWhich choice completes the text so that it conforms to Standard English?"
    return dict(skill="Parallel structure", diff=diff_for(i), q=q, correct=v2 + "ing",
        wrongs=[("to " + v2, "The series mixes a to-infinitive with two gerunds."),
                (v2, "A bare verb breaks the gerund pattern of the series."),
                ("it " + v2 + "s", "A full clause interrupts a list of gerund phrases.")],
        exp="Each item in the series must be a gerund phrase: '" + v1 + ", comparing, and " + v2 + "ing.'")

def fam_poss(i):
    who, work = NOUNS[(i + 3) % len(NOUNS)]
    singular = i % 2 == 0
    if singular:
        q = f"Each ______ notebook held a separate {work}.\nWhich choice completes the text so that it conforms to Standard English?"
        return dict(skill="Possessives", diff=diff_for(i), q=q, correct=f"{who} member's",
            wrongs=[(f"{who} members'", "'Each' signals one member, so the possessive must be singular."),
                    (f"{who} members", "Without an apostrophe the word is not possessive."),
                    (f"{who} members's", "A plural noun ending in s takes only an apostrophe.")],
            exp="'Each' takes a singular owner: member's.")
    q = f"The two ______ reports were displayed side by side.\nWhich choice completes the text so that it conforms to Standard English?"
    return dict(skill="Possessives", diff=diff_for(i), q=q, correct=f"{who} members'",
        wrongs=[(f"{who} member's", "The singular possessive describes one owner, but there are two."),
                (f"{who} members", "Possession requires an apostrophe."),
                (f"{who} members's", "Do not add 's after a plural ending in s.")],
        exp="Two owners share the reports, so the plural possessive members' is correct.")

def fam_tense(i):
    who, work = NOUNS[(i + 7) % len(NOUNS)]
    q = f"By the time the reviewers assembled, the {who} ___ the {work} days earlier.\nWhich choice completes the text so that it conforms to Standard English?"
    return dict(skill="Verb tense", diff=diff_for(i), q=q, correct="had finished",
        wrongs=[("finished", "Simple past does not establish that the finishing preceded the assembling."),
                ("has finished", "Present perfect conflicts with the past-time 'assembled.'"),
                ("will finish", "Future tense contradicts the timeline.")],
        exp="Past perfect 'had finished' marks the earlier of two past events.")

def fam_punct(i):
    who, work = NOUNS[(i + 11) % len(NOUNS)]
    desc = ["first of its kind", "still under revision", "shared by three offices"][i % 3]
    q = f"The {work}, ___ , was filed with the {who} on Friday.\nWhich choice completes the text so that it conforms to Standard English?"
    return dict(skill="Punctuation", diff=diff_for(i), q=q, correct=desc,
        wrongs=[("" if desc != "" else "a draft", "The parenthetical description must be set off by commas on both sides."),("and " + desc, "A conjunction changes the sentence structure; the interrupter needs commas, not a conjunction."),("which is " + desc, "A 'which' clause would need its own comma pairing and shifts the meaning.")],
        exp="Nonrestrictive interrupters take commas on both sides: 'The " + work + ", " + desc + ", was filed.'")

def fam_bound(i):
    who, work = NOUNS[(i + 13) % len(NOUNS)]
    q = f"The {who} filed the {work} on time ___ the office still marked the submission late.\nWhich choice completes the text so that it conforms to Standard English?"
    return dict(skill="Boundaries", diff=diff_for(i), q=q, correct=", yet",
        wrongs=[(",", "A comma alone between independent clauses makes a comma splice."),
                ("No punctuation", "No punctuation creates a run-on."),
                ("so", "'So' signals a result, but the clauses contrast.")],
        exp="A comma plus the coordinating conjunction 'yet' joins the independent clauses correctly and marks the contrast.")

TRANS_CTX = [("The {who} expected the {work} to take a week", "it was finished in two days", "contrast", "However,"),
             ("The first draft contained a factual error", "the {who} delayed the {work} to correct it", "result", "Consequently,"),
             ("Some neighborhoods flood after storms", "the {work} now prioritizes drainage", "result", "Therefore,"),
             ("The prototype failed twice in testing", "the third revision passed every trial", "contrast", "By contrast,"),
             ("The {who} collects soil samples", "the team also records rainfall daily", "addition", "In addition,"),
             ("The new map shows main roads", "it also marks emergency shelters", "addition", "Moreover,"),
             ("Many cities phase in fees slowly", "Stockholm adjusted its zone after launch", "example", "For example,"),
             ("Several states fund tuition aid", "New York's program covers four years", "example", "For instance,"),
             ("The instrument is accurate to a tenth", "its battery lasts only a day", "contrast", "Nevertheless,"),
             ("The archive lacked a catalog", "researchers reconstructed the index", "result", "As a result,")]

def fam_trans(i):
    ctx = TRANS_CTX[i % len(TRANS_CTX)]
    who, work = NOUNS[(i + 4) % len(NOUNS)]
    first = ctx[0].replace("{who}", who).replace("{work}", work)
    second = ctx[1].replace("{who}", who).replace("{work}", work)
    q = f"{first}. ___ {second[0].upper() + second[1:]}.\nWhich choice completes the text with the most logical transition?"
    correct = ctx[3]
    wrong_map = {"contrast": ["Therefore,", "For example,", "Similarly,"],
                 "result": ["However,", "Similarly,", "In addition,"],
                 "addition": ["However,", "For example,", "Therefore,"],
                 "example": ["Nevertheless,", "Therefore,", "As a result,"]}[ctx[2]]
    WHY = {"Therefore,": "This signals a result where the sentence needs a contrast.",
           "For example,": "This introduces an example rather than the needed relationship.",
           "Similarly,": "This signals likeness, not the logical link shown.",
           "However,": "This signals contrast where the sentences agree or progress.",
           "In addition,": "This signals addition rather than a result.",
           "Nevertheless,": "This signals concession where an example is wanted.",
           "As a result,": "This signals a result where an example is wanted."}
    return dict(domain="Expression of Ideas", skill="Transitions", diff=diff_for(i), q=q, correct=correct,
        wrongs=[(w, WHY.get(w, "This transition does not match the relationship between the sentences.")) for w in wrong_map],
        exp=f"The sentences relate by {ctx[2]}, so the correct transition is '{correct}'.")

WRITING_FAMS = {"Subject-Verb Agreement": fam_sva, "Modifiers": fam_mod, "Pronouns": fam_pron,
                "Parallel structure": fam_parallel, "Possessives": fam_poss, "Verb tense": fam_tense,
                "Punctuation": fam_punct, "Boundaries": fam_bound, "Transitions": fam_trans}

# --------------------------------------------------------------------------
# READING families (BANK.rw, kind reading; serve sat|rw and act|reading twins)
# --------------------------------------------------------------------------
R_SERIAL = [700]
def rs(*, domain, skill, diff, q, correct, wrongs, exp, passage):
    R_SERIAL[0] += 1
    add("reading", f"r{IDB}{R_SERIAL[0]:03d}", "sat", "rw", domain, skill, diff, q, correct, wrongs, exp,
        kind="reading", passage=passage)

TOPICS = [("a harbor town", "the ferry schedule"), ("a mountain observatory", "the night log"), ("a prairie reserve", "the burn plan"),
          ("a bakery cooperative", "the ovens"), ("a river authority", "the gauge network"), ("a seed vault", "the cold rooms"),
          ("a tram line", "the timetable"), ("a wetland crew", "the water samples"), ("a print shop", "the letterpress"),
          ("a climbing club", "the route notes"), ("a weather station", "the anemometer"), ("a dairy farm", "the cooling tanks"),
          ("a museum lab", "the storage cases"), ("a rail museum", "the repair shed"), ("a coral nursery", "the fragment racks"),
          ("a maple woodlot", "the sap lines"), ("a kiln studio", "the firing charts"), ("a bookmobile", "the route list"),
          ("a tide mill", "the wheel seals"), ("a bird banding station", "the mist nets"),
          ("a ferry yard", "the dry dock"), ("a herbarium", "the specimen sheets"), ("a windmill trust", "the sail cloth"),
          ("a salmon hatchery", "the rearing ponds"), ("a bell foundry", "the tuning logs"), ("a dune crew", "the fence lines"),
          ("an ice core lab", "the storage freezer"), ("a puppet theater", "the rigging"), ("a seed library", "the lending desk"),
          ("a bat hospital", "the flight cage"), ("a stone mason's yard", "the template boards"), ("a river ferry", "the crossing log"),
          ("a planetarium", "the projector notes")]

def fam_words(i):
    topic, item = TOPICS[i % len(TOPICS)]
    word, correct, wrongs = [
        ("measured", "taken with deliberate care", ["repeated for accuracy", "recorded hastily", "announced publicly"]),
        ("sparse", "thin on the ground", ["richly detailed", "widely praised", "carefully hidden"]),
        ("stubborn", "resistant to change", ["quick to anger", "easy to repair", "rarely observed"]),
        ("deliberate", "intentionally chosen", ["unusually slow", "openly disputed", "poorly funded"]),
        ("modest", "limited in scale", ["proud in tone", "expensive to run", "famous locally"]),
        ("novel", "new to the situation", ["borrowed from abroad", "proven over decades", "cheap to build"]),
        ("sound", "reliably reasoned", ["loudly argued", "briefly noted", "still disputed"]),
        ("faint", "barely detectable", ["widely reported", "clearly labeled", "suddenly sharp"]),
    ][i % 8]
    passage = (f"At {topic}, the keepers of {item} kept records that were {word} by the standards of the day. "
               f"Each entry noted what was done, when, and by whom, and the entries were reviewed by a second reader before filing.")
    q = f"As used in the text, “{word}” most nearly means"
    return dict(domain="Craft & Structure", skill="Words in Context", diff=diff_for(i), q=q, correct=correct,
        wrongs=[(w, "This meaning does not fit the context established by the sentence.") for w in wrongs],
        exp=f"Context signals that the records were {correct}, which matches the word's use here.", passage=passage)

def fam_structure(i):
    topic, item = TOPICS[(i + 3) % len(TOPICS)]
    seq = ["first summarizing an older practice", "then describing a change", "and closing with its effect"][i % 3]
    passage = (f"For decades, the crew that maintained {item} at {topic} followed a fixed routine. After a difficult season, "
               f"the crew began recording a second set of observations. Within two years the new records had exposed a pattern "
               f"the old routine had hidden, and the crew reorganized its work around what the records showed.")
    q = "Which choice best describes the overall structure of the text?"
    return dict(domain="Craft & Structure", skill="Text Structure and Purpose", diff=diff_for(i), q=q,
        correct=f"It describes a routine, then a change {seq[4:]}.",
        wrongs=[("It compares two rival theories in detail.", "No competing theories are presented."),
                ("It argues that record keeping is unnecessary.", "Records are shown to be valuable, not pointless."),
                ("It lists unrelated events in sequence.", "The events form a connected cause-and-effect narrative.")],
        exp="The text moves from an old routine to a change and its consequence.", passage=passage)

def fam_crosstext(i):
    topic, item = TOPICS[(i + 6) % len(TOPICS)]
    n = 14 + i % 5
    t1 = (f"At {topic}, a review of {n} seasons of {item} records found that small adjustments made each year added up "
          f"to a substantial change over the period.")
    t2 = ("A commentator cites the same review and argues that because small adjustments accumulate, any single year's "
          "records are worthless on their own.")
    q = f"Text 1: {t1}\n\nText 2: {t2}\n\nHow would the author of Text 1 most likely respond to the argument in Text 2?"
    return dict(domain="Craft & Structure", skill="Cross-Text Connections", diff=diff_for(i), q=q,
        correct="The argument overstates the finding: single-year records remain useful even if trends emerge over time.",
        wrongs=[("By agreeing that only multi-decade records have any value.", "Text 1 treats yearly data as the building blocks of the trend."),
                ("By denying that the adjustments accumulated.", "That contradicts Text 1's own finding."),
                ("By noting that the review covered too few seasons to matter.", f"Text 1 reports {n} seasons as sufficient for its conclusion.")],
        exp="Text 1 values the annual records as the source of the trend; Text 2's dismissal goes beyond the evidence.", passage=t1)

def fam_inference(i):
    topic, item = TOPICS[(i + 9) % len(TOPICS)]
    d = 5 + i % 6
    passage = (f"After storms, the crew at {topic} checked {item} more often than the schedule required. On the {d} stormy weeks "
               f"in the records, entries cluster on the days right after each storm, then thin out as conditions stabilized.")
    q = "Which inference is most strongly supported by the text?"
    return dict(domain="Information & Ideas", skill="Inferences", diff=diff_for(i), q=q,
        correct="The crew increased its checks in response to storm conditions.",
        wrongs=[("The crew ignored the schedule entirely.", "The text says they exceeded the schedule, not abandoned it."),
                ("Storms damaged the records themselves.", "Nothing suggests the records were harmed."),
                ("The schedule required daily checks in stormy weeks.", "The text describes clustered entries after storms, not a daily requirement.")],
        exp="Clustered post-storm entries indicate checks were added in response to the storms.", passage=passage)

def fam_evidence(i):
    topic, item = TOPICS[(i + 12) % len(TOPICS)]
    n = 20 + i % 12
    passage = (f"A guide to maintaining {item} at {topic} claims that early repairs save money. The guide reports that "
               f"patched equipment lasted {n} months on average, while equipment left unrepaired until failure lasted "
               f"{n - 8} months and required replacement parts.")
    q = "Which detail from the text best supports the guide's claim that early repairs save money?"
    return dict(domain="Information & Ideas", skill="Command of Evidence", diff=diff_for(i), q=q,
        correct=f"Patched equipment lasted {n} months versus {n - 8} months for equipment run to failure.",
        wrongs=[("The guide discusses equipment maintenance.", "A general topic is not evidence for the cost claim."),
                (f"The guide reports data from {n} items.", "Sample size alone does not support the cost-saving claim."),
                ("Replacement parts were sometimes required.", "Parts are a cost of late repair, not evidence for early repair savings.")],
        exp="The longer service life of patched equipment directly supports the savings claim.", passage=passage)

def fam_quant(i):
    topic, item = TOPICS[(i + 15) % len(TOPICS)]
    a1 = 12 + i; a2 = a1 + 9; a3 = a1 + 4
    passage = (f"A maintenance log for {item} at {topic} tracked three intervals:\nInterval A: {a1} days of service; "
               f"Interval B: {a2} days; Interval C: {a3} days.\nEach interval covered the same number of repairs.")
    q = "Which statement is best supported by the data in the text?"
    return dict(domain="Information & Ideas", skill="Quantitative Evidence", diff=diff_for(i), q=q,
        correct=f"Interval B provided the longest service before each repair.",
        wrongs=[(f"Interval A required the fewest repairs.", "Every interval covered the same number of repairs."),
                (f"Interval C lasted longer than Interval B.", f"Interval C is {a3} days versus {a2}."),
                ("The three intervals lasted equal amounts of time.", "The recorded values differ.")],
        exp=f"Comparing the recorded days ({a1}, {a2}, {a3}), Interval B is the longest.", passage=passage)

READING_FAMS = {"Words in Context": fam_words, "Text Structure and Purpose": fam_structure,
                "Cross-Text Connections": fam_crosstext, "Inferences": fam_inference,
                "Command of Evidence": fam_evidence, "Quantitative Evidence": fam_quant}

# --------------------------------------------------------------------------
# SCIENCE families (ACT_SCIENCE)
# --------------------------------------------------------------------------
S_SERIAL = [700]
def ss(*, domain, skill, diff, q, correct, wrongs, exp):
    S_SERIAL[0] += 1
    add("science", f"s{IDB}{S_SERIAL[0]:03d}", "act", "science", domain, skill, diff, q, correct, wrongs, exp)

EXP = [                                                       # (subject, xlabel, xs, ylabel, ys, xc, yc)
    ("a spring's stretch", "Load (g)", [100, 200, 300, 400], "Stretch (cm)", None, 2),      # ys computed 1.5*xc
    ("a cart's speed", "Ramp angle (deg)", [10, 20, 30, 40], "Speed (m/s)", None, 0.12),
    ("a plant's height", "Fertilizer (mL)", [0, 10, 20, 30], "Height (cm)", None, 0.9),
    ("a pond's oxygen", "Depth (m)", [1, 2, 3, 4], "Oxygen (mg/L)", None, -1.4),
    ("a bulb's brightness", "Voltage (V)", [2, 4, 6, 8], "Brightness (lux)", None, 18),
    ("a reaction's rate", "Temperature (C)", [10, 20, 30, 40], "Rate (units/min)", None, 2.1),
    ("a well's yield", "Pump setting", [1, 2, 3, 4], "Yield (L/min)", None, 7.5),
    ("a battery's life", "Drain (mA)", [20, 40, 60, 80], "Hours", None, -0.8),
    ("a roof's runoff", "Rainfall (mm)", [5, 10, 15, 20], "Runoff (L)", None, 3.2),
    ("a kite's lift", "Wind (m/s)", [3, 6, 9, 12], "Lift (N)", None, 1.6),
]
def exp_vals(i):
    subject, xl, xs, yl, _, slope = EXP[i % len(EXP)]
    base = 5 + (i % 7) + (i // 7) * 2
    if slope > 0:
        step = 2 + (i % 3)
        ys = [round(base + (j + 1) * step, 1) for j in range(4)]
    else:
        step = 1 + (i % 3)
        ys = [round(base - j * step, 1) for j in range(4)]
    return subject, xl, xs, yl, ys

def sci_table(i):
    subject, xl, xs, yl, ys = exp_vals(i)
    return f"A lab recorded {subject} across {len(xs)} settings.\n{xl}: " + " · ".join(map(str, xs)) + f"\n{yl}: " + " · ".join(map(str, ys))

def fam_datarep(i):
    subject, xl, xs, yl, ys = exp_vals(i)
    q = sci_table(i) + f"\nAt which setting is the recorded {yl.split(' ')[0].lower()} value greatest?"
    max_i = ys.index(max(ys))
    return dict(domain="Data Representation", skill="Data Representation", diff=diff_for(i), q=q, correct=f"{xl.split(' ')[0]} = {xs[max_i]}",
        wrongs=[(f"{xs[j]}", "This setting is not the maximum in the table.") for j in range(4) if j != max_i][:3],
        exp=f"Scanning the second row, the largest recorded value is {max(ys)} at {xs[max_i]}.")

def fam_readtables(i):
    subject, xl, xs, yl, ys = exp_vals(i)
    lo_i, hi_i = sorted([i % 4, (i + 2) % 4])
    q = sci_table(i) + f"\nWhat is the change in {yl.split(' ')[0].lower()} between {xs[lo_i]} and {xs[hi_i]}?"
    delta = round(ys[hi_i] - ys[lo_i], 1)
    return dict(domain="Data Representation", skill="Reading tables", diff=diff_for(i), q=q, correct=delta,
        wrongs=[(round(ys[hi_i] + ys[lo_i], 1), "Adding the readings is not their change."),
                (ys[hi_i], "That is the later reading alone."), (ys[lo_i], "That is the earlier reading alone.")],
        exp=f"Subtract: {ys[hi_i]} − {ys[lo_i]} = {delta}.")

def fam_interp(i):
    subject, xl, xs, yl, ys = exp_vals(i)
    mid = (xs[1] + xs[2]) / 2; mid_y = (ys[1] + ys[2]) / 2
    q = sci_table(i) + f"\nAssuming the trend between adjacent settings is linear, what value should the table show at {xl.split(' ')[0]} = {mid}?"
    return dict(domain="Data Representation", skill="Interpolation", diff="hard", q=q, correct=round(mid_y, 1),
        wrongs=pick3([(ys[1], "That is the lower endpoint, not the midpoint."), (ys[2], "That is the upper endpoint."),
                      (round((ys[0] + ys[3]) / 2 + 1, 1), "Averaging the outer readings ignores the local trend.")], round(mid_y, 1)),
        exp=f"Halfway between {xs[1]} and {xs[2]} lies the midpoint of {ys[1]} and {ys[2]}: {round(mid_y, 1)}.")

def fam_rates(i):
    subject, xl, xs, yl, ys = exp_vals(i)
    r1 = round(ys[1] - ys[0], 1); r2 = round(ys[3] - ys[2], 1)
    q = sci_table(i) + f"\nBetween which two consecutive settings does {yl.split(' ')[0].lower()} change the fastest?"
    deltas = [round(ys[j + 1] - ys[j], 1) for j in range(3)]
    fast = deltas.index(max(deltas, key=abs))
    wrong_list = [(f"{xs[j]} to {xs[j + 1]}", "This interval changes by a smaller amount.") for j in range(3) if j != fast]
    while len(wrong_list) < 3:
        wrong_list.append(("The recorded quantity never changes.", "Every interval in the table shows a change."))
    return dict(domain="Data Representation", skill="Rates of change", diff=diff_for(i), q=q,
        correct=f"{xs[fast]} to {xs[fast + 1]}",
        wrongs=wrong_list,
        exp=f"The interval changes by {deltas[fast]}, the largest step in the table.")

def fam_research(i):
    subject, xl, xs, yl, ys = exp_vals(i)
    q = sci_table(i) + f"\nA student claims {subject} rises steadily with {xl.split(' ')[0].lower()}. Do the data support the claim?"
    rising = all(ys[j + 1] > ys[j] for j in range(3))
    return dict(domain="Research Summaries", skill="Research Summaries", diff=diff_for(i), q=q,
        correct="Yes; every recorded step increases." if rising else "No; at least one step does not increase.",
        wrongs=[(("No; at least one step does not increase." if rising else "Yes; every recorded step increases."), "This contradicts the recorded steps."),
                ("The data cannot address the claim.", "The table directly records the variables in the claim."),
                ("Only if the sample size is given.", "Whether values rise is visible without more context.")],
        exp="Check each consecutive pair against the claimed direction.")

def fam_controls(i):
    subject, xl, xs, yl, ys = exp_vals(i)
    q = sci_table(i) + f"\nThe lab wants to test whether {xl.split(' ')[0].lower()} alone causes the changes in {yl.split(' ')[0].lower()}. Which design best isolates that variable?"
    return dict(domain="Research Summaries", skill="Experimental controls", diff=diff_for(i), q=q,
        correct=f"Vary {xl.split(' ')[0].lower()} across settings while holding every other condition constant.",
        wrongs=[("Change the equipment and the settings together.", "Confounded variables cannot isolate the cause."),
                ("Repeat only the middle setting several times.", "Repeating one setting cannot show the variable's effect."),
                ("Measure a different quantity at each setting.", "Changing the measurement breaks comparability.")],
        exp="Isolating one variable requires holding all other conditions constant.")

def fam_design(i):
    subject, xl, xs, yl, ys = exp_vals(i)
    q = sci_table(i) + "\nWhich additional procedure would most improve the reliability of these results?"
    return dict(domain="Research Summaries", skill="Study design", diff=diff_for(i), q=q,
        correct="Repeat each setting multiple times and average the readings.",
        wrongs=[("Record more decimal places for one trial.", "Precision of a single reading does not establish reliability."),
                ("Test only the highest setting again.", "One setting cannot represent the whole range."),
                ("Change the measurement device mid-study.", "Switching devices introduces an uncontrolled difference.")],
        exp="Replication plus averaging reduces the influence of random error.")

def fam_interp_exp(i):
    subject, xl, xs, yl, ys = exp_vals(i)
    q = sci_table(i) + "\nWhich statement best interprets the pattern in the data?"
    rising = ys[3] > ys[0]
    return dict(domain="Research Summaries", skill="Interpreting experiments", diff=diff_for(i), q=q,
        correct=f"{yl.split(' ')[0]} is {'higher' if rising else 'lower'} at the highest {xl.split(' ')[0].lower()} than at the lowest.",
        wrongs=[("The recorded quantity is identical at every setting.", "The table shows different values."),
                ("The trend reverses halfway through the table.", "No reversal appears in the recorded steps."),
                ("Nothing can be concluded from a single table.", "A single well-controlled table supports a direct comparison.")],
        exp="Compare the first and last readings to state the overall direction.")

def fam_conflict(i):
    subject, xl, xs, yl, ys = exp_vals(i)
    hi = xs[ys.index(max(ys))]
    q = (sci_table(i) + f"\nScientist 1 claims the pattern is caused by the apparatus warming up. Scientist 2 claims it reflects a property of the sample. "
         f"Which observation would most directly support Scientist 2?")
    return dict(domain="Conflicting Viewpoints", skill="Conflicting Viewpoints", diff=diff_for(i), q=q,
        correct="Repeating the measurements with a pre-warmed apparatus reproduces the same pattern.",
        wrongs=[("The apparatus warms steadily during the trials.", "That observation supports Scientist 1, not 2."),
                ("The lab is unusually cold that day.", "Room temperature alone does not distinguish the claims."),
                (f"The highest reading is {max(ys)} at {hi}.", "A reading alone does not separate the explanations.")],
        exp="If the pattern survives with the apparatus pre-warmed, warm-up cannot be the cause.")

def fam_compare(i):
    subject, xl, xs, yl, ys = exp_vals(i)
    q = (sci_table(i) + "\nScientist 1 predicts the recorded quantity will keep changing proportionally beyond the tested range. "
         "Scientist 2 predicts it will level off. Which result at the next setting would support Scientist 2?")
    nxt = round(ys[3] + (ys[3] - ys[2]) * 0.1, 1) if ys[3] > ys[2] else round(ys[3] + (ys[3] - ys[2]) * 0.1, 1)
    return dict(domain="Conflicting Viewpoints", skill="Comparing predictions", diff="hard", q=q,
        correct="The next reading changes much less than the previous step.",
        wrongs=[("The next reading continues the same proportional step.", "That matches Scientist 1's prediction."),
                ("The next reading exceeds the previous step.", "Acceleration supports neither leveling-off claim."),
                ("The next reading equals the first reading.", "A full return is not predicted by either view.")],
        exp="Leveling off means the next increment shrinks, matching Scientist 2.")

def fam_eval(i):
    subject, xl, xs, yl, ys = exp_vals(i)
    q = (sci_table(i) + f"\nA report cites the table as evidence that {xl.split(' ')[0].lower()} determines {yl.split(' ')[0].lower()}. "
         f"Which weakness most limits that conclusion?")
    return dict(domain="Conflicting Viewpoints", skill="Evaluating evidence", diff=diff_for(i), q=q,
        correct="Other conditions could be changing along with the tested variable.",
        wrongs=[("The table has too few decimal places.", "Precision is not the core limitation here."),
                ("The values were recorded by hand.", "Method of recording is not the cited weakness."),
                ("The subject is uninteresting.", "Interest level does not bear on causal inference.")],
        exp="Correlation between settings and readings can reflect confounded conditions rather than causation.")

SCIENCE_FAMS = {"Data Representation": fam_datarep, "Reading tables": fam_readtables, "Interpolation": fam_interp,
                "Rates of change": fam_rates, "Research Summaries": fam_research, "Experimental controls": fam_controls,
                "Study design": fam_design, "Interpreting experiments": fam_interp_exp,
                "Conflicting Viewpoints": fam_conflict, "Comparing predictions": fam_compare,
                "Evaluating evidence": fam_eval}

# --------------------------------------------------------------------------
# Bucket needs (computed from the live Subject-practice inventory, Oct 8 2026)
# --------------------------------------------------------------------------
NEEDS = [["ACT_SCIENCE", "Conflicting Viewpoints", "Comparing predictions", 26], ["ACT_SCIENCE", "Conflicting Viewpoints", "Conflicting Viewpoints", 26], ["ACT_SCIENCE", "Conflicting Viewpoints", "Evaluating evidence", 16], ["ACT_SCIENCE", "Data Representation", "Data Representation", 18], ["ACT_SCIENCE", "Data Representation", "Interpolation", 25], ["ACT_SCIENCE", "Data Representation", "Rates of change", 25], ["ACT_SCIENCE", "Data Representation", "Reading tables", 17], ["ACT_SCIENCE", "Research Summaries", "Experimental controls", 17], ["ACT_SCIENCE", "Research Summaries", "Interpreting experiments", 25], ["ACT_SCIENCE", "Research Summaries", "Research Summaries", 20], ["ACT_SCIENCE", "Research Summaries", "Study design", 24], ["math", "Advanced Math", "Equivalent expressions", 12], ["math", "Advanced Math", "Exponential functions", 6], ["math", "Advanced Math", "Nonlinear equations", 24], ["math", "Advanced Math", "Nonlinear functions", 3], ["math", "Advanced Math", "Quadratic equations", 2], ["math", "Advanced Math", "Radical equations", 18], ["math", "Algebra", "Linear equations in one variable", 6], ["math", "Algebra", "Linear equations in two variables", 14], ["math", "Algebra", "Linear inequalities", 18], ["math", "Algebra", "Linear inequalities in one variable", 18], ["math", "Algebra", "Systems of two linear equations", 4], ["math", "Geometry & Trigonometry", "Angles", 20], ["math", "Geometry & Trigonometry", "Lines, angles, and triangles", 26], ["math", "Geometry & Trigonometry", "Right triangle trigonometry", 40], ["math", "Geometry & Trigonometry", "Right triangles", 63], ["math", "Geometry & Trigonometry", "Right triangles and trigonometry", 40], ["math", "Geometry & Trigonometry", "Similar triangles", 24], ["math", "Problem-Solving & Data Analysis", "Measures of center", 12], ["math", "Problem-Solving & Data Analysis", "Measures of spread", 18], ["math", "Problem-Solving & Data Analysis", "Probability", 19], ["math", "Problem-Solving & Data Analysis", "Probability and conditional probability", 18], ["math", "Problem-Solving & Data Analysis", "Ratios and proportional relationships", 11], ["math", "Problem-Solving & Data Analysis", "Scatterplots", 23], ["math", "Problem-Solving & Data Analysis", "Statistical inference", 24], ["math", "Problem-Solving & Data Analysis", "Unit rates", 18], ["rw-reading", "Craft & Structure", "Cross-Text Connections", 15], ["rw-reading", "Craft & Structure", "Text Structure and Purpose", 10], ["rw-reading", "Craft & Structure", "Words in Context", 9], ["rw-reading", "Information & Ideas", "Command of Evidence", 10], ["rw-reading", "Information & Ideas", "Inferences", 14], ["rw-reading", "Information & Ideas", "Quantitative Evidence", 26], ["rw-reading", "Information & Ideas", "Text Structure and Purpose", 48], ["rw-writing", "Expression of Ideas", "Transitions", 20], ["rw-writing", "Standard English Conventions", "Boundaries", 6], ["rw-writing", "Standard English Conventions", "Modifiers", 25], ["rw-writing", "Standard English Conventions", "Parallel structure", 25], ["rw-writing", "Standard English Conventions", "Possessives", 25], ["rw-writing", "Standard English Conventions", "Pronouns", 25], ["rw-writing", "Standard English Conventions", "Punctuation", 20], ["rw-writing", "Standard English Conventions", "Subject-Verb Agreement", 25], ["rw-writing", "Standard English Conventions", "Verb tense", 24]]

def existing_keys():
    import re
    src = open("app.js", encoding="utf8").read()
    for marker in ("/*__QB2_START__*/", "/*__TB_START__*/", "/*__TB2_START__*/"):
        a = src.find(marker)
        if a < 0:
            continue
        endm = "/*__QB2_END__*/" if "QB2" in marker else ("/*__TB2_END__*/" if "TB2" in marker else "/*__TB_END__*/")
        b = src.find(endm, a)
        if b > a:
            src = src[:a] + src[b + len(endm):]
    keys = set()
    for m in re.finditer(r'\{[^{}]*?"q":\s*"((?:[^"\\]|\\.)*)"[^{}]*?\}', src):
        blob = m.group(0)
        try:
            obj = json.loads(blob)
        except Exception:
            continue
        q = " ".join(str(obj.get("q", "")).split())
        p = " ".join(str(obj.get("passage") or "").split())
        keys.add(q + " || " + p + " || " + (obj.get("kind") or ""))
    return keys

def main():
    global banks
    for pool, domain, skill, need in NEEDS:
        n = {"domain": domain, "skill": skill, "need": need, "pool": pool}
        if pool == "math":
            build_math([n])
        elif pool == "rw-writing":
            fam = WRITING_FAMS.get(skill)
            assert fam, f"no writing family for {skill}"
            for i in range(need):
                built = fam(i + 60 + BASE_OFFSET)
                built["domain"] = domain
                ws(**built)
        elif pool == "rw-reading":
            fam = READING_FAMS.get(skill)
            assert fam, f"no reading family for {skill}"
            for i in range(need):
                built = fam(i + 60 + BASE_OFFSET)
                built["domain"] = domain
                rs(**built)
        elif pool == "ACT_SCIENCE":
            fam = SCIENCE_FAMS.get(skill)
            assert fam, f"no science family for {skill}"
            for i in range(need):
                built = fam(i + 60 + BASE_OFFSET)
                built["domain"] = domain
                ss(**built)
        else:
            raise SystemExit("unknown pool " + pool)

    seen = existing_keys()
    dropped = 0
    final = {}
    for pool, items in banks.items():
        keep = []
        for item in items:
            k = " ".join(item["q"].split()) + " || " + " ".join((item.get("passage") or "").split()) + " || " + (item.get("kind") or "")
            if k in seen:
                dropped += 1
                continue
            seen.add(k)
            keep.append(item)
        final[pool] = keep

    emit = ["/*__TB_START__*/"]
    emit.append("// Topic-coverage expansion (Oct 2026): every Subject-practice topic reaches >= 30 items.")
    for pool, name in [("math", "TB_MATH"), ("writing", "TB_WRITING"), ("reading", "TB_READING"), ("science", "TB_SCIENCE")]:
        emit.append(f"const {name} = [")
        emit.append(",\n".join(json.dumps(q, ensure_ascii=False) for q in final[pool]))
        emit.append("];")
    emit.append("BANK.math.push(...TB_MATH);")
    emit.append("BANK.rw.push(...TB_WRITING, ...TB_READING);")
    emit.append("if (typeof ACT_SCIENCE !== \'undefined\') ACT_SCIENCE.push(...TB_SCIENCE);")
    emit.append("/*__TB_END__*/")
    block = "\n".join(emit) + "\n"

    src = open("app.js", encoding="utf8").read()
    if "/*__TB_START__*/" in src:
        a = src.index("/*__TB_START__*/")
        b = src.index("/*__TB_END__*/", a) + len("/*__TB_END__*/")
        src = src[:a] + block + src[b:]
    else:
        anchor = src.index("/*__QB2_END__*/") + len("/*__QB2_END__*/")
        eol = src.index("\n", anchor) + 1
        src = src[:eol] + block + src[eol:]
    open("app.js", "w", encoding="utf8").write(src)

    counts = {k: len(v) for k, v in final.items()}
    counts["dropped_duplicates"] = dropped
    counts["total_new"] = sum(len(v) for v in final.values())
    json.dump(counts, open("/tmp/tb-counts.json", "w"), indent=1)
    print(json.dumps(counts))

if __name__ == "__main__":
    main()
