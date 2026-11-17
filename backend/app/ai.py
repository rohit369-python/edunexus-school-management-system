"""Study help. Prompts may name only the one learner being helped."""

from __future__ import annotations

from typing import Protocol


class EducationProvider(Protocol):
    def study_help(self, *, topic: str, grade_level: int, learner_first_name: str) -> str: ...


_BANK: dict[str, dict[str, str]] = {
    "fractions": {
        "junior": "A fraction is a fair share of one whole. One half is written 1/2: one piece out of two equal pieces.",
        "middle": "Simplify a fraction by dividing the top and bottom by the same number. 6/8 becomes 3/4. To add, use a common denominator first.",
        "senior": "For rational expressions, factor first and state values that make a denominator zero. Dividing fractions means multiplying by the reciprocal.",
    },
    "percentage": {
        "junior": "Percent means out of 100. 50% of a chocolate bar is half of it.",
        "middle": "To find x% of a number, compute number × x / 100. A rise from 40 to 50 is a 25% increase.",
        "senior": "Percentage change is (new - old) / old × 100. Keep the base explicit when you compare successive changes.",
    },
    "integers": {
        "junior": "Integers are whole steps on a number line, including numbers below zero. Adding a negative number moves left.",
        "middle": "Subtracting a negative is the same as adding. The product of two negatives is positive.",
        "senior": "Use integers as the starting point for modular arithmetic: a ≡ b (mod n) when n divides a - b.",
    },
    "algebra": {
        "junior": "A letter can stand for a number you do not know yet. If n + 2 = 5, then n is 3.",
        "middle": "Keep equations balanced. Whatever you do to one side, do to the other. Combine like terms before you divide.",
        "senior": "For quadratics, try factoring, then the quadratic formula. Check the discriminant before you claim real roots.",
    },
    "linear equations": {
        "junior": "A number machine that always adds the same amount can be written as a simple equation.",
        "middle": "y = mx + c is a straight line. m is how steep it is and c is where it crosses the y-axis.",
        "senior": "Two linear equations meet at one point when their slopes differ. Use substitution or elimination, then check both equations.",
    },
    "photosynthesis": {
        "junior": "Plants make food using sunlight, water, and air. Leaves are the kitchen. The green colour helps them catch light.",
        "middle": "Photosynthesis: carbon dioxide + water → glucose + oxygen, using light energy in chloroplasts. It is not the same as respiration.",
        "senior": "Light reactions store energy in ATP and NADPH in the thylakoid membrane. The Calvin cycle fixes carbon in the stroma. Limiting factors include light, CO2, and temperature.",
    },
    "cell": {
        "junior": "Living things are made of cells. A plant cell has a wall and a green part that catches light. An animal cell does not.",
        "middle": "Nucleus, cytoplasm, and cell membrane are shared. Plants add a cell wall, chloroplasts, and a large vacuole.",
        "senior": "Distinguish prokaryotic and eukaryotic organisation. Trace one protein from transcription through rough ER and Golgi to secretion.",
    },
    "gravity": {
        "junior": "Gravity pulls things toward the Earth, which is why a ball comes back down.",
        "middle": "Weight is the pull of gravity on a mass. Near Earth, weight in newtons is about mass × 10.",
        "senior": "Newton's law of gravitation is F = Gm1m2/r^2. Distinguish mass from weight, and sketch how g changes with distance from the planet.",
    },
    "trigonometry": {
        "junior": "A right-angled triangle has one square corner. The longest side is opposite that corner's partner, the hypotenuse, in later classes.",
        "middle": "In a right triangle, sin is opposite/hypotenuse, cos is adjacent/hypotenuse, tan is opposite/adjacent.",
        "senior": "Use identities such as sin^2 + cos^2 = 1 and the sine rule a/sin A = 2R when the triangle is not right-angled.",
    },
    "grammar": {
        "junior": "A sentence starts with a capital letter and ends with a full stop. A noun names something. A verb is a doing word.",
        "middle": "Match the verb to the subject. Keep tense steady inside a paragraph unless the time really changes.",
        "senior": "Vary clause structure for emphasis, but do not hide the main verb. Read the sentence aloud to catch agreement errors.",
    },
    "water cycle": {
        "junior": "Water goes up as invisible vapour, makes clouds, and comes back as rain.",
        "middle": "Evaporation, condensation, precipitation, and collection move water. The Sun supplies the energy.",
        "senior": "Add transpiration from leaves and groundwater flow. Discuss how temperature shifts change evaporation rates.",
    },
    "democracy": {
        "junior": "In a class vote, every person gets one vote and the group follows the choice.",
        "middle": "A democracy gives adults a vote, follows a constitution, and expects leaders to answer to the people.",
        "senior": "Compare representation, separation of powers, and fundamental rights. Use the constitution, not slogans, as the source.",
    },
}


def _band(grade_level: int) -> str:
    if grade_level <= 5:
        return "junior"
    if grade_level <= 8:
        return "middle"
    return "senior"


class MockEducationProvider:
    """Local topic bank. No network calls and no second learner in the text."""

    def study_help(self, *, topic: str, grade_level: int, learner_first_name: str) -> str:
        grade = max(1, min(int(grade_level), 12))
        band = _band(grade)
        haystack = topic.lower()
        chosen = None
        for key in sorted(_BANK, key=len, reverse=True):
            if key in haystack:
                chosen = key
                break
        name = (learner_first_name or "there").strip().split()[0]
        if chosen is None:
            if grade <= 5:
                body = (
                    "Try a short example with numbers or a picture, say the idea in one sentence, "
                    "then do three practice questions."
                )
            elif grade <= 8:
                body = (
                    "Write the definition, one worked example, and one question you still find tricky. "
                    "Check the textbook wording before you memorise a shortcut."
                )
            else:
                body = (
                    "State the principle, the conditions where it applies, and a counter-example. "
                    "Show units and a quick reasonableness check."
                )
            return f"{name}, here is a grade {grade} way to study that. {body}"
        text = _BANK[chosen][band]
        return f"{name}, grade {grade}: {text}"
