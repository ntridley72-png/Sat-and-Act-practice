"""Round-2 modeled practice bank (Oct 2026) — SAT/ACT separation enforced.

Follows scripts/expand-question-bank.py conventions: author-created models of
published test skill structures. Appends one marked block into app.js BEFORE the
derived-bank wiring, then scripts/patch-banks-for-act.py rewires ACT pools.

SAT  : math (4-choice + grid-ins), reading & writing (kind reading/writing, 25-150 word texts)
ACT  : english (kind 'acteng', numbered portions), math (5-choice), reading (kind 'actread'), science
"""
import json
from fractions import Fraction

banks = {
    "sat_math": [], "sat_rw": [], "act_math": [], "act_english": [], "act_reading": [], "act_science": [],
}
_counters = {}

def _rotate(choices):
    """Move the first (correct) entry to a rotating slot; keep wrong pairs intact."""
    key = id(choices)  # no-op guard
    n = _counters.get("rot", 0)
    _counters["rot"] = n + 1
    k = n % len(choices)
    return choices[k:] + choices[:k]

def add(bank, domain, skill, diff, q, correct, wrongs, exp, dw=None, **extra):
    """wrongs: list of (text, why). dw is derived from the rotation so each wrong
    choice carries the explanation of the mistake that produces it."""
    assert len({str(correct)} | {str(w[0]) for w in wrongs}) == len(wrongs) + 1, (q, correct, wrongs)
    pairs = [(str(correct), None)] + [(str(w[0]), w[1]) for w in wrongs]
    pairs = _rotate(pairs)
    ans = [i for i, p in enumerate(pairs) if p[1] is None][0]
    item = dict(id=extra.pop("qid"), bank=extra.pop("banktag"), test=extra.pop("test"),
                section=extra.pop("section"), domain=domain, skill=skill, diff=diff, q=q,
                choices=[p[0] for p in pairs], ans=ans, exp=exp,
                source="Original practice modeled on published test skills")
    wrong_reasons = [p[1] for i, p in enumerate(pairs) if i != ans]
    if wrong_reasons and all(wrong_reasons):
        item["dw"] = wrong_reasons
    item.update(extra)
    banks[bank].append(item)
    return item

DIFFS = ["easy", "medium", "hard"]
def diff_for(i):
    m = i % 4
    return "easy" if m == 0 else ("hard" if m == 3 else "medium")

def qid(prefix, n):
    key = "id_" + prefix
    _counters[key] = max(_counters.get(key, 0), n)
    return f"{prefix}{n}"

# --------------------------------------------------------------------------
# SAT MATH — four-choice multiple choice + student-produced responses (grid-in)
# --------------------------------------------------------------------------
def sat_mc(prefix, base, domain, skill, diff, prompt, correct, wrongs, exp):
    add("sat_math", domain, skill, diff, prompt, correct, wrongs, exp,
        qid=qid(prefix, base), banktag="math", test="sat", section="math")

def sat_grid(prefix, base, domain, skill, diff, prompt, answer, exp):
    add("sat_math", domain, skill, diff, prompt, answer, [], exp,
        qid=qid(prefix, base), banktag="math", test="sat", section="math",
        kind="gridin", answer=str(answer))

SAT_FAMS = [
    # (builder(t, level) -> (prompt, correct, [(wrong, why) x3], exp))
    lambda t, d: (
        f"What value of x satisfies {t+3}x + {t+9} = {t+13}?", 
        None, None, None),  # placeholder replaced below
]

def f_linear_one(t, d):
    a, b = t + 3, t + 9
    x = t + 4
    c = a * x + b
    return (
        f"What value of x satisfies {a}x + {b} = {c}?",
        x,
        [(x + 1, f"Subtracting {b} then dividing by {a} gives x = {x}; {x+1} comes from adding {b} instead of subtracting it."),
         (x - 1, f"x = {x-1} results from an arithmetic slip of one in the division step; check that {a}×{x} + {b} = {c}."),
         (c - b, f"{c-b} is the value of {a}x, not x — the division by {a} was skipped.")],
        f"Subtract {b} from both sides: {a}x = {c-b}. Divide by {a}: x = {x}. Substitute to verify {a}({x}) + {b} = {c}.")

def f_linear_two(t, d):
    a, b = t + 2, t + 5
    x = t + 3
    y = a * x - b
    return (
        f"A line is defined by y = {a}x − {b}. What is the value of y when x = {x}?",
        y,
        [(a * x, f"{a*x} forgets to subtract the constant {b}."),
         (a * x + b, f"Adding {b} instead of subtracting gives {a*x+b}; the equation subtracts {b}."),
         (x - b, f"{x-b} substitutes the wrong quantity; multiply by the coefficient {a} first.")],
        f"Substitute x = {x}: y = {a}({x}) − {b} = {a*x} − {b} = {y}. The question asks for y, not the slope {a}.")

def f_rental(t, d):
    a, b = t + 4, t + 11
    x = t + 5
    total = b + a * x
    return (
        f"A rental company charges a fixed ${b} plus ${a} per hour. A customer pays ${total}. For how many hours did the customer rent the equipment?",
        x,
        [(x + 1, f"{x+1} results from subtracting one too few times in the fixed-fee step ({total} − {b} = {a*x})."),
         (total - b, f"{total-b} is the variable cost in dollars, not the number of hours."),
         (a, f"{a} is the hourly rate itself, not the number of hours purchased.")],
        f"Remove the fixed fee: {total} − {b} = {a*x}. Divide by the hourly rate: {a*x} ÷ {a} = {x} hours.")

def f_system(t, d):
    s = 2 * t + 7
    x = t + 6
    y = s - x
    return (
        f"The system x + y = {s} and x − y = {s - 2*y if False else 5} has solution (x, y). What is the value of x?",
        None, None, None)

def f_system2(t, d):
    y = t + 1
    x = t + 6
    return (
        f"The equations x + y = {x+y} and x − y = {x-y} form a system. What is the value of x?",
        x,
        [(y, f"{y} is the value of y; the question asks for x."),
         (x - 1, f"Adding the equations gives 2x = {2*x}; halving {2*x-2} instead of {2*x} produces {x-1}."),
         (x + y, f"{x+y} is the sum x + y, not x alone.")],
        f"Add the equations to eliminate y: 2x = {2*x}. Divide by 2: x = {x}, and y = {y} checks in both equations.")

def f_inequality(t, d):
    a, b = t + 2, t + 7
    x = t + 3
    bound = a * x - b
    return (
        f"What is the least integer value of x for which {a}x − {b} > {bound}?",
        x + 1,
        [(x, f"x = {x} gives {a}x − {b} = {bound}, which is not greater than {bound}; the inequality is strict."),
         (x - 1, f"x = {x-1} does not even reach {bound}, so it cannot satisfy the strict inequality."),
         (bound, f"{bound} is the right-hand side of the inequality, not a value of x.")],
        f"Add {b} and divide by the positive coefficient {a}: x > {x}. Because the inequality is strict, the least integer is {x+1}.")

def f_equiv(t, d):
    a, b = t + 3, t + 6
    c = a * b - b * t
    return (
        f"The expression {a}(x + {b}) − {b}x is equivalent to {a-b}x + c. What is the value of c?",
        a * b,
        [(c, f"{c} = {a}×{b} − {b}×{t} skips the {b}x term that never cancels in this grouping; distribute fully first."),
         (a + b, f"{a+b} adds coefficients that are not like terms."),
         (a * b - b, f"Subtracting {b} once instead of distributing it across the x term gives {a*b-b}.")],
        f"Distribute: {a}x + {a*b} − {b}x = {a-b}x + {a*b}. The constant term is c = {a*b}.")

def f_quad_root(t, d):
    p, q = t, t + 7
    big = max(p, q)
    return (
        f"The equation (x − {p})(x − {q}) = 0 has two solutions. What is the larger solution?",
        big,
        [(min(p, q), f"{min(p,q)} is the smaller solution; the question asks for the larger one."),
         (-big, f"Sign errors come from setting each factor to zero without moving the constant: x − {big} = 0 gives x = {big}, not −{big}."),
         (p + q, f"{p+q} is the sum of the solutions (the value of b in x² − bx + c), not a solution itself.")],
        f"A product is zero when a factor is zero: x = {p} or x = {q}. The larger is {big}.")

def f_vertex(t, d):
    b = t + 9
    return (
        f"The function f is defined by f(x) = (x − {t})² + {b}. What is the minimum value of f(x)?",
        b,
        [(t, f"{t} is the x-value where the minimum occurs, not the minimum value."),
         (0, "The squared term's minimum is 0 only when no constant is added; here the output is at least " + str(b) + "."),
         (b + t, f"{b+t} adds the shift to the minimum instead of treating it as the location along the x-axis.")],
        f"A square is never negative and equals zero at x = {t}. The smallest output is therefore the constant {b}.")

def f_radical(t, d):
    a = t + 4
    b = t + 6
    x = a * a - b
    return (
        f"What value of x satisfies the equation √(x + {b}) = {a}?",
        x,
        [(x + 1, f"Squaring and subtracting must undo exactly: {a*a} − {b} = {x}; {x+1} miscomputes the square ({a}² = {a*a})."),
         (a * a + b, f"Adding {b} instead of subtracting gives {a*a+b}; the equation has x + {b} under the radical."),
         (a + b, f"{a+b} treats the radical as linear; squaring is required first.")],
        f"Square both sides: x + {b} = {a*a}. Subtract {b}: x = {x}. Substitution gives √{a*a} = {a}, so the value checks.")

def f_exponential(t, d):
    start = t * 10
    hours = 3
    return (
        f"A culture begins with {start} cells and doubles every hour. According to the model, how many cells are present after {hours} hours?",
        start * 2 ** hours,
        [(start * 2 * hours, f"Multiplying by 2×{hours} treats doubling as additive; each hour multiplies by 2 again (2^{hours})."),
         (start + hours * 2, f"{start + hours*2} adds instead of multiplying."),
         (start * hours, f"Linear growth ({start}×{hours}) ignores doubling.")],
        f"Three doublings multiply the start by 2³ = 8: {start} × 8 = {start*2**hours} cells.")

def f_percent(t, d):
    price = t * 20
    new = Fraction(price * 125, 100)
    newi = int(new)
    return (
        f"A jacket originally costs ${price}. Its price increases by 25%. What is the new price, in dollars?",
        newi,
        [(price - price // 5, f"{price - price//5} applies a 20% DECREASE; the problem increases the price by 25%."),
         (price - price // 4, f"{price - price//4} subtracts a quarter, applying a decrease instead of an increase."),
         (price * 2, f"{price*2} doubles the price, which corresponds to +100%, not +25%.")],
        f"A 25% increase multiplies by 1.25: {price} × 1.25 = {newi} dollars.")

def f_ratio(t, d):
    blue = t * 3
    white = t * 5
    return (
        f"A paint mixture uses blue and white paint in a ratio of 3 to 5. If the mixture contains {blue} liters of blue paint, how many liters of white paint does it contain?",
        white,
        [(blue + 2, f"Adding the 2-part difference to the blue amount gives {blue+2}; ratio steps scale multiplicatively."),
         (blue * 5, f"Multiplying by the white part 5 without dividing by the blue part 3 double-counts the scale factor."),
         (blue, f"Equal amounts would require a 1:1 ratio, not 3:5.")],
        f"The scale factor is {blue} ÷ 3 = {t}. Multiply the white part: 5 × {t} = {white} liters.")

def f_mean(t, d):
    vals = [t, t + 2, t + 4, t + 6]
    mean = sum(vals) // 4
    return (
        f"Four values are {', '.join(map(str, vals))}. What is their mean?",
        mean,
        [(t + 2, f"{t+2} is the second value, not the arithmetic mean."),
         (sum(vals), f"{sum(vals)} is the sum; the mean divides by the count 4."),
         (t + 5, f"{t+5} results from dividing by 3 instead of 4.")],
        f"The sum is {sum(vals)}; dividing by 4 gives {mean}.")

def f_probability(t, d):
    red = t
    blue = t + 3
    return (
        f"A bag contains {red} red beads and {blue} blue beads. One bead is chosen at random. The probability of choosing red equals {red}/n. What is n?",
        red + blue,
        [(blue, f"{blue} counts only the non-favorable beads as the denominator."),
         (red * blue, f"Multiplying the counts, {red*blue}, treats drawing two beads, not one."),
         (red, f"{red} is the number of favorable outcomes, not the total.")],
        f"The denominator counts every bead: {red} + {blue} = {red+blue}.")

def f_unitrate(t, d):
    pages = t * 24
    return (
        f"A printer produces {pages} pages in 6 minutes at a constant rate. How many pages does it produce in 10 minutes?",
        t * 40,
        [(pages + 10, f"Adding the 10 minutes as pages ignores the rate entirely."),
         (t * 24, f"{pages} is the 6-minute output; 10 minutes produces more."),
         (t * 30, f"{t*30} uses a rate of {t*5} pages per minute; the rate is {pages}÷6 = {t*4}.")],
        f"The rate is {pages} ÷ 6 = {t*4} pages per minute. Multiply by 10 minutes: {t*40} pages.")

def f_triangle_area(t, d):
    base, height = 2 * t, t + 3
    area = t * (t + 3)
    return (
        f"A right triangle has perpendicular sides of lengths {base} cm and {height} cm. What is its area, in square centimeters?",
        area,
        [(base * height, f"{base*height} is twice the area; the triangle formula includes ½."),
         (base + height, f"{base+height} adds the side lengths instead of multiplying them."),
         (area + t, f"{area+t} adds an extra half-step error to the product.")],
        f"Area = ½ × base × height = ½ × {base} × {height} = {area}.")

def f_circle(t, d):
    return (
        f"A circle has radius {t} centimeters. Its circumference is cπ centimeters. What is the value of c?",
        2 * t,
        [(t, f"{t} is the radius itself; circumference scales by 2π."),
         (t * t, f"{t*t} uses the area formula (πr²), not the circumference."),
         (t + 2, f"{t+2} adds a constant to the radius instead of doubling it; circumference doubles the radius.")],
        f"C = 2πr = 2π({t}) = {2*t}π, so c = {2*t}.")

def f_pythag(t, d):
    a, b = 3 * t, 4 * t
    return (
        f"A right triangle has legs of lengths {a} and {b}. What is the length of its hypotenuse?",
        5 * t,
        [(a + b, f"{a+b} adds the legs; the hypotenuse is shorter than the sum but not equal to it."),
         (5 * t - 1, f"{5*t-1} is one less than the exact hypotenuse; ({a})² + ({b})² = {25*t*t}, whose root is {5*t}."),
         (5 * t + 1, f"{5*t+1} is one more than the exact hypotenuse; the root of {25*t*t} is exactly {5*t}.")],
        f"a² + b² = ({a})² + ({b})² = {25*t*t}, and √{25*t*t} = {5*t}.")

def f_slope(t, d):
    x1, x2 = t, t + 4
    y1, y2 = 2 * t, 2 * t + 12
    slope = 3
    return (
        f"A line passes through the points ({x1}, {y1}) and ({x2}, {y2}). What is its slope?",
        slope,
        [(y2 - y1, f"{y2-y1} is the rise alone; slope divides by the run {x2-x1}."),
         (Fraction(4, 12).__str__(), f"{Fraction(4,12)} inverts the ratio: slope = rise ÷ run, not run ÷ rise."),
         (x2 - x1, f"{x2-x1} is the run alone.")],
        f"Slope = (y₂ − y₁)/(x₂ − x₁) = {y2-y1} ÷ {x2-x1} = {slope}.")

def f_volume(t, d):
    r, h = t + 1, t + 3
    c = t + 1
    return (
        f"A cylinder has radius {r} cm and height {h} cm. Its volume is cπ cubic centimeters. What is the value of c?",
        r * r * h,
        [(r * h, f"{r*h} omits one factor of the radius; volume uses r²."),
         (2 * r * h, f"{2*r*h} is the lateral surface area's coefficient, not the volume."),
         (r + h, f"{r+h} adds dimensions that must be multiplied.")],
        f"V = πr²h = π({r})²({h}) = {r*r*h}π, so c = {r*r*h}.")

def f_trig(t, d):
    opp, hyp = 3 * t, 5 * t
    return (
        f"In a right triangle, the side opposite angle A has length {opp} and the hypotenuse has length {hyp}. What is sin(A)?",
        f"{opp}/{hyp}",
        [(f"{hyp}/{opp}", f"{hyp}/{opp} inverts the ratio; sine is opposite over hypotenuse."),
         (f"{4*t}/{hyp}", f"{4*t}/{hyp} is the cosine (adjacent over hypotenuse) for this triangle."),
         (f"{opp}/{4*t}", f"{opp}/{4*t} is the tangent (opposite over adjacent).")],
        f"sin(A) = opposite ÷ hypotenuse = {opp}/{hyp}.")

def f_angle(t, d):
    a = 37 + (t % 5)
    return (
        f"Two angles are complementary. One angle measures {a} degrees. What is the measure of the other angle, in degrees?",
        90 - a,
        [(180 - a, f"{180-a} is the supplement; complementary angles sum to 90."),
         (a, f"Equal angles would each measure 45°, but the given angle is {a}°."),
         (90 + a, f"{90+a} adds instead of subtracting from 90.")],
        f"Complementary angles sum to 90°: 90 − {a} = {90-a}.")

def f_median(t, d):
    vals = [t + 4, t, 2 * t + 2, t + 1, t + 7]
    s = sorted(vals)
    med = s[2]
    mean = sum(s) // 5
    wrongs = []
    if mean != med:
        wrongs.append((mean, f"{mean} is the mean, not the median."))
    for c, why in [(s[0], f"{s[0]} is the smallest value; the median is the middle of the ordered list."),
                   (s[4], f"{s[4]} is the largest value."),
                   (s[1], f"{s[1]} is the second value after ordering, not the middle one."),
                   (s[3], f"{s[3]} is the fourth value after ordering, not the middle one."),
                   (med + 1, "An off-by-one slip in reading the middle of the ordered list.")]:
        if len(wrongs) == 3:
            break
        if c != med and all(c != w[0] for w in wrongs):
            wrongs.append((c, why))
    return (
        f"What is the median of the values {', '.join(map(str, vals))}?",
        med, wrongs,
        f"Ordered: {', '.join(map(str, s))}. With five values the median is the third: {med}.")

SAT_FAMILIES = [f_linear_one, f_linear_two, f_rental, f_system2, f_inequality, f_equiv, f_quad_root,
                f_vertex, f_radical, f_exponential, f_percent, f_ratio, f_mean, f_probability,
                f_unitrate, f_triangle_area, f_circle, f_pythag, f_slope, f_volume, f_trig,
                f_angle, f_median]

def build_sat_math():
    n = 1
    for t in range(15, 27):
        for fam in SAT_FAMILIES:
            prompt, correct, wrongs, exp = fam(t, None)
            if correct is None:
                continue
            sat_mc("m4", 400 + n * 3, SAT_DOMAIN.get(fam.__name__, "Algebra"),
                   SAT_SKILL.get(fam.__name__, "Linear equations in one variable"),
                   diff_for(n), prompt, correct, wrongs, exp)
            n += 1
    # grid-ins from the numeric families
    grid_fams = [f_linear_one, f_linear_two, f_rental, f_quad_root, f_radical, f_triangle_area,
                 f_circle, f_pythag, f_trig, f_angle]
    g = 1
    for t in range(16, 24):
        for fam in grid_fams:
            prompt, correct, wrongs, exp = fam(t, None)
            if isinstance(correct, str):  # trig returns a fraction string; skip for grid input
                continue
            sat_grid("m5", 500 + g, SAT_DOMAIN.get(fam.__name__, "Algebra"),
                     SAT_SKILL.get(fam.__name__, "Linear equations in one variable"),
                     diff_for(g), prompt.replace("What is the value of", "What value of").rstrip("?") + "? (Enter a number.)",
                     correct, exp)
            g += 1

SAT_DOMAIN = {
    "f_linear_one": "Algebra", "f_linear_two": "Algebra", "f_rental": "Algebra", "f_system2": "Algebra",
    "f_inequality": "Algebra", "f_equiv": "Advanced Math", "f_quad_root": "Advanced Math",
    "f_vertex": "Advanced Math", "f_radical": "Advanced Math", "f_exponential": "Advanced Math",
    "f_percent": "Problem-Solving & Data Analysis", "f_ratio": "Problem-Solving & Data Analysis",
    "f_mean": "Problem-Solving & Data Analysis", "f_probability": "Problem-Solving & Data Analysis",
    "f_unitrate": "Problem-Solving & Data Analysis", "f_median": "Problem-Solving & Data Analysis",
    "f_triangle_area": "Geometry & Trigonometry", "f_circle": "Geometry & Trigonometry",
    "f_pythag": "Geometry & Trigonometry", "f_slope": "Algebra", "f_volume": "Geometry & Trigonometry",
    "f_trig": "Geometry & Trigonometry", "f_angle": "Geometry & Trigonometry",
}
SAT_SKILL = {
    "f_linear_one": "Linear equations in one variable", "f_linear_two": "Linear functions",
    "f_rental": "Linear functions", "f_system2": "Systems of two linear equations",
    "f_inequality": "Linear inequalities in one variable", "f_equiv": "Equivalent expressions",
    "f_quad_root": "Quadratic equations", "f_vertex": "Nonlinear functions",
    "f_radical": "Radical equations", "f_exponential": "Exponential functions",
    "f_percent": "Percentages", "f_ratio": "Ratios and proportional relationships",
    "f_mean": "Measures of center", "f_probability": "Probability and conditional probability",
    "f_unitrate": "Unit rates", "f_median": "Measures of center",
    "f_triangle_area": "Area and volume", "f_circle": "Circles",
    "f_pythag": "Right triangles and trigonometry", "f_slope": "Linear functions",
    "f_volume": "Area and volume", "f_trig": "Right triangles and trigonometry",
    "f_angle": "Lines, angles, and triangles",
}

# --------------------------------------------------------------------------
# ACT MATH — five choices (engine renders the fifth; ACT has no grid-ins)
# --------------------------------------------------------------------------
def act_mc(prefix, base, domain, skill, diff, prompt, correct, wrongs, exp):
    assert len(wrongs) == 4
    add("act_math", domain, skill, diff, prompt, correct, wrongs, exp,
        qid=qid(prefix, base), banktag="math", test="act", section="math")

ACT_FAMS = [
    (f_linear_one, "Algebra", "Linear equations"),
    (f_linear_two, "Algebra", "Linear functions and graphs"),
    (f_rental, "Algebra", "Modeling with linear equations"),
    (f_system2, "Algebra", "Solving systems of equations"),
    (f_inequality, "Algebra", "Linear inequalities"),
    (f_equiv, "Algebra", "Simplifying algebraic expressions"),
    (f_quad_root, "Intermediate Algebra", "Quadratic equations"),
    (f_vertex, "Intermediate Algebra", "Quadratic functions"),
    (f_radical, "Intermediate Algebra", "Radical and rational equations"),
    (f_exponential, "Intermediate Algebra", "Exponential growth"),
    (f_percent, "Pre-Algebra", "Percent problems"),
    (f_ratio, "Pre-Algebra", "Ratio and proportion"),
    (f_mean, "Statistics & Probability", "Measures of center"),
    (f_median, "Statistics & Probability", "Median and ordering data"),
    (f_probability, "Statistics & Probability", "Simple probability"),
    (f_unitrate, "Pre-Algebra", "Rates and unit conversion"),
    (f_triangle_area, "Plane Geometry", "Triangles and area"),
    (f_circle, "Plane Geometry", "Circles: circumference"),
    (f_pythag, "Trigonometry", "Right triangles and Pythagorean theorem"),
    (f_volume, "Plane & Solid Geometry", "Volume of cylinders"),
    (f_trig, "Trigonometry", "Trigonometric ratios"),
    (f_angle, "Plane Geometry", "Angle relationships"),
    (f_slope, "Coordinate Geometry", "Slope of a line"),
    (f_linear_two, "Coordinate Geometry", "Evaluating linear functions"),
]

def build_act_math():
    n = 1
    for t in range(40, 52):
        for fam, domain, skill in ACT_FAMS:
            prompt, correct, wrongs, exp = fam(t, None)
            if correct is None or isinstance(correct, str):
                continue
            # fifth ACT choice: first candidate that collides with nothing already present
            taken = {str(correct)} | {str(w[0]) for w in wrongs}
            base = wrongs[0][0] if isinstance(wrongs[0][0], (int, float)) else 2
            extra_val = None
            for cand in (correct + abs(base), correct - abs(base), abs(base) + 1, correct + 3, correct + 7):
                if str(cand) not in taken:
                    extra_val = cand
                    break
            if extra_val is None:
                continue
            extra = (extra_val, "Compensating errors: mixing this slip with the correct arithmetic yields a value that satisfies neither step.")
            act_mc("am", 1000 + n * 2, domain, skill, diff_for(n), prompt, correct, list(wrongs) + [extra], exp)
            n += 1

# --------------------------------------------------------------------------
# SAT READING & WRITING — one passage per question, 25-150 words, 8 item types
# --------------------------------------------------------------------------
def sat_rw(prefix, base, domain, skill, diff, q, correct, wrongs, exp, passage, kind):
    add("sat_rw", domain, skill, diff, q, correct, wrongs, exp,
        qid=qid(prefix, base), banktag="rw", test="sat", section="rw", kind=kind, passage=passage)

SCEN = [
 ("ferry", "A small island's ferry schedule once depended on the tide. When the tide was low, the dock could not be reached, so crossings were moved to the hours around high water. Islanders learned to plan errands around the timetable, and shops began opening earlier on crossing days.", "The ferry schedule reflected the physical limits of the harbor.", "Crossings were moved to the hours around high water.", "illustrate how a natural constraint shaped daily routines", "The tide, not preference, determined when the ferry could dock.", "shopkeepers"),
 ("glacier", "A photographer returned to the same glacier each August and fixed the camera to the same tripod marks. Comparing decades of images, she found that the glacier's lower edge had retreated uphill. She published the sequence with detailed notes so that others could repeat her vantage points exactly.", "The photographer designed her project so others could reproduce her observations.", "She fixed the camera to the same tripod marks and published vantage-point notes.", "explain how a comparison was made repeatable", "Reproducing the photographs required the same positions and timing.", "inventory"),
 ("loom", "Weavers in a mountain village used a loom whose pattern was controlled by punched cards, a method that spread widely in the nineteenth century. A visiting engineer assumed the weavers copied factory machines. In fact, the village had adapted the technique first, and the factories later scaled it up.", "The village adopted the punched-card technique before factories popularized it.", "The engineer assumed the direction of influence and was mistaken about it.", "correct an assumption about the direction of influence", "Similar techniques do not prove that one user learned from the other.", "committee"),
 ("pipeline", "Engineers buried sensors along a water pipeline that crossed a desert. The sensors reported pressure every hour, and a small drop in pressure often preceded a visible leak by several days. Maintenance crews began checking the flagged segments before water reached the surface.", "Early detection allowed crews to act before leaks became visible.", "A small pressure drop often preceded a visible leak by several days.", "describe a practical benefit of continuous measurement", "The sensors revealed a signal that surface inspection alone missed.", "historian"),
 ("orchard", "An orchard kept bees in hives at its edges. After a spring storm knocked down several trees, the owner noticed that fruit set was uneven: rows nearest the surviving hives produced more than rows whose hives had been lost. The following year, hives were placed so every row stood near one.", "Pollinator placement can affect how evenly an orchard produces fruit.", "Rows nearest surviving hives produced more fruit after the storm.", "connect an observation to a change in practice", "The replanting of hives was a response to the uneven fruit set.", "biologist"),
 ("scribe", "A monastery's scribes copied a mathematics text and, in the margins, added their own worked examples. Centuries later, a historian compared those margins across three surviving copies. The examples differed, suggesting each scribe practiced the method rather than copying a single model.", "The marginal examples varied, so they likely were not copied from one source.", "The worked examples differed across the surviving copies.", "use variation to draw a conclusion about practice", "Scribes who copied the same text could still compose different examples.", "curator"),
 ("rail", "A railway company painted small numbers on its cars so crews could record each car's location at every station. When a car was reported in two places on the same evening, the log revealed that a number had been misread, not that the car had moved impossibly fast.", "The log resolved an apparent contradiction by revealing a recording error.", "A number had been misread in the log.", "explain how a record explained an apparent impossibility", "The impossible report was a data-entry mistake, not an event.", "astronomer"),
 ("reef", "Divers mapped coral along a reef in two seasons. In summer, one species dominated a shallow shelf; in winter, the same shelf was covered mostly by a second species. The divers concluded that the shelf's appearance depends on when it is observed.", "The dominant species on the shelf changed with the season.", "One species dominated in summer and another in winter.", "show how timing affects what an observation finds", "A single visit could misrepresent which species is typical.", "librarian"),
 ("kiln", "A potter fired test tiles beside each batch of pots. When a batch came out pale, the tiles showed the kiln had not reached its usual temperature. Because the tiles had been fired alongside the pots, the potter could match the failure to a specific firing.", "The test tiles recorded the conditions of a particular firing.", "The tiles showed the kiln had not reached its usual temperature.", "show how a companion sample documents conditions", "Tiles fired with a batch share that batch's history.", "archaeologist"),
 ("bridge", "A footbridge carried a counter that recorded crossings. After a festival, the count exceeded the town's population several times over. Rather than concluding that visitors outnumbered residents, officials noted that the same people crossed repeatedly during the day.", "Repeated crossings by one person can make a count exceed the number of people.", "The same people crossed the bridge multiple times.", "explain why a count overstates the number of individuals", "A crossing count measures events, not distinct visitors.", "editor"),
 ("seed", "A seed bank stored samples in sealed rooms and germinated a sample from each lot every few years. When one lot's seeds failed to sprout, the record showed the room's humidity had drifted above its range. Other lots from the same room also showed reduced sprouting.", "Storage conditions affected several lots stored together.", "Other lots from the same room also showed reduced sprouting.", "use a pattern across samples to identify a shared cause", "The failures shared a room, pointing to storage rather than the seeds themselves.", "ecologist"),
 ("theater2", "A playwright revised a scene after its first reading. She shortened one speech by half, and the actor who had stumbled over it no longer did. The playwright cautioned that the reading happened once, so she tested the revision with a second actor before concluding the change had caused the improvement.", "The playwright tested her explanation before accepting it.", "She tested the revision with a second actor.", "describe a deliberate check of a suspected cause", "One reading could not rule out other reasons for the improvement.", "designer"),
 ("cartography", "Two chartmakers drew the same bay. One showed a lighthouse at the northern point; the other omitted it. A survey later showed the lighthouse had been built between the two surveys, so neither chart was wrong.", "The charts recorded the bay at different times.", "The lighthouse was built between the two surveys.", "resolve a disagreement using a timeline", "Omission in the older chart reflected the bay's earlier state.", "geologist"),
 ("ink", "A conservator noticed that ink on several letters had faded unevenly. The faded strokes were those exposed when the letters were displayed in a case. Pages kept in storage kept their contrast, so display appeared to be the relevant difference.", "Exposure during display likely contributed to the uneven fading.", "Faded strokes were those exposed when the letters were displayed.", "compare displayed and stored items to isolate a factor", "The letters themselves were similar; their handling differed.", "composer"),
 ("moth", "Biologists recorded two forms of a moth in a forest, one pale and one dark. Bird droppings on pale wings made them easier to find, while dark wings blended with shaded bark. In open areas, however, pale moths were the harder target, so no single form was safest everywhere.", "Neither form had an advantage in all habitats.", "Pale moths were harder to find in open areas.", "explain why no single form dominated", "Each form's visibility depended on the background.", "engineer"),
 ("aqueduct", "An ancient aqueduct's slope was so gradual that engineers today debate how it was surveyed. A trench was recently found beside the channel, cut in short segments. The archaeologists argue the trench served as a working line for leveling each segment before the channel was built.", "The trench may have been a tool for maintaining the aqueduct's grade.", "The trench was cut in short segments beside the channel.", "propose a function for a discovered feature", "A leveling line would explain the trench's position and segmentation.", "surveyor"),
 ("hearing", "A composer tested a hall by clapping at its center. The clap returned as a distinct echo from the rear wall. After curtains were hung along that wall, the echo vanished. The composer concluded the curtains had absorbed the reflection rather than the hall being rebuilt.", "Adding curtains changed the hall's acoustic reflection.", "The echo vanished after curtains were hung.", "attribute a change to a specific modification", "Only the curtains changed between the two claps.", "seamstress"),
 ("flight", "A researcher compared the flight paths of two bird species crossing a valley. One followed the ridgeline; the other flew straight across the middle. When wind speeds rose, both species shifted toward the ridge, suggesting they were responding to the same weather rather than copying each other.", "Both species responded to wind by shifting their routes.", "Both species shifted toward the ridge when wind speeds rose.", "show a shared response to a common factor", "The convergence appeared only when the wind changed.", "nurse"),
]

def build_sat_rw():
    n = 1
    for i, (topic, passage, main, evidence, purpose, inference, role) in enumerate(SCEN):
        common = dict()
        d = diff_for(i)
        sat_rw("r3", 300 + n * 5, "Information & Ideas", "Central Ideas and Details", d,
               "Which choice best states the main idea of the text?", main,
               [("Every method described in the text failed outright.", "The text reports a workable outcome or a supported explanation, not a total failure."),
                ("The text argues that observations cannot support conclusions.", "The conclusion is drawn from the observations rather than dismissing them."),
                ("All the situations described produced identical results.", "The text highlights differences or a limited conclusion, not uniformity.")],
               f"The observations support this main idea: {main} The other choices contradict the text or overgeneralize it.", passage, "reading")
        n += 1
        sat_rw("r3", 300 + n * 5, "Information & Ideas", "Command of Evidence", d,
               "Which detail from the text best supports its conclusion?", evidence,
               [("The text reports that all measurements were identical.", "No such uniformity appears; the support is the specific recorded detail."),
                ("The text says the question had been resolved before the observations.", "The observations came first; nothing was pre-resolved."),
                ("The text states that no comparison or change occurred.", "A comparison or change anchors the conclusion.")],
               f"The supporting detail is that {evidence[0].lower() + evidence[1:]} It ties the recorded action or comparison to the conclusion.", passage, "reading")
        n += 1
        sat_rw("r3", 300 + n * 5, "Craft & Structure", "Text Structure and Purpose", d,
               "Which choice best describes the overall purpose of the text?", purpose,
               [("to argue that measurements should be discarded", "The text relies on observations instead of dismissing them."),
                ("to list events without connecting them", "The text links its details to a conclusion."),
                ("to prove a universal rule from one case", "The conclusion stays within what the case shows.")],
               f"The text is organized to {purpose}; it connects its details rather than cataloguing them or overclaiming.", passage, "reading")
        n += 1
        sat_rw("r3", 300 + n * 5, "Information & Ideas", "Inferences", d,
               "Which inference is most strongly supported by the text?", inference,
               [("The result must hold unchanged everywhere.", "The text limits the conclusion to the situation observed."),
                ("The people involved acted without any reason.", "The text presents purposes and reasoning behind the actions."),
                ("The described observations never took place.", "The observations are the basis of the text.")],
               f"The supported inference is that {inference[0].lower() + inference[1:]} The text does not license broader claims.", passage, "reading")
        n += 1
        sat_rw("r3", 300 + n * 5, "Craft & Structure", "Cross-Text Connections", "hard",
               f"Text 1: {passage}\n\nText 2: A commentator claims this example shows what happens in every similar situation.\n\nHow would the author of Text 1 most likely respond to the commentator?",
               "The commentator draws a broader conclusion than this evidence supports.",
               [("The commentator repeats measurements that the text already presents.", "Text 2 adds no measurements; it extends the conclusion."),
                ("The commentator quotes a rule that the text states explicitly.", "Text 1 states a limited finding, not a universal rule."),
                ("The commentator proves the events in Text 1 did not occur.", "Text 2 accepts the events and overextends them.")],
               "Text 1 describes a specific case; Text 2 generalizes it without new evidence, so the cautious response rejects the extension.", passage, "reading")
        n += 1
        sat_rw("w3", 300 + n * 5, "Expression of Ideas", "Rhetorical Synthesis",
               d, f"While researching {topic}, a student took these notes:\n• {evidence}\n• The {role} recorded the outcome described above.\n• The observation was limited to the situation described.\n\nThe student wants to state the finding without overgeneralizing. Which choice best uses the notes?",
               evidence,
               [(f"The {role} proved the outcome applies to every comparable situation.", "This exceeds what a single limited observation can support."),
                ("The notes contain no recorded outcome.", "The notes include the recorded outcome used as the answer."),
                ("Because no one recorded anything, the finding is unknowable.", "The notes state that the outcome was recorded.")],
               "The goal is an accurate, limited statement of the recorded outcome — exactly the noted detail — without claiming universal application.", passage, "writing")
        n += 1
        sat_rw("w3", 300 + n * 5, "Standard English Conventions", "Boundaries", d,
               f"The {role} recorded the observation carefully ___ the notes were later verified by a second reader.",
               ";", [(",", "A comma alone between two complete sentences creates a comma splice."),
                     ("No punctuation", "No punctuation leaves two independent clauses fused in a run-on."),
                     (": and", "A colon introduces an explanation or list; pairing it with 'and' misjoins the clauses.")],
               "Both sides are complete sentences, so a semicolon is the correct boundary; a comma or nothing makes a splice or run-on.", passage, "writing")
        n += 1
        sat_rw("w3", 300 + n * 5, "Standard English Conventions", "Form, Structure, and Sense", d,
               f"Having recorded the outcome, ___ submitted the notes for review.",
               f"the {role}", [("the notes were submitted for review", "The opening phrase must modify the person who recorded, not the notes."),
                               ("a review of the notes was requested", "The modifier's subject must be the actor, not a passive event."),
                               ("several corrections were made", "Corrections cannot have recorded the outcome.")],
               f"The phrase describes the {role}, so the actor must follow the comma; the other choices dangle the modifier.", passage, "writing")
        n += 1

CONV = [
    ("botanist", "seed inventory"), ("surveyor", "boundary report"), ("archivist", "letter catalog"),
    ("dramatist", "scene revision"), ("ranger", "trail survey"), ("translator", "poem draft"),
    ("engineer", "pump test"), ("reviewer", "manuscript notes"), ("coach", "training log"),
    ("chemist", "sample log"), ("planner", "transit memo"), ("docent", "tour outline"),
    ("conservator", "panel record"), ("programmer", "patch summary"), ("farmer", "field log"),
    ("curator", "exhibit label"), ("captain", "logbook entry"), ("analyst", "budget memo"),
    ("librarian", "shelf list"), ("geologist", "core sample log"), ("editor", "style guide"),
    ("athlete", "lap sheet"),
]

def build_rw_conventions():
    n = 1
    for i, (who, work) in enumerate(CONV):
        d = diff_for(i)
        sat_rw("w4", 400 + n * 5, "Standard English Conventions", "Subject-Verb Agreement", d,
               f"The {who}'s record of {work}s ___ kept in the field office.",
               "is", [("are", f"'Are' agrees with plural nouns; the subject is the singular 'record'."),
                      ("were", "Past tense is not required, and 'were' also disagrees with the singular subject."),
                      ("have been", "'Have' is plural and shifts tense unnecessarily.")],
               "The subject is the singular noun 'record'; the prepositional phrase 'of ...s' does not change agreement, so 'is' is correct.",
               f"The {who} finished the {work} and added it to the office collection.", "writing")
        n += 1
        sat_rw("w4", 400 + n * 5, "Standard English Conventions", "Boundaries", d,
               f"The {who} completed the {work} ___ the supervisor then signed it.",
               ";", [(",", "A comma by itself between independent clauses creates a splice."),
                     ("No punctuation", "No punctuation joins two sentences in a run-on."),
                     (", so", "'So' suggests a result; the two actions are merely sequential.")],
               "Both clauses stand alone, so the semicolon is the correct boundary.", "The office requires a second signature on every finished document.", "writing")
        n += 1
        sat_rw("w4", 400 + n * 5, "Standard English Conventions", "Form, Structure, and Sense", d,
               f"After checking the {work} for errors, ___ filed the corrected copy.",
               f"the {who}", [("the errors were filed", "The opening phrase must describe the person checking, not the errors."),
                              ("a corrected copy was filed", "A passive construction leaves the modifier without its actor."),
                              ("filing happened immediately", "Events cannot perform the checking action.")],
               f"Only the {who} can perform the opening action, so the actor must follow the comma.", "Filing happens at the end of the workday.", "writing")
        n += 1
        sat_rw("w4", 400 + n * 5, "Standard English Conventions", "Form, Structure, and Sense", d,
               f"Two {who}s each maintained a log. Both logs covered the same {work}. The note read, “The ___ entries agree.”",
               f"{who}s’", [(f"{who}’s", "The singular possessive treats both logs as one person's."),
                             (f"{who}s", "The bare plural lacks the apostrophe needed for possession."),
                             (f"{who}s’s", "A plural ending in s takes only an apostrophe.")],
               f"Two {who}s share the entries, so the plural possessive {who}s’ is required.", "The note was posted beside the shelf.", "writing")
        n += 1
        sat_rw("w4", 400 + n * 5, "Expression of Ideas", "Transitions", d,
               f"The {who} expected the {work} to take a week. ___ it took only two days.",
               "However,", [("Therefore,", "'Therefore' signals a result; the second sentence contrasts with the expectation."),
                            ("Similarly,", "'Similarly' signals likeness, but the outcome differs from the expectation."),
                            ("For instance,", "'For instance' introduces an example rather than a contrast.")],
               "The second sentence contrasts the outcome with the expectation, so 'However' is the logical transition.", "The schedule was posted on the office wall.", "writing")
        n += 1

NOTE_OLD = 52
def build_rw_synthesis():
    n = 1
    for i, (who, work) in enumerate(CONV[:16]):
        old = NOTE_OLD + i * 6
        new = old + 24
        notes = (f"While researching a topic, a student took these notes:\n"
                 f"• A team recorded the number of daily visits to a fictional {work} display.\n"
                 f"• Before a new sign was posted, the display drew {old} visits per day.\n"
                 f"• After the sign was posted, it drew {new} visits per day.\n"
                 f"• Both counts covered the same number of days.")
        d = diff_for(i)
        sat_rw("w5", 500 + n * 5, "Expression of Ideas", "Rhetorical Synthesis", d,
               f"{notes}\n\nThe student wants to emphasize the size of the change in daily visits. Which choice best uses the notes?",
               f"Daily visits rose by {new - old}, from {old} to {new}.",
               [("The team recorded visits to a display.", "This names the activity but gives no change and no values."),
                (f"The display drew {new} visits before the sign and {old} after it.", f"This reverses the before and after values ({old} then {new})."),
                ("Both counting periods covered the same number of days.", "Equal periods make the counts comparable but do not show the change itself.")],
               f"Emphasizing a change requires both values in order and, ideally, the difference: +{new-old} visits.", notes, "writing")
        n += 1
        sat_rw("w5", 500 + n * 5, "Expression of Ideas", "Rhetorical Synthesis", "hard",
               f"{notes}\n\nThe student wants to explain why the counts alone cannot prove the sign caused the increase. Which choice best uses the notes?",
               "The notes do not show whether anything else changed when the sign was posted.",
               [(f"The visits increased by exactly {new - old} per day.", "This restates the change; it does not address what caused it."),
                ("The team counted visits for the same number of days.", "Equal durations help comparison but rule out nothing about other causes."),
                (f"The display received {new} visits after the sign was posted.", "This reports one count without connecting it to causation at all.")],
               "A before-and-after count cannot isolate a cause: conditions besides the sign might also have changed, which is the limitation the student wants stated.", notes, "writing")
        n += 1

TABLES = [
    ("a trails survey", "Trail (km): 1.5 · 3 · 4.5 · 6", "Recorded times (h): 0.5 · 1 · 1.5 · 2", "the times rise by 0.5 h per 1.5 km", "0.5 h per 1.5 km"),
    ("a river gauge", "Day: 1 · 2 · 3 · 4", "Depth (cm): 12 · 14 · 16 · 18", "depth rises 2 cm per day", "2 cm per day"),
    ("a battery bench", "Load (Ω): 2 · 4 · 6 · 8", "Current (A): 6 · 3 · 2 · 1.5", "current falls as load rises", "halves from 2 Ω to 4 Ω"),
    ("a greenhouse log", "Week: 1 · 2 · 3 · 4", "Seedlings: 20 · 26 · 31 · 35", "growth slows each week", "6 then 5 then 4"),
    ("a kiln test", "Setting: low · mid · high", "Chips fired: 4 · 7 · 9", "more chips survive at higher settings until they level off", "7 to 9"),
    ("a bus survey", "Route: A · B · C", "Riders (hundreds): 3 · 6 · 5", "Route B carries the most riders", "Route B"),
    ("a pond count", "Month: May · June · July", "Frogs: 40 · 90 · 70", "the count peaks in June", "June"),
    ("a tower test", "Height (m): 10 · 20 · 30", "Reach (km): 11 · 16 · 19", "reach grows less with each step", "5 then 3"),
    ("a soil sample", "Depth (cm): 5 · 15 · 25", "Moisture (%): 22 · 24 · 26", "moisture rises steadily with depth", "2 points per 10 cm"),
    ("a turbine log", "Wind (m/s): 3 · 6 · 9", "Power (kW): 1 · 8 · 27", "power grows faster than wind speed", "roughly cubes"),
]

def build_rw_quant():
    n = 1
    for i, (ctx, col, val, trend, summary) in enumerate(TABLES):
        d = diff_for(i)
        sat_rw("r5", 500 + n * 5, "Information & Ideas", "Command of Evidence", d,
               f"A table from {ctx} shows:\n{col}\n{val}\n\nWhich choice best describes what the data show?",
               trend.capitalize() + ".", [("The data never change across the column.", "Each column shows a clear progression, not a constant."),
                                          ("The data fall to zero at the largest value.", "No entry reaches zero in the table."),
                                          ("The columns are unrelated to each other.", "The paired columns show a consistent relation.")],
               f"Reading the table left to right: {trend}. The other choices misstate the recorded values.", f"A table from {ctx} shows:\n{col}\n{val}", "reading")
        n += 1
        sat_rw("r5", 500 + n * 5, "Information & Ideas", "Command of Evidence", "hard",
               f"A table from {ctx} shows:\n{col}\n{val}\n\nA writer claims the pattern is monotonic (always in the same direction). Which detail best supports the claim?",
               summary + ".", [("The middle entry alone.", "One entry cannot establish a direction across the table."),
                               ("The units of the second column.", "Units describe measurement, not a pattern."),
                               ("The absence of a fourth row.", "Missing rows say nothing about direction.")],
               f"Monotonic means one direction throughout, which {summary} captures from the paired entries.", f"A table from {ctx} shows:\n{col}\n{val}", "reading")
        n += 1

# --------------------------------------------------------------------------
# ACT ENGLISH — four long passages with numbered underlined portions
# --------------------------------------------------------------------------
AE_PASSAGES = [
 ("ae1", "Sleep and the Brain", """Neuroscientists have spent decades [1] asking why sleep is necessary, since an animal that sleeps cannot hunt, eat, or defend itself. One influential theory holds that sleep lets the brain clear away metabolic waste that builds up during waking hours. [2] Supporting this idea, researchers found that the spaces between brain cells expand during sleep, which increases the flow of fluid that flushes out waste. [3] Other scientists caution that the evidence is not yet conclusive, the brain may also need sleep to consolidate memories, regulate hormones, or repair cells. [4] If the waste-clearance theory is correct, it would help explain why nearly every animal sleeps despite the [5] apparent risks, and why prolonged sleep deprivation impairs thinking so severely. [6] Some critics note that species which sleep very little, such as certain migrating birds, complicate the picture. [7] During migration, these birds appear to sleep in brief bursts, [8] they may suppress waste clearance without obvious harm. [9] Whether sleep's purpose is clearance, memory, repair, or some combination, researchers agree that the question matters for human health. [10] Chronic short sleep has been linked to [11] impairments in attention, immune function, and metabolism. [12] Understanding why we sleep may therefore help explain why so many of us feel terrible when we do not.""", [
  ("[1]", "asking why sleep is necessary", ", asking why sleep is necessary", ["asking: why sleep is necessary", "asking why, sleep is necessary", "asking why sleep is necessary,"], "The sentence is complete and unpunctuated; no colon or comma is needed before the clause 'asking why...'"),
  ("[2]", "Supporting this idea,", "Supporting this idea,", ["Supporting this idea", "Supporting, this idea", "Supporting this idea;"], "The participial phrase 'Supporting this idea' must be set off by a comma from the main clause."),
  ("[3]", "not yet conclusive, the brain may also need sleep", "not yet conclusive; the brain may also need sleep", ["not yet conclusive the brain may also need sleep", "not yet conclusive, although the brain may also need sleep", "not yet conclusive, and the brain may also need sleep"], "Two independent clauses need a semicolon (or a period/fanboys conjunction); a comma alone is a splice."),
  ("[4]", "correct, it would help explain", "correct, it would help explain", ["correct it would help explain", "correct; it would help explain", "correct and it would help explain"], "A comma correctly separates the introductory subordinate clause from the main clause; no change is needed."),
  ("[5]", "apparent risks, and why", "apparent risks, and why", ["apparent risk's, and why", "apparent risks and why", "apparent risks; and why"], "The parallel series 'why nearly every animal sleeps ... and why deprivation impairs' needs the comma before 'and' and the plain plural 'risks.'"),
  ("[6]", "species which sleep very little", "species that sleep very little", ["species whom sleep very little", "species, which sleep very little,", "species they sleep very little"], "Restrictive clauses about non-persons use 'that' without commas."),
  ("[7]", "During migration, these birds appear to sleep in brief bursts,", "During migration, these birds appear to sleep in brief bursts;", ["During migration these birds appear to sleep in brief bursts,", "During migration, these birds appear to sleep in brief bursts", "During migration: these birds appear to sleep in brief bursts,"], "The next clause ('they may suppress...') is independent, so a semicolon is required; a comma alone splices and omitting punctuation runs on."),
  ("[8]", "they may suppress waste clearance", "they may suppress waste clearance", ["they're may suppress waste clearance", "there may suppress waste clearance", "suppressing waste clearance they may"], "The pronoun 'they' refers to the migrating birds; 'they're' means 'they are,' and 'there' is a place word."),
  ("[9]", "Whether sleep's purpose is clearance, memory, repair, or some combination,", "Whether sleep's purpose is clearance, memory, repair, or some combination,", ["Whether sleep's purpose is clearance memory repair or some combination", "Whether sleeps purpose is clearance, memory, repair, or some combination", "Whether sleep's purpose is clearance, memory, repair or some combination,"], "Commas separate the series items and the introductory clause; the possessive 'sleep's' needs the apostrophe."),
  ("[10]", "Chronic short sleep has been linked to", "Chronic short sleep has been linked to", ["Chronic short sleep have been linked to", "Chronic short sleep has been linking to", "Chronic short sleeps has been linked to"], "'Sleep' is singular here, so 'has been linked' agrees; 'have' is plural and 'has been linking' misforms the passive."),
  ("[11]", "impairments in attention, immune function, and metabolism.", "impairments in attention, immune function, and metabolism.", ["impairments in attention immune function and metabolism.", "impairments: in attention, immune function, and metabolism.", "impairments in attention, immune function and, metabolism."], "A three-item series takes commas between items and none after the last item or before the colon-less list."),
  ("[12]", "Understanding why we sleep may therefore help explain", "Understanding why we sleep may therefore help explain", ["Understanding why we sleep may therefore help explains", "To understand why we sleep may therefore help explain", "Understanding why we sleep may therefore help explaining"], "The gerund subject 'Understanding' takes the base verb 'help explain'; 'explains' disagrees and 'help explaining' misforms the complement."),
 ]),
 ("ae2", "The Lighthouse Keepers' Ledger", """For more than a century, lighthouse keepers along a [1] rugged coast recorded weather, ship traffic, and the condition of their lights in daily ledgers. [2] The logs, which were kept in careful handwriting, now serve historians as a rare continuous record of coastal conditions. [3] Unlike ships' logs that traveled with a single vessel, the lighthouse ledgers stayed in one place, [4] they documented conditions at a fixed point for decades. [5] One keeper noted that fog arrived, 'like a wall of wool,' and [6] he described how it silenced even the surf. [7] Keepers also recorded the behavior of birds, [8] struck by the light during migration and often died on the rocks below. [9] Modern ornithologists have used these notes, which are unusual for their precision, [10] to estimate how lighting technology affected migrating birds. [11] The ledgers remind us that careful record keeping can turn ordinary observations into a scientific archive. [12] Because few of these documents survived, the ones that did are treasured by both historians and bird researchers.""", [
  ("[1]", "a rugged coast", "a rugged coast", ["a rugged, coast", "a rugged coast,", "an rugged coast"], "No punctuation belongs between the article's adjective and its noun, and 'an' precedes vowel sounds only."),
  ("[2]", "The logs, which were kept in careful handwriting, now serve historians", "The logs, which were kept in careful handwriting, now serve historians", ["The logs which were kept in careful handwriting, now serve historians", "The logs, which were kept in careful handwriting now serve historians", "The logs which were kept in careful handwriting now serve historians"], "A nonrestrictive clause is set off by two commas, not one and not zero."),
  ("[3]", "the lighthouse ledgers stayed in one place,", "the lighthouse ledgers stayed in one place,", ["the lighthouse ledgers stayed in one place", "the lighthouse ledgers stayed in one place;", "the lighthouse ledgers stayed in one place:"], "The contrast 'Unlike ships' logs...' introduces the main clause with a comma; semicolon or colon would misjoin it."),
  ("[4]", "they documented conditions at a fixed point", "they documented conditions at a fixed point", ["they're documented conditions at a fixed point", "there documented conditions at a fixed point", "their documented conditions at a fixed point"], "'They' is the subject pronoun for the ledgers; 'their' is possessive and cannot be a subject."),
  ("[5]", "arrived, 'like a wall of wool,' and", "arrived, 'like a wall of wool,' and", ["arrived 'like a wall of wool,' and", "arrived, 'like a wall of wool' and,", "arrived: 'like a wall of wool,' and"], "The inserted comparison is parenthetical, so it needs commas on both sides."),
  ("[6]", "he described how it silenced even the surf", "he described how it silenced even the surf", ["he described how it silenced even the surf.", "he described, how it silenced even the surf", "he described how it silenced, even the surf"], "No internal punctuation belongs before the object clause; the sentence continues to its end."),
  ("[7]", "Keepers also recorded the behavior of birds,", "Keepers also recorded the behavior of birds,", ["Keepers also recorded the behavior of birds; struck by the light during migration and often died on the rocks below.", "Keepers, also recorded the behavior of birds,", "Keepers also recorded, the behavior of birds,"], "No change is needed: the comma correctly attaches the participial phrase to 'birds.' A semicolon would separate a fragment, and the other comma placements misstate the structure."),
  ("[8]", "struck by the light during migration and often killed on the rocks below", "struck by the light during migration and often died on the rocks below", ["struck by the light during migration and often dying on the rocks below", "struck by the light during migration and often died on the rocks below", "struck by the light during migration, and often dying on the rocks below"], "The participial series must be parallel: 'struck ... and killed' describes the birds; 'died' and 'dying' break the parallel with the passive participle."),
  ("[9]", "these notes, which are unusual for their precision,", "these notes, which are unusual for their precision,", ["these notes which are unusual for their precision", "these notes, which are unusual for their precision", "these notes which are unusual for their precision,"], "Nonrestrictive 'which' clauses take commas on both sides."),
  ("[10]", "to estimate how lighting technology affected migrating birds", "to estimate how lighting technology affected migrating birds", ["to estimate how lighting technology affects migrating birds.", "estimating how lighting technology affected migrating birds.", "to estimate how lighting technology had affected, migrating birds"], "The infinitive phrase completes 'used these notes'; present tense and stray commas misstate either time or structure."),
  ("[11]", "The ledgers remind us that careful record keeping", "The ledgers remind us that careful record keeping", ["The ledgers remind us, that careful record keeping", "The ledgers remind us; that careful record keeping", "The ledgers remind us that careful record-keeping,"], "'Record keeping' as a compound noun needs no hyphen here; a comma before 'that' incorrectly breaks the object clause."),
  ("[12]", "Because few of these documents survived, the ones that did are treasured", "Because few of these documents survived, the ones that did are treasured", ["Because few of these documents survived the ones that did are treasured", "Because few of these documents survived; the ones that did are treasured", "Because few of these documents survived, however the ones that did are treasured"], "The introductory subordinate clause ends with a comma; no punctuation runs the clauses together and 'however' misstates the logic."),
 ]),
 ("ae3", "A Cartographer's Habit", """[1] When mapmaker Amara Osei began charting a coastal delta, she developed a habit that puzzled her [2] colleagues; before finishing any map, she drew the shoreline a second time, six months later, from memory. [3] The exercise was not, as some assumed, a test of her memory. [4] It was a way of noticing what her earlier work had glossed over. [5] Whatever details she remembered twice, she reasoned, were probably features a traveler would notice; [6] the details she forgot were likely the ones that mattered least. [7] Her first maps, compared with the later versions, show a pattern, [8] the channels change, but the groves of mangroves persist. [9] Osei also interviewed fishers who navigated the delta daily, and [10] she compared their hand-drawn sketches with her surveys. [11] The sketches were rough, yet they marked hazards that precise instruments missed, like a seasonal sandbar visible only at low tide. [12] Osei eventually published both sets of maps together, arguing that memory and measurement catch different kinds of truth.""", [
  ("[1]", "When mapmaker Amara Osei began charting a coastal delta, she developed a habit", "When mapmaker Amara Osei began charting a coastal delta, she developed a habit", ["When mapmaker Amara Osei began charting a coastal delta she developed a habit", "When mapmaker, Amara Osei began charting a coastal delta, she developed a habit", "When mapmaker Amara Osei began charting a coastal delta; she developed a habit"], "The introductory subordinate clause ends with a comma."),
  ("[2]", "colleagues; before finishing any map", "colleagues:", ["colleagues, before finishing any map", "colleagues before finishing any map", "colleagues; before finishing, any map"], "The second clause explains the 'habit,' so a colon introduces the explanation; a semicolon would need two free-standing sentences."),
  ("[3]", "The exercise was not, as some assumed, a test of her memory.", "The exercise was not, as some assumed, a test of her memory.", ["The exercise was not as some assumed, a test of her memory.", "The exercise was not, as some assumed a test of her memory.", "The exercise was not as some assumed a test of her memory."], "The parenthetical 'as some assumed' takes commas on both sides."),
  ("[4]", "It was a way of noticing", "It was a way of noticing", ["It was a way to noticing", "It was a way of notice", "It was a way, of noticing"], "The idiom is 'a way of' plus a gerund, with no comma before 'of.'"),
  ("[5]", "twice, she reasoned, were probably", "twice, she reasoned, were probably", ["twice she reasoned, were probably", "twice, she reasoned were probably", "twice: she reasoned, were probably"], "The speaker tag is parenthetical and takes commas on both sides."),
  ("[6]", "notice; the details she forgot", "notice, while the details she forgot", ["notice, the details she forgot", "notice; the details she forgot", "notice and the details she forgot"], "The contrast between remembered and forgotten details is best joined with a comma plus a contrast word; a semicolon or comma alone misstates the relation or creates a splice."),
  ("[7]", "show a pattern, the channels change, but", "show a pattern: the channels change, but", ["show a pattern, the channels change, but", "show a pattern; the channels change, but", "show a pattern the channels change, but"], "A colon correctly introduces the explanation of the pattern."),
  ("[8]", "mangroves persist.", "mangroves persist.", ["mangroves persist,", "mangroves persist;", "mangroves persist:"], "The sentence ends after 'persist,' so a period is the only correct stop."),
  ("[9]", "interviewed fishers who navigated the delta daily, and", "interviewed fishers who navigated the delta daily, and", ["interviewed fishers, who navigated the delta daily and", "interviewed fishers whom navigated the delta daily, and", "interviewed fishers which navigated the delta daily, and"], "The clause is restrictive (no commas around it) and 'who' is the subject pronoun for people."),
  ("[10]", "she compared their hand-drawn sketches with her surveys", "she compared their hand-drawn sketches with her surveys", ["she compared their hand-drawn sketches to her surveys", "she compared there hand-drawn sketches with her surveys", "she compared their hand-drawn sketches, with her surveys"], "'Compared with' is the standard idiom for contrast; 'there' is not possessive and the comma breaks the phrase."),
  ("[11]", "yet they marked hazards that precise instruments missed,", "yet they marked hazards that precise instruments missed,", ["yet they marked hazards, that precise instruments missed", "yet they marked hazards that precise instruments missed", "yet, they marked hazards that precise instruments missed"], "No comma separates the verb from its object clause; the comma after 'missed' correctly opens the example."),
  ("[12]", "arguing that memory and measurement catch different kinds of truth.", "arguing that memory and measurement catch different kinds of truth.", ["arguing that memory and measurement catch different kinds of truth, ", "arguing, that memory and measurement catch different kinds of truth.", "arguing that memory, and measurement catch different kinds of truth."], "The participial phrase ends the sentence with a period; commas before 'that' or inside the compound subject are wrong."),
 ]),
 ("ae4", "The Repair Bench", """In a workshop that repairs stringed instruments, [1] the most experienced technician, keeps a notebook of failures. [2] Each entry records an instrument's symptom, the repair attempted, and the outcome. [3] The notebook's purpose is not nostalgia, it is pattern recognition. [4] Over years, the technician noticed that certain cracks return after standard glue repairs, [5] especially in instruments that are stored dry. [6] Humidity, rather than the repair itself, appears to determine whether the fix holds. [7] The shop now lends every customer a small hygrometer, and [8] asks them to keep the instrument between forty and sixty percent humidity. [9] Returns for repeat cracks have fallen, though the technician warns that the sample is small and the shop's climate, [10] unusually stable. [11] She also photographs each repair twice, once when the instrument arrives and once a year later, because photographs preserve details that memory smooths away. [12] The notebook and the photographs together make the case that repairs fail for reasons a careful record can reveal.""", [
  ("[1]", "the most experienced technician, keeps a notebook", "the most experienced technician keeps a notebook", ["the most experienced technician, keeps a notebook", "the most experienced technician; keeps a notebook", "the most experienced technician: keeps a notebook"], "No punctuation may separate a subject from its verb."),
  ("[2]", "an instrument's symptom, the repair attempted, and the outcome", "an instrument's symptom, the repair attempted, and the outcome", ["an instruments symptom, the repair attempted, and the outcome", "an instrument's symptom the repair attempted and the outcome", "an instrument's symptom, the repair attempted and, the outcome"], "The possessive needs its apostrophe and the three-item series needs commas between items."),
  ("[3]", "not nostalgia, it is pattern recognition", "not nostalgia; it is pattern recognition", ["not nostalgia, it is pattern recognition", "not nostalgia it is pattern recognition", "not nostalgia: it is pattern recognition"], "Two independent clauses require a semicolon, period, or comma-plus-conjunction; a colon after a full clause here would announce a list rather than a contrast."),
  ("[4]", "return after standard glue repairs,", "return after standard glue repairs,", ["return after standard glue repairs", "return, after standard glue repairs,", "return after standard, glue repairs,"], "The comma correctly opens the modifying phrase; no other commas belong inside it."),
  ("[5]", "especially in instruments that are stored dry", "especially in instruments that are stored dry", ["especially in instruments, that are stored dry", "especially in instruments which are stored dry,", "especially, in instruments that are stored dry"], "Restrictive 'that' clauses take no commas, and the adverb needs no comma after it."),
  ("[6]", "Humidity, rather than the repair itself, appears", "Humidity, rather than the repair itself, appears", ["Humidity rather than the repair itself appears", "Humidity, rather than the repair itself appears", "Humidity rather than the repair itself, appears"], "The parenthetical comparison takes commas on both sides; the singular subject 'Humidity' takes 'appears.'"),
  ("[7]", "lends every customer a small hygrometer, and", "lends every customer a small hygrometer, and", ["lends every customer a small hygrometer and,", "lends, every customer a small hygrometer, and", "lends every customer, a small hygrometer, and"], "The comma before 'and' joins the compound predicate cleanly; the other placements break the verb from its objects."),
  ("[8]", "asks them to keep the instrument", "asks them to keep the instrument", ["asks them to keep the instrument,", "asking them to keep the instrument", "asks them keeping the instrument"], "The second verb must parallel 'lends'; a comma or participle would break the compound predicate."),
  ("[9]", "Returns for repeat cracks have fallen, though", "Returns for repeat cracks have fallen, though", ["Returns for repeat cracks have fell, though", "Returns for repeat cracks has fallen, though", "Returns for repeat cracks have fallen though,"], "'Have fallen' is the correct perfect form for a plural subject; 'has' disagrees and 'have fell' misforms the participle."),
  ("[10]", "unusually stable.", "unusually stable.", ["unusually stable, ", "unusually stable;", "unusually stable:"], "The sentence's end takes a period; the trailing comma, semicolon, and colon all leave it incomplete."),
  ("[11]", "twice, once when the instrument arrives and once a year later,", "twice, once when the instrument arrives and once a year later,", ["twice once when the instrument arrives and once a year later", "twice; once when the instrument arrives and once a year later", "twice, once when the instrument arrives, and once a year later,"], "The paired 'once...and once' items are parenthetical and take one comma on each side."),
  ("[12]", "make the case that repairs fail for reasons a careful record can reveal.", "make the case that repairs fail for reasons a careful record can reveal.", ["make the case that repairs fail, for reasons a careful record can reveal.", "make the case that repairs fail for reasons, a careful record can reveal.", "make the case, that repairs fail for reasons a careful record can reveal."], "'Make the case that' takes an object clause with no internal punctuation."),
 ]),
]

def build_act_english():
    n = 1
    for pid, title, passage, qs in AE_PASSAGES:
        for marker, correct, wrongs, exp in qs:
            d = diff_for(n)
            act_english_one(pid, 100 + n, marker, correct, wrongs, exp, d, title, passage)
            n += 1

def act_english_one(pid, base, marker, correct, wrongs, exp, diff, title, passage):
    # the first choice list position holds the NO CHANGE option; rotation keeps A-D distribution even
    choices = [(correct, None)] + [(w, "This option changes the structure or usage in a way the sentence does not support.") for w in wrongs]
    q = f"“{title}” — consider the portion marked {marker}. Which choice completes the text so that it conforms to Standard English or the writer's goal?"
    add("act_english", "Production of Writing" if marker == "[12]" else "Conventions of Standard English",
        "Boundaries and usage" if marker != "[12]" else "Rhetorical purpose",
        diff, q, correct, [(w, r) for w, r in zip(wrongs, [""] * len(wrongs))] if False else [], exp,
        qid=qid(pid, base), banktag="english", test="act", section="english",
        kind="acteng", passage=passage, marker=marker,
        choices_override=None)

# NOTE: the helper above intentionally constructs the four ACT choices via add()
# with explicit wrong choices, so every ACT item has exactly four options with
# NO CHANGE as the unchanged option. Rebuilt cleanly below.
banks["act_english"] = []
def build_act_english():
    n = 1
    for pid, title, passage, qs in AE_PASSAGES:
        for marker, correct, original, wrongs, exp in qs:
            d = diff_for(n)
            variants = [w for w in dict.fromkeys(wrongs) if w != correct]
            for spare in ("No change is needed here.", "The sentence would need to be rewritten from scratch.",
                          "Punctuation should be removed entirely from this portion."):
                if len(variants) >= 3: break
                if spare != correct and spare not in variants: variants.append(spare)
            try:
                add("act_english", "Conventions of Standard English", "Boundaries, form, and usage",
                    d, f"“{title}” — the portion marked {marker} currently reads “{original}” Which choice completes the text so that it conforms to Standard English?",
                    correct, [(w, "This version introduces an error in punctuation, agreement, or idiom that the explanation names.") for w in variants[:3]],
                    exp, qid=qid(pid, 100 + n), banktag="english", test="act", section="english",
                    kind="acteng", passage=passage, marker=marker)
            except AssertionError as e:
                print("ae-skip", pid, marker, str(e)[:80])
            n += 1

# --------------------------------------------------------------------------
# ACT READING — four genres, long passages, ten questions each
# --------------------------------------------------------------------------
AR_PASSAGES = {
"ar1": ("literary narrative", """The summer my brother decided to rebuild the canoe, the garage became a hospital ward. He spread the canvas along the floor like a patient on a table, tracing the tears with a pencil before making a single cut. I was thirteen and useful mainly for holding things: clamps, tape, the flashlight when he worked past dusk. He was nineteen and had decided, without announcement, that the canoe our grandfather had left us would not die of neglect.\n\nThe canoe was cedar-strip, milky with age, and it had not touched water since before I was born. Our grandfather had paddled it along the river that ran behind his farm, a river my brother and I knew only as the highway bridge's shadow and the smell of mud at the town boat launch. In photographs, the canoe is always at the edge of the frame, patient, waiting for someone to notice it.\n\nWhat my brother lacked in skill he replaced with patience. He sanded until his knuckles bled, then bandaged them and sanded again. He consulted a neighbor, a retired carpenter named Delia, who drank her coffee standing up and said things like 'wood remembers water, so let it remember slowly.' He wrote her advice in a spiral notebook, one sentence per page, as if each were a medicine.\n\nI learned to hate and love the garage in the same hour. Hate, because summer was passing and everyone else was at the pool. Love, because my brother talked to me there in a way he never did at dinner. He told me about a girl who had broken his heart, about the job he was afraid he wouldn't get, about how our father's silences weren't, as I assumed, judgment, but a kind of respect for things left unsaid. He said it once and never repeated it, and I filed it away the way he filed Delia's advice.\n\nThe canoe launched in October, on the river behind the farm. It floated slightly low, and my brother grinned like a man who has passed an exam he expected to fail. He paddled a circle in the cove and came back, and we stood knee-deep in cold water, both pretending not to be cold. He never asked me to get in. I never asked to. It wasn't needed. The work had been the thing, and we both knew it, and the river took its new old passenger without comment, the way rivers do.""",
 [("The narrator's role in the project is best described as", "a participant who values the time spent with his brother more than the completed work.", ["a supervisor who directs the work with expertise he learned elsewhere.", "a passive observer who resents his brother for wasting the summer.", "the project's primary craftsman once the repairs begin."], "The narrator mostly holds tools but treasures the conversations; he is a participant whose real reward is the time with his brother."),
  ("The description of the garage as a 'hospital ward' serves mainly to", "convey how seriously the brother treated the canoe's restoration.", ["suggest that the narrator believed the canoe was cursed.", "show that the family could not afford proper tools.", "criticize the brother for working in an unsafe space."], "The metaphor frames the canoe as a patient and the brother as its devoted caretaker, emphasizing his seriousness."),
  ("The narrator mentions the canoe's role in photographs in order to", "suggest that the canoe has long been an unnoticed presence in the family.", ["prove that the grandfather paddled it every week.", "argue that photographs are more reliable than memory.", "show that the canoe was photographed only once."], "The canoe 'at the edge of the frame' parallels its being 'waiting' to be noticed, a family presence long in the background."),
  ("Delia's advice that 'wood remembers water' is best understood as", "an indirect way of advising patience during a slow craft.", ["a warning that the canoe will always leak.", "a claim that the river is dangerous to paddle.", "an instruction to soak each strip before sanding."], "The advice is metaphorical guidance about patience, consistent with how the brother files it like medicine."),
  ("One reason the narrator 'learned to hate and love the garage in the same hour' is that", "the garage was connected both to lost summer days and to new intimacy with his brother.", ["the garage was too hot to work in during the afternoons.", "his brother forced him to do tasks beyond his skill.", "he disliked Delia but appreciated her tools."], "The sentence links resentment of the time lost and appreciation of the conversations gained."),
  ("The brother's comment about their father's silences suggests that", "the father withheld obvious judgment, which the narrator had mistaken for disapproval.", ["the father had disapproved of the canoe project from the start.", "the father rarely spoke because of a hearing problem.", "the brother feared their father would sell the canoe."], "The brother's explanation reframes the silences as respect, correcting the narrator's earlier interpretation of judgment."),
  ("The phrase 'a man who has passed an exam he expected to fail' chiefly conveys", "relief and surprise at an outcome the brother had doubted.", ["pride in having defeated his competition at the launch.", "embarrassment at the canoe's low floating line.", "indifference to whether the canoe actually worked."], "The simile emphasizes the brother's surprised relief at success."),
  ("The narrator emphasizes that neither brother asked the other to get into the canoe mainly to", "show that the completed work, not paddling, was the point for both of them.", ["imply that the canoe was too dangerous to enter.", "reveal that the brother wanted to paddle alone.", "admit that the narrator did not trust the repairs."], "The last paragraph states that 'the work had been the thing,' which both understood without needing the ride."),
  ("The word 'patient' appears twice in the passage, applied to the canoe and to the brother. Together, the uses suggest", "both the canoe and the brother embody steady effort that outlasts long waiting.", ["the brother learned patience only from Delia's notebook.", "the canoe's endurance made the brother impatient at last.", "patience is possible only when working with cedar."], "The echo links the brother's patient labor to the canoe's long, undramatic presence."),
  ("The passage's final sentence ('the river took its new old passenger...') most nearly means", "the launch was quiet and unceremonious, consistent with the passage's tone.", ["the canoe sank immediately after launching.", "the paddle in the cove frightened the narrator.", "the river was too high for the launch to succeed."], "The conclusion closes the story without ceremony, matching the understated tone that runs through the passage.")]),
"ar2": ("social science", """For much of the twentieth century, urban planners designed streets around the assumption that traffic behaves like a fluid obeying simple laws: widen the pipe, and flow improves. This assumption produced wider arterials and longer blocks, but it also produced an unexpected result, documented again and again in cities from Los Angeles to Guangzhou. New capacity attracts new driving; trips that were suppressed by congestion are taken, and routes that were long detoured become direct. The phenomenon, sometimes called induced demand, means that a new lane often fills to the level of its predecessors within a few years.\n\nThe mechanism is not mysterious, economists argue, because road space is a priced good, though the price is paid in time rather than money. When a driver chooses a car trip, the private calculation counts fuel and parking but treats delay as the marginal cost. Widening a road lowers that cost temporarily, making previously unprofitable trips worthwhile. The added trips may be genuinely valuable, but the congestion returns, and the city has spent capital without changing the equilibrium.\n\nCritics of the induced-demand literature raise two objections. The first is measurement: counting additional trips on a widened road is difficult when the surrounding economy is growing, because some of the increase would have happened anyway. Studies address this with 'difference-in-differences' comparisons across corridors that received capacity and similar corridors that did not, but the method can still attribute growth to the wrong cause when corridors differ in unobserved ways.\n\nThe second objection is normative. Even if induced demand is real, critics say, the conclusion that cities should stop building is too strong. Road capacity may still be warranted if it serves trips with high social value, or if it is paired with pricing that transmits the true cost of congestion. Singapore, London, and Stockholm all impose fees to enter congested zones, and all three report reduced traffic inside the boundary, though each has had to adjust its scheme to respond to exemptions and boundary effects.\n\nA subtler line of research investigates what happens when capacity is removed rather than added. When highways are temporarily closed for maintenance, some travelers shift to transit, some combine trips, and some change destinations, and the predicted traffic apocalypse often fails to fully materialize. These 'disappearing traffic' episodes are not evidence that capacity does not matter; they are evidence that demand is more elastic than the simple fluid model predicts. The debate has thus moved from whether induced demand exists to how much of the growth it explains and what policy follows from it,""",
 [("The main purpose of the passage is to", "explain the induced-demand phenomenon and describe the scholarly debate surrounding it.", ["argue that urban highways inevitably improve traffic.", "compare the pricing schemes of three world cities in detail.", "prove that driving demand never responds to cost."], "The passage explains the phenomenon, its mechanism, and the objections, ending with the debate's evolution."),
  ("According to the passage, induced demand occurs because", "lowering the time cost of driving makes trips that were previously not worthwhile seem worth taking.", ["drivers prefer wider roads even when they are not faster.", "new roads are usually built in areas that are already growing.", "fuel becomes cheaper when highways expand."], "The economics paragraph states that reduced delay makes previously unprofitable trips worthwhile."),
  ("The 'difference-in-differences' method is presented as a response to which concern?", "That new trips may simply reflect economic growth rather than the added capacity.", ["That drivers cannot remember their old routes after construction.", "That corridor comparisons are impossible to conduct on highways.", "That induced demand was already proven to be false."], "The method compares corridors to isolate the effect of capacity from general economic growth."),
  ("The passage suggests that the metric central to the induced-demand mechanism is", "the value of delay as a cost folded into each driver's private calculation.", ["the total miles of new pavement laid in a corridor.", "the number of intersections removed by new design.", "the average age of vehicles using a widened road."], "Delay, not money, is identified as the marginal cost that drivers treat as the road's price."),
  ("Which statement best describes the author's attitude toward 'disappearing traffic' episodes?", "They show demand is more responsive than a simple fluid model predicts.", ["They prove that removed capacity was never necessary.", "They refute the concept of induced demand entirely.", "They argue that maintenance closures should be permanent."], "The text explicitly says the episodes are evidence of elasticity, not of capacity's irrelevance."),
  ("Singapore, London, and Stockholm are cited primarily to", "show that pricing congestion has reduced traffic even if schemes need adjustment.", ["demonstrate that induced demand does not occur outside Asia.", "argue that congestion fees should vary by vehicle size.", "prove that exempt vehicles never enter congested zones."], "The cities illustrate congestion pricing working while requiring adjustments to rules and boundaries."),
  ("The passage's reference to routes that 'become direct' after expansion indicates that", "some trips change from detours to shorter paths once the road improves.", ["every driver takes the same path regardless of the road.", "the added capacity shortens distances between destinations.", "long-detoured trips are impossible before expansion."], "The phrase describes trips that were longer detours now served directly, adding to traffic."),
  ("Based on the passage, which statement would the author most likely endorse?", "Capacity changes alter travel behavior, so the size of the behavioral response deserves careful measurement.", ["Traffic behaves exactly like water in a pipe, justifying wider arterials.", "The normative objection settles the scientific debate.", "Induced demand research should ignore economic growth."], "The conclusion frames the debate as moving to magnitudes and policy, matching careful measurement."),
  ("The second objection described in the passage is best summarized as", "even a real induced-demand effect does not by itself settle whether new roads are worthwhile.", ["induced demand has not been replicated in any city.", "corridors with new capacity never grow economically.", "pricing schemes have universally failed."], "The objection is normative: the reality of induced demand does not dictate the policy conclusion."),
  ("The final sentence's claim that the debate 'has moved' implies that", "scholars now focus more on quantification and policy design than on existence.", ["the scientific question of existence remains completely open.", "policy makers have abandoned the topic of congestion.", "the phenomenon has been proven to be a measurement error."], "The debate now concerns how much growth is explained and what policy follows.")]),
"ar3": ("humanities", """In 1937, a young painter named Ada Reyner submitted a canvas to a regional exhibition and then, six days before the deadline, wrote a letter to the committee asking to withdraw it. The letter survives in the exhibition archive, and so does the committee's reply: a single sentence refusing the request, on the grounds that 'the wall-plan is set and the public has been promised.' The painting was hung, reviewed, and forgotten. Reyner's career went elsewhere, into fabric design, where she spent four decades and never spoke publicly of the canvas.\n\nThe episode is a small window into a large question about how art worlds work: who decides what is seen, and how the machinery of exhibition shapes what later generations call the canon. The committee's refusal was procedural, even banal; nothing in the record suggests malice. Yet the letter's consequence was to lock Reyner into a single public appearance on that wall, an appearance whose reviews she never answered. Exhibition design, the archive shows, is never only aesthetic. A wall plan is also a verdict about whose work is finished and whose is provisional.\n\nHistorians of the period have reconstructed the wall itself. Photographs show Reyner's canvas, a landscape with an unusually high horizon, hung at the end of a sequence of six landscapes ordered by height of horizon line. Understood this way, the withdrawal request reads differently. The artist was not asking to be spared; she was asking to be situated somewhere else, and the wall-plan logic that refused her was the logic of a narrative she did not control. The committee saw sequence; Reyner saw what the sequence did to the last work.\n\nWhat makes the archive extraordinary is not the refusal itself, which was common, but the survival of the artist's letter alongside it. Most withdrawal requests from the period were discarded. This one was filed, perhaps because the committee required a paper trail for the wall plan, perhaps by accident. That accident gives scholars a rare documented case in which an artist's interiority survives the institution that overrode it.\n\nContemporary curators have begun re-staging small exhibitions that place such documents alongside reconstructed walls, making the selection machinery visible. The practice has critics: staging a refusal risks aestheticizing the slight, turning institutional power into an exhibit about institutional power. Defenders answer that the refusal was always part of the exhibit; the wall plan merely hid it. Reyner's canvas, they note, has not been found. Its absence has become, in these re-stagings, part of what the wall was holding.""",
 [("The letter's survival in the archive is significant because", "it allows scholars to document an artist's perspective that institutions usually erased.", ["it proves the committee acted with deliberate cruelty toward the artist.", "it demonstrates that withdrawal requests were frequently granted.", "it shows the exhibition was unusually well funded."], "The passage stresses the rarity of the artist's interiority surviving institutional records."),
  ("According to the passage, the committee's refusal was", "a procedural decision consistent with its plans, not evidence of hostility.", ["a rare act of censorship aimed at the artist's style.", "a response to a public petition against the painting.", "an attempt to hide the artist's work from reviewers."], "The text calls the refusal 'procedural, even banal' and notes nothing suggests malice."),
  ("The reconstructed wall matters because it", "reveals the narrative sequencing that likely prompted the artist's request.", ["shows that the artist's canvas was too large for the space.", "proves the committee hung the works chronologically.", "demonstrates that the review praised the artist."], "The wall-plan sequence of horizon lines reframes why Reyner asked to withdraw."),
  ("The phrase 'a wall plan is also a verdict' suggests that exhibition design", "makes judgments about the relative status and completeness of works.", ["determines an artwork's sale price.", "is decided primarily by gallery acoustics.", "settles legal questions of ownership."], "The metaphor frames hanging decisions as judgments about works' finished status and position."),
  ("The author notes that the request's filing may have been accidental in order to", "underscore how fragile the survival of the artist's voice was.", ["question whether the committee kept any records at all.", "show that archives are useless for historians.", "prove the artist later withdrew her paintings from view."], "The accidental filing highlights how easily this documented interiority could have been lost."),
  ("The passage suggests the artist's later career is relevant because", "her turn to fabric design contrasts with a single wall appearance she never answered.", ["fabric design was more lucrative than painting in the period.", "she resubmitted the canvas under a different name.", "reviewers of the exhibition later joined the committee."], "The contrast between decades of work and one locked appearance reinforces the episode's weight."),
  ("Critics of re-stagings that combine documents and walls worry mainly that", "the practice may convert institutional power itself into spectacle.", ["the original paintings cannot be displayed without damage.", "visitors will confuse documents with artworks.", "the committee's descendants may object legally."], "The objection described is that staging the slight aestheticizes it."),
  ("Defenders of the re-stagings argue that", "the selection process was always part of the exhibit, though previously hidden.", ["the wall plan should be recreated only in storage.", "reviewers should be excluded from the gallery.", "the artist intended the letter for publication."], "Defenders hold that the refusal was already part of the exhibition's content."),
  ("The absence of Reyner's canvas from the present is treated by the passage as", "part of what the original wall was holding and hiding.", ["proof that the painting never existed.", "a problem that invalidates the scholars' work.", "evidence that the committee destroyed it deliberately."], "The final line treats the absence as folded into the wall's meaning."),
  ("The passage's overall structure can best be described as", "an archival episode used to discuss how exhibitions shape artistic reputations.", ["a catalog of regional exhibitions across three decades.", "a biography of a committee chair's career.", "an argument against the use of photography in archives."], "The episode is the vehicle for a broader argument about selection and canon formation.")]),
"ar4": ("natural science", """Coastal mangroves are among the most productive ecosystems on Earth, and their value is easiest to see when they are missing. Where mangrove forests remain, their tangled roots slow water enough to drop sediment, building land in deltas that would otherwise erode. The roots also serve as nursery habitat for juvenile fish and shrimp, which shelter among them before moving to open water. During storms, mangrove belts absorb wave energy, and studies after major typhoons have found that villages behind intact mangrove belts suffered lower losses than similar villages behind cleared shorelines. Despite these services, mangrove loss has been substantial, driven by aquaculture ponds, charcoal harvesting, and coastal development.\n\nRestoring mangroves is harder than planting them. Early projects measured success in seedlings planted, and many failed within five years, because the sites chosen did not match the species planted to local hydrology and salinity. A seedling of one mangrove species may thrive at a creek mouth and die two hundred meters upland, drowned at high tide or stressed by salt. Later projects began with the water, mapping tidal range and salinity before choosing species, and their survival rates improved sharply. Restoration, in other words, is less like gardening than like matching the trees to the tide.\n\nThe science of measuring success has also changed. Ecologists now evaluate restored stands against reference forests using several indicators at once: canopy structure, root biomass, crab and mollusk diversity, and the forest's ability to accrete sediment. A stand may look healthy from satellite imagery while lacking the root architecture that makes shorelines durable; conversely, a scruffy plot of gray mangroves can function hydrologically long before it looks picturesque. Monitoring at a single point in time can mislead, so programs increasingly sample the same plots across a decade, tracking whether restored stands converge on reference conditions or level off short of them.\n\nThe economic case has proven easy to misstate. Valuing a mangrove belt only as storm insurance understates its daily contributions; valuing it only as nursery habitat ignores its role in sediment and carbon storage. Some estimates compare the earnings from shrimp ponds against the services lost when mangroves are cleared, and the pendulum in these studies has swung with assumptions about discount rates and storm frequency. The most durable conclusion in the literature is narrower and, for policy, more useful: intact mangrove belts provide compound benefits that cleared shorelines do not replace cheaply, and restoration succeeds when projects engineer for water first and trees second.""",
 [("The passage's central argument is that", "mangrove protection and restoration succeed when their hydrology is respected and their benefits are counted together.", ["mangroves cannot be restored once cleared.", "shrimp aquaculture never causes mangrove loss.", "satellite imagery is the best measure of restoration."], "The passage returns repeatedly to matching species to water and to compound benefits."),
  ("According to the passage, mangrove roots build land by", "slowing water so that sediment settles out.", ["trapping fish that later compact into soil.", "absorbing salt from seawater at high tide.", "pulling sand inland during storms."], "Roots slow flow and drop sediment, per the first paragraph."),
  ("The comparison of villages after typhoons is offered as", "evidence that intact mangrove belts reduce storm losses.", ["proof that storms avoid mangrove coasts.", "an argument for replacing villages entirely.", "a study of charcoal harvesting damage."], "The comparison illustrates the storm-protection service."),
  ("Early restoration failures are attributed by the passage to", "sites and species mismatched to local water conditions.", ["insufficient seedlings planted per hectare.", "the wrong decade selected for planting.", "competition from juvenile shrimp."], "The text says seedlings died because hydrology and salinity were not matched."),
  ("The statement that restoration is 'less like gardening than like matching the trees to the tide' mainly emphasizes", "the primacy of site hydrology in restoration success.", ["the speed with which mangroves grow.", "the necessity of greenhouse cultivation.", "the decorative role of healthy-looking canopies."], "The metaphor stresses aligning species with tidal conditions."),
  ("The passage warns that satellite imagery", "can show a stand as healthy while missing root structure that confers durability.", ["cannot detect mangrove forests at all.", "replaces the need for ecological sampling entirely.", "always overstates mangrove mortality."], "The caution is that looks deceive: root architecture matters and may be invisible from above."),
  ("Gray mangroves that look 'scruffy' are mentioned to illustrate that", "hydrological functioning can precede an aesthetic appearance.", ["gray species are invasive in restored sites.", "scruffy stands never recover their canopy.", "monitoring should be abandoned in favor of appearances."], "The example shows function arriving before looks, against appearance-based judgment."),
  ("The passage's discussion of valuing mangroves suggests that economic estimates", "depend heavily on assumptions, making single-number valuations fragile.", ["are useless and should be ignored by policy makers.", "are constant across studies and regions.", "always favor preserving shrimp ponds."], "The swing with discount rates and storm frequency shows estimate fragility."),
  ("The 'compound benefits' described in the final paragraph include", "sediment building, habitat, and storm protection acting together.", ["seedling counts, satellite imagery, and canopy color.", "aquaculture, charcoal, and coastal development.", "discount rates, storm frequency, and salinity."], "The listed benefits combine land building, nursery habitat, and storm buffering."),
  ("The author's tone toward mangrove restoration can best be described as", "cautiously optimistic, grounded in revised methods and long monitoring.", ["dismissive of any restoration attempts.", "certain that restoration cannot fail if funded.", "indifferent to the ecological questions involved."], "The passage reports improved methods and durable findings without overpromising.")]),
}

ACT_SC = [
 ("sci_trail", "A study measured how far a hiker traveled each hour on a steady incline.\nHour: 1 · 2 · 3 · 4\nDistance (km): 3.0 · 5.2 · 6.8 · 7.8", [("Which hourly interval shows the greatest gain in distance?", "Hour 1 to 2", ["Hour 2 to 3", "Hour 3 to 4", "All intervals are equal."], "The first interval adds 2.2 km; later intervals add 1.6 and 1.0, so the greatest gain is hour 1 to 2."),
   ("The decreasing gains suggest that", "the hiker's pace slowed over the measured hours.", ["the incline flattened each hour.", "the hiker stopped between hours 3 and 4.", "the measurement units changed mid-study."], "Successive gains (2.2, 1.6, 1.0) show a slowing pace."),
   ("If the pattern of decreasing gains continues, the most likely distance in hour 5 is", "8.4 km", ["9.0 km", "10.8 km", "7.8 km"], "Gains fall by about 0.6 each hour; a gain near 0.6 brings the total to about 8.4 km."),
   ("Which statement is best supported by the data?", "Distance increases every hour, but at a decreasing rate.", ["Distance decreases after hour 2.", "The hiker travels at constant speed.", "Distance doubles between hours 1 and 4."], "Totals rise each hour while the hourly increase shrinks.")]),
 ("sci_cool", "Two containers of water were left to cool. Container A was insulated; Container B was not.\nTime (min): 0 · 10 · 20 · 30\nA (°C): 90 · 76 · 67 · 61\nB (°C): 90 · 62 · 47 · 39", [("At 20 minutes, which container is warmer, and by how much?", "A, by 20 °C", ["B, by 20 °C", "A, by 10 °C", "Neither; they are equal."], "At 20 minutes A reads 67 and B reads 47; 67 − 47 = 20."),
   ("The data best support which conclusion?", "Insulation slows the rate of cooling.", ["Insulation prevents cooling entirely.", "Both containers cool at equal rates.", "Container B warms after 20 minutes."], "A drops more slowly at every interval than B."),
   ("The greatest difference between the containers first appears at", "the 10-minute reading", ["the 0-minute reading", "the 20-minute reading", "the 30-minute reading"], "At 10 minutes the gap is 14; by 20 and 30 the gap grows, but the first measurable difference appears at 10 minutes."),
   ("If both containers continue cooling at their 20–30 minute rates, at 40 minutes the gap between them will most likely", "increase beyond 22 °C", ["shrink to zero", "stay exactly 22 °C", "reverse direction"], "Diminishing but unequal rates keep widening the gap; A cools slower, so the difference grows.")]),
 ("sci_bean", "Students grew bean plants under four light colors, keeping water and temperature constant.\nColor: red · blue · green · white\nHeight (cm): 12 · 15 · 6 · 18", [("Which variable did the students deliberately change?", "Light color", ["Water volume", "Temperature", "Plant height"], "Color is the manipulated variable; water and temperature were held constant."),
   ("The greatest growth occurred under", "white light", ["red light", "blue light", "green light"], "White shows 18 cm, the largest of the four."),
   ("Why is green light's 6 cm result notable?", "It is the lowest result despite equal water and temperature.", ["It shows plants grow best in green light.", "It proves light color does not matter.", "It suggests the plants were overwatered."], "With other factors constant, the low value points to color as the operative difference."),
   ("A student claims plants need exactly 15 cm to flower. Do these data support the claim?", "No; the data measure height under light colors, not flowering.", ["Yes; blue light produced exactly 15 cm.", "Yes; flowering correlates with height.", "No; flowering was too high to measure."], "The study measured height by light color and says nothing about flowering.")]),
 ("sci_river", "A river's sediment load was sampled above and below a dam.\nSite: Above dam · Below dam\nSediment (mg/L): 240 · 60\nFlow (m³/s): 55 · 48", [("The dam's most obvious effect in the data is on", "sediment concentration", ["flow rate", "water temperature", "site location"], "Sediment falls from 240 to 60; flow changes only slightly."),
   ("The small change in flow suggests that", "the dam passes most of the water even as it traps sediment.", ["the dam is closed to all water.", "flow is unrelated to sediment.", "the below-dam site is dry."], "Only a 7 m³/s difference appears while sediment drops sharply."),
   ("If sediment supports downstream sandbars, the data predict", "sandbars below the dam will erode over time.", ["sandbars below the dam will grow quickly.", "no change to downstream sandbars.", "upstream sandbars will vanish first."], "Less sediment delivered downstream implies bar building slows and erosion can win."),
   ("Which additional measurement would best test whether the dam caused the difference?", "Sediment sampling below the dam before its construction", ["Water color at the upstream site", "Air temperature near the dam", "Flow speed measured twice the same day"], "The before-construction comparison isolates the dam's effect from preexisting conditions.")]),
 ("sci_rust", "An experiment tested rust formation on iron nails under three conditions.\nCondition: dry air · humid air · humid air + salt\nRust after 3 days (mg): 0 · 12 · 41", [("Which condition best supports the claim that humidity is necessary for rusting?", "Dry air produced no rust.", ["Salt water produced the most rust.", "All conditions produced some rust.", "The nails were identical in size."], "Zero rust in dry air shows humidity's necessity before salt's acceleration."),
   ("Adding salt to humid air", "increased rust more than humidity alone.", ["prevented rust from forming.", "had no measurable effect.", "reduced rust compared with dry air."], "Humid air yields 12 mg; with salt, 41 mg."),
   ("The experiment keeps which factor constant?", "The type of nail", ["The humidity level", "The salt presence", "The rust mass"], "The nails are the same object in all three conditions; humidity and salt vary."),
   ("A student concludes salt causes rust even in dry air. Which result would test that claim?", "Rust mass for salted nails in dry air after 3 days", ["Rust mass for humid air without salt", "Air temperature on day 3", "The nails' initial shine"], "The missing cell of the design is salt + dry air; without it the claim is untested.")]),
 ("sci_wind", "Two scientists debate why a lake's water level drops in summer.\nScientist 1: Evaporation dominates; inflow is steady all year.\nScientist 2: A nearby city's summer withdrawals reduce inflow.", [("The disagreement centers on", "what causes the summer decline in water level.", ["whether the lake exists year round.", "whether water levels can be measured.", "which season is hottest at the lake."], "The scientists offer competing causes for the same observed decline."),
   ("Which measurement would most directly test Scientist 1's claim?", "Pan evaporation rates at the lake in summer", ["The lake's shoreline length", "The city's population", "Water color in winter"], "Evaporation rate data bear directly on the evaporation mechanism."),
   ("Which observation would most support Scientist 2?", "Inflow tapes show sharp summer declines at the city's diversion.", ["Air temperatures peak in July.", "The lake freezes in winter.", "The lake has a rocky bottom."], "Direct evidence of reduced inflow from city withdrawals supports the withdrawal explanation."),
   ("If both mechanisms operate, the scientists' disagreement would be best resolved by", "estimating the size of each effect rather than choosing one.", ["declaring the debate unresolvable.", "measuring the lake only in winter.", "rejecting measurements entirely."], "Quantifying each contribution resolves competing partial explanations.")]),
]

ACT_SC += [
 ("sci_salt", "A student tested how salt concentration affects the density of water at 20 °C.\nSalt (%): 0 \u00b7 5 \u00b7 10 \u00b7 15\nDensity (g/mL): 0.998 \u00b7 1.034 \u00b7 1.071 \u00b7 1.109", [("What is the density at 10% salt?", "1.071 g/mL", ["1.034 g/mL", "1.109 g/mL", "0.998 g/mL"], "Reading the table at 10% gives 1.071 g/mL."),
  ("If the pattern continues, the density at 20% is most likely", "about 1.147 g/mL", ["about 0.998 g/mL", "exactly 1.109 g/mL", "about 1.07 g/mL"], "Density rises about 0.037 per 5% step; adding one more step to 1.109 gives about 1.147."),
  ("Which is the independent variable?", "Salt concentration", ["Density of the solution", "Water temperature", "Volume of the container"], "The manipulated variable is salt percentage; temperature was held at 20 °C."),
  ("The results best support which statement?", "Density increases as salt concentration increases.", ["Density is unrelated to salt.", "Density falls as salt rises.", "Density peaks at 5% salt."], "Every 5% step raises density in the table.")]),
 ("sci_plant", "Researchers grew a plant species at four temperatures and counted leaves after 20 days.\nTemperature (\u00b0C): 15 \u00b7 20 \u00b7 25 \u00b7 30\nLeaves: 4 \u00b7 7 \u00b7 9 \u00b7 6", [("At which temperature did the plant produce the most leaves?", "25 \u00b0C", ["15 \u00b0C", "20 \u00b0C", "30 \u00b0C"], "The 25 \u00b0C row shows 9 leaves, the largest count."),
  ("A researcher claims that warmer is always better for this plant. Which value contradicts that claim?", "The 30 \u00b0C result of 6 leaves", ["The 20 \u00b0C result of 7 leaves", "The 15 \u00b0C result of 4 leaves", "The 25 \u00b0C result of 9 leaves"], "Growth falls from 25 to 30 \u00b0C, contradicting a monotonic warming benefit."),
  ("The data were most likely collected to test", "how temperature affects leaf production.", ["how leaves affect temperature.", "whether plants need water.", "how soil type changes leaf color."], "Temperature is varied and leaf count measured, matching that hypothesis."),
  ("What measurement would strengthen the study?", "Repeating the four temperatures with a second batch of seeds", ["Photographing one leaf", "Measuring the container height", "Changing the water source only at 15 \u00b0C"], "Replication across batches guards against chance differences.")]),
 ("sci_gear", "A bicycle's gear ratio was tested on a flat road.\nFront:Rear ratio: 2.0 \u00b7 2.5 \u00b7 3.0 \u00b7 3.5\nSpeed at same pedaling (km/h): 16 \u00b7 20 \u00b7 24 \u00b7 28", [("What happens to speed as the ratio increases?", "Speed rises steadily by 4 km/h per 0.5 ratio step.", ["Speed falls as the ratio rises.", "Speed doubles at the last step.", "Speed is constant."], "Each 0.5 step adds 4 km/h from 16 to 28."),
  ("The relationship shown is", "linear and positive.", ["inverse.", "nonlinear.", "constant."], "Equal ratio steps produce equal speed gains."),
  ("At the same pedaling rate, a ratio of 4.0 would most likely give", "about 32 km/h", ["about 24 km/h", "about 20 km/h", "about 40 km/h"], "Extending the 4 km/h per step pattern adds 4 to 28."),
  ("Which factor was held constant?", "Pedaling rate", ["Gear ratio", "Road speed", "Bicycle weight"], "Speed varied with ratio at the same pedaling rate stated in the study.")]),
 ("sci_pond", "A pond's oxygen level was logged across a day.\nTime: 6:00 \u00b7 12:00 \u00b7 18:00 \u00b7 24:00\nOxygen (mg/L): 4 \u00b7 9 \u00b7 7 \u00b7 3", [("Oxygen peaks at which time?", "12:00", ["6:00", "18:00", "24:00"], "The maximum recorded value (9 mg/L) is at noon."),
  ("The most likely explanation for the daily pattern is", "photosynthesis adding oxygen during daylight.", ["fish consuming oxygen only at night.", "rainfall adding oxygen at noon.", "oxygen being created at midnight."], "Daylight production raises oxygen to a midday peak."),
  ("The lowest oxygen value occurs at", "24:00", ["6:00", "12:00", "18:00"], "The table's minimum is 3 mg/L at midnight."),
  ("If measurements continued at 6:00 the next day, oxygen would most likely be", "rising toward the midday peak", ["at its lowest point of the week", "unchanged from midnight", "higher than noon"], "The cycle pattern suggests recovery in morning light.")]),
 ("sci_concrete", "A lab tested concrete blocks cured for different times.\nCure (days): 3 \u00b7 7 \u00b7 14 \u00b7 28\nStrength (MPa): 18 \u00b7 24 \u00b7 31 \u00b7 35", [("The largest gain in strength occurs between", "day 3 and day 7", ["day 14 and day 28", "day 7 and day 14", "all intervals are equal"], "The 3-to-7 interval adds 6 MPa, more than the 7 and 4 gains that follow."),
  ("Doubling cure time from 7 to 14 days increases strength by", "7 MPa", ["6 MPa", "4 MPa", "10 MPa"], "31 \u2212 24 = 7."),
  ("The pattern suggests that additional curing", "keeps helping, but with diminishing returns.", ["harms the concrete after 7 days.", "has no further effect after 3 days.", "doubles strength every week."], "Gains shrink (6, 7, 4) as cure time grows, indicating diminishing returns."),
  ("To compare two suppliers, the fairest test would", "cure one block from each supplier for the same number of days.", ["cure supplier A for 3 days and B for 28 days.", "measure strength before curing.", "weigh the blocks only."], "Equal cure times let strength differences reflect the mix, not the schedule.")]),
 ("sci_light", "A photometer measured light passing through tinted filters.\nFilter: clear \u00b7 light gray \u00b7 dark gray\nTransmission (%): 92 \u00b7 48 \u00b7 11", [("Which filter blocked the most light?", "Dark gray", ["Clear", "Light gray", "All blocked equally"], "Dark gray transmits only 11%, the least."),
  ("Transmission through the light gray filter is roughly", "half that of clear.", ["a quarter that of clear.", "equal to dark gray.", "twice that of clear."], "48% is about half of 92%."),
  ("If filters are stacked, the most reasonable prediction for clear + light gray is", "under 48%", ["exactly 140%", "over 92%", "unchanged at 92%"], "Stacking can only reduce transmission; the combined result cannot reach either single-filter maximum."),
  ("The independent variable in the test is", "the type of filter", ["the light source", "the photometer brand", "the percentage of transmission"], "Filter type is what the experiment varied.")]),
 ("sci_birds", "Two bird species were counted along transects at three elevations.\nElevation (m): 100 \u00b7 500 \u00b7 900\nSpecies A: 24 \u00b7 15 \u00b7 6\nSpecies B: 5 \u00b7 14 \u00b7 22", [("Which species is more common at 900 m?", "Species B", ["Species A", "They are equal.", "Neither appears."], "At 900 m, B counts 22 versus A's 6."),
  ("The data suggest that the two species", "prefer different elevations.", ["compete equally at every elevation.", "are identical in habitat use.", "both peak at 100 m."], "A declines with elevation while B rises, showing distinct preferences."),
  ("Species A's counts across the transect are", "decreasing", ["increasing", "constant", "unrelated to elevation"], "24, 15, 6 fall as elevation rises."),
  ("If the trend continues, at 1300 m Species A would most likely number", "fewer than 6", ["about 15", "about 12", "more than 24"], "The declining trend points below 6 at higher elevation.")]),
 ("sci_voltage", "Voltage across a resistor was varied and current measured.\nVoltage (V): 2 \u00b7 4 \u00b7 6 \u00b7 8\nCurrent (mA): 8 \u00b7 16 \u00b7 24 \u00b7 32", [("Current and voltage are related such that", "current doubles when voltage doubles.", ["current falls as voltage rises.", "current is independent of voltage.", "current quadruples when voltage doubles."], "2 to 4 V takes 8 to 16 mA, matching a proportional increase."),
  ("At 10 V the current would most likely be", "40 mA", ["36 mA", "32 mA", "48 mA"], "The rate is 4 mA per volt; 10 V \u00d7 4 = 40 mA."),
  ("The slope of current versus voltage in these units is", "4 mA per volt", ["2 mA per volt", "8 mA per volt", "0.25 mA per volt"], "32 \u2212 8 over 8 \u2212 2 volts gives 24/6 = 4 mA per volt."),
  ("A student claims resistance was constant. The data", "support that claim, since current is proportional to voltage.", ["refute it, since current varies.", "refute it, since voltage varies.", "cannot address resistance."], "Constant slope implies a constant resistance under Ohm's law.")]),
 ("sci_enzyme", "An enzyme assay measured reaction rate at different temperatures.\nTemp (\u00b0C): 10 \u00b7 25 \u00b7 37 \u00b7 50\nRate (units/min): 12 \u00b7 28 \u00b7 41 \u00b7 9", [("The enzyme works fastest at", "37 \u00b0C", ["10 \u00b0C", "25 \u00b0C", "50 \u00b0C"], "The maximum rate (41 units/min) is at 37 \u00b0C."),
  ("The drop from 37 to 50 \u00b0C most likely reflects", "denaturation of the enzyme at high temperature.", ["slower molecular motion.", "an error in the timer.", "reduced substrate at low temperature."], "Enzyme activity collapsing above an optimum indicates denaturation."),
  ("Between 10 and 25 \u00b0C the rate roughly", "more than doubles", ["stays the same", "falls by half", "reverses direction"], "12 to 28 units/min is a gain of more than 2\u00d7."),
  ("Which result would most strengthen the conclusion that 37 \u00b0C is optimal?", "Testing 33 and 40 \u00b0C and finding lower rates", ["Testing only 10 \u00b0C again", "Testing a different enzyme", "Testing with no substrate"], "Sampling near the suspected optimum tests whether 37 is a true peak.")]),
 ("sci_dial", "A factory sampled dials from two machines for accuracy error.\nMachine: A \u00b7 B\nTrial 1 error: 0.4 \u00b7 0.2\nTrial 2 error: 0.5 \u00b7 0.2\nTrial 3 error: 0.4 \u00b7 0.1", [("Which machine shows tighter consistency?", "Machine B", ["Machine A", "Both are identical", "Neither can be compared"], "B's errors cluster near 0.1\u20130.2 while A's cluster near 0.4\u20130.5."),
  ("The best single number comparing the machines is", "the difference in their average errors", ["the color of the dials", "the trial order", "the factory's location"], "Averages summarize each machine's accuracy across trials."),
  ("If Machine A were recalibrated to B's average, its errors would", "decrease by roughly 0.3", ["increase by 0.3", "stay exactly the same", "become negative"], "A averages about 0.433 and B about 0.167; the gap is roughly 0.27\u20130.3."),
  ("These data support the claim that", "Machine B is the more accurate of the two.", ["Machine A outperforms B.", "both machines exceed 0.4 error.", "error grows with each trial."], "Lower error across all trials favors Machine B.")]),
]

def build_act_reading():
    n = 1
    for pid, (genre, passage, questions) in AR_PASSAGES.items():
        for i, (q, correct, wrongs, exp) in enumerate(questions):
            add("act_reading", genre.title(), "Reading comprehension", diff_for(n), q, correct,
                [(w, "This choice distorts or contradicts the passage; the correct answer is anchored in the text.") for w in wrongs],
                exp, qid=qid(pid, 100 + i + 1), banktag="reading", test="act",
                section="reading", kind="actread", passage=passage, genre=genre)
            n += 1

def build_act_science():
    n = 1
    for sid, stem, qs in ACT_SC:
        for q, correct, wrongs, exp in qs:
            add("act_science", "Data Representation", "Interpreting data and experiments", diff_for(n),
                stem + "\n\n" + q, correct,
                [(w, "This option misreads the recorded values or the experimental setup.") for w in wrongs],
                exp, qid=qid("s3", 300 + n * 3), banktag="science", test="act", section="science")
            n += 1


# --------------------------------------------------------------------------
# Writer: dedupe against everything already in app.js, append one marked block
# --------------------------------------------------------------------------
def existing_texts():
    src = open("app.js", encoding="utf8").read()
    # Exclude the block about to be replaced so regeneration never dedupes
    # against its own previous output.
    a = src.find("/*__QB2_START__*/")
    b = src.find("/*__QB2_END__*/")
    if a >= 0 and b > a:
        src = src[:a] + src[b + len("/*__QB2_END__*/"):]
    texts = set()
    seen = set()
    for m in __import__("re").finditer(r'"q":\s*("(?:[^"\\]|\\.)*")', src):
        try:
            seen.add(" ".join(json.loads(m.group(1)).split()))
        except Exception:
            pass
    for m in __import__("re").finditer(r'q:\s*("(?:[^"\\]|\\.)*")', src):
        try:
            seen.add(" ".join(json.loads(m.group(1)).split()))
        except Exception:
            pass
    # compose q||passage||kind keys from the same source so matching is exact
    out = set()
    for m in __import__("re").finditer(r'\{[^{}]*?"q":\s*"((?:[^"\\]|\\.)*)"[^{}]*?\}', src):
        try:
            obj = json.loads(m.group(0))
        except Exception:
            try:
                obj = json.loads("{" + m.group(0).strip("{}") + "}")
            except Exception:
                obj = None
        if isinstance(obj, dict) and obj.get("q"):
            out.add(" ".join(obj["q"].split()) + " || " + " ".join((obj.get("passage") or "").split()) + " || " + (obj.get("kind") or ""))
    out |= seen  # bare-stem legacy keys still block exact stem repeats in unmatched items
    return out

def main(dump_path=None):
    for fn in (build_sat_math, build_sat_rw, build_rw_conventions, build_rw_synthesis,
               build_rw_quant, build_act_math, build_act_english, build_act_reading, build_act_science):
        try:
            fn()
        except Exception as e:
            print(f"builder {fn.__name__} stopped: {str(e)[:200]}")
    seen = existing_texts()
    deduped = {}
    dropped = 0
    for bank, items in banks.items():
        keep = []
        for item in items:
            norm = " ".join(item["q"].split())
            passage = " ".join((item.get("passage") or "").split())
            key = norm + " || " + passage + " || " + (item.get("kind") or "")
            if key in seen:
                dropped += 1
                continue
            seen.add(key)
            keep.append(item)
        deduped[bank] = keep

    emit = []
    emit.append("/*__QB2_START__*/")
    emit.append("// Round-2 modeled practice bank (Oct 2026). SAT and ACT pools are separate:")
    emit.append("// ACT English/Math/Reading never serve SAT items and vice versa.")
    names = {"sat_math": "SAT_MATH_R2", "sat_rw": "SAT_RW_R2", "act_math": "ACT_MATH",
             "act_english": "ACT_ENGLISH", "act_reading": "ACT_READING", "act_science": "ACT_SCIENCE_R2"}
    for bank in ["act_math", "act_english", "act_reading"]:
        emit.append(f"const {names[bank]} = [")
        emit.append(",\n".join(json.dumps(q, ensure_ascii=False) for q in deduped[bank]))
        emit.append("];")
    for bank in ["sat_math", "sat_rw", "act_science"]:
        emit.append(f"const {names[bank]} = [")
        emit.append(",\n".join(json.dumps(q, ensure_ascii=False) for q in deduped[bank]))
        emit.append("];")
    emit.append("BANK.math.push(...SAT_MATH_R2);")
    emit.append("BANK.rw.push(...SAT_RW_R2);")
    emit.append("if (typeof ACT_SCIENCE !== \'undefined\') ACT_SCIENCE.push(...ACT_SCIENCE_R2);")
    emit.append("/*__QB2_END__*/")
    block = "\n".join(emit) + "\n"

    src = open("app.js", encoding="utf8").read()
    if "/*__QB2_START__*/" in src:
        a = src.index("/*__QB2_START__*/")
        b = src.index("/*__QB2_END__*/", a) + len("/*__QB2_END__*/")
        src = src[:a] + block + src[b:]
    else:
        anchor = src.index("/*__DATA_END__*/")
        eol = src.index("\n", anchor) + 1
        src = src[:eol] + block + src[eol:]
    open("app.js", "w", encoding="utf8").write(src)

    counts = {k: len(v) for k, v in deduped.items()}
    counts["dropped_duplicates"] = dropped
    counts["total_new"] = sum(len(v) for v in deduped.values())
    json.dump(counts, open("/tmp/qb2-counts.json", "w"), indent=1)
    print(json.dumps(counts))

if __name__ == "__main__":
    import sys
    dump = None
    if "--dump" in sys.argv:
        dump = sys.argv[sys.argv.index("--dump") + 1]
    if dump:
        # build + dump review input without touching app.js
        for fn in (build_sat_math, build_sat_rw, build_rw_conventions, build_rw_synthesis,
                   build_rw_quant, build_act_math, build_act_english, build_act_reading, build_act_science):
            try:
                fn()
            except Exception as e:
                print(f"builder {fn.__name__} stopped: {str(e)[:200]}")
        json.dump(banks, open(dump, "w"), ensure_ascii=False)
        print("dumped", {k: len(v) for k, v in banks.items()})
    else:
        main()
