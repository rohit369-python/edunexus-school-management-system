export interface AssistantReply {
  text: string;
  refused: boolean;
}

const TOPICS: { keys: string[]; title: string; body: string; practice: string }[] = [
  {
    keys: ["fraction", "fractions"],
    title: "Fractions",
    body: "A fraction is a part of a whole. The top number (numerator) counts the parts you have. The bottom number (denominator) counts equal parts in the whole. 1/2 and 2/4 name the same amount because 2/4 simplifies by dividing both numbers by 2. To add fractions, use a common denominator first.",
    practice: "Practice: 1) Shade 3/8 of a bar. 2) Which is larger, 2/3 or 3/5? 3) Add 1/4 + 1/6.",
  },
  {
    keys: ["linear", "equation", "algebra"],
    title: "Linear equations",
    body: "A linear equation balances two sides. To solve 2x + 3 = 11, subtract 3 from both sides (2x = 8), then divide by 2 (x = 4). Check by putting the value back: 2×4 + 3 = 11. Whatever you do to one side, do to the other.",
    practice: "Practice: Solve 3x − 5 = 16, and  x/2 + 4 = 9. Show each step.",
  },
  {
    keys: ["photosynthesis", "plant", "chlorophyll"],
    title: "Photosynthesis",
    body: "Photosynthesis is how green plants make food. Chlorophyll in leaves captures light. Plants use carbon dioxide and water to make glucose and release oxygen. A useful word equation: carbon dioxide + water —(light / chlorophyll)→ glucose + oxygen. Plants still respire; photosynthesis is not the same as breathing.",
    practice: "Practice: Name the gas a leaf takes in, the gas it gives out in light, and one reason a plant kept in a dark cupboard stops making food.",
  },
  {
    keys: ["newton", "force", "motion"],
    title: "Newton's laws, simply",
    body: "First law: an object keeps still, or keeps moving in a straight line at a steady speed, unless a force changes that. Second law: a bigger force gives a bigger acceleration; a heavier object needs more force for the same acceleration (F = ma). Third law: forces come in pairs — if you push a wall, the wall pushes back.",
    practice: "Practice: A football slows on grass. Which law explains the slowdown, and what force is acting?",
  },
  {
    keys: ["tense", "grammar", "verb"],
    title: "Verb tenses",
    body: "Tense tells us when an action happens. Present simple is for habits (She walks to school). Past simple is for a finished time (She walked yesterday). Present continuous is for something happening now (She is walking). Keep the time word and the verb form matched.",
    practice: "Practice: Rewrite “I go to the library yesterday” so the tense matches the time word.",
  },
  {
    keys: ["revision", "plan", "study"],
    title: "A short revision plan",
    body: "Pick two subjects. For each, list three topics you lost marks on — not a judgement of ability, just the paper. Spend 25 minutes on one topic, then 5 minutes writing three questions you can now answer. Stop while the last topic is still clear. Repeat on another day rather than cramming once.",
    practice: "Write tomorrow's plan for one subject: topic, 25-minute task, and how you will check yourself.",
  },
  {
    keys: ["water cycle", "evaporation"],
    title: "Water cycle",
    body: "The Sun warms water and it evaporates. Water vapour cools, condenses into droplets, and forms clouds. When droplets grow heavy they fall as rain or other precipitation. Water then collects in rivers, lakes, and the ground, and the cycle continues. It is a cycle, not a one-way trip.",
    practice: "Draw the cycle with four labels: evaporation, condensation, precipitation, collection.",
  },
];

function quiz(subject: string): string {
  const bank: Record<string, string[]> = {
    mathematics: [
      "1. A rectangle is 8 cm by 3 cm. What is its area?",
      "2. Solve 5x = 20.",
      "3. What is 15% of 200?",
      "4. A triangle has angles 50° and 60°. What is the third angle?",
      "5. Round 4.76 to one decimal place.",
    ],
    science: [
      "1. Name the organelle that holds chlorophyll.",
      "2. What does a thermometer measure?",
      "3. Give one difference between a solid and a gas.",
      "4. Why does ice float on water?",
      "5. What gas do animals mainly breathe in?",
    ],
    english: [
      "1. Identify the noun in: The river flooded the road.",
      "2. Write the past tense of write.",
      "3. Is this a question or a statement: Close the window.",
      "4. Give a synonym for quick.",
      "5. Punctuate: where is my diary",
    ],
  };
  const key = subject.toLowerCase().includes("math") ? "mathematics" : subject.toLowerCase().includes("eng") ? "english" : "science";
  return `Draft quiz — ${subject}. Review before you share it with a class. This is not an official paper.\n\n${bank[key].join("\n")}\n\nAnswers for the teacher only: maths 24 cm², 4, 30, 70°, 4.8. Science: chloroplast, temperature, shape/volume, ice is less dense, oxygen. English: river, wrote, command, fast, Where is my diary?`;
}

export function answerAssistant(prompt: string, mode: "student" | "teacher"): AssistantReply {
  const text = prompt.trim();
  const lower = text.toLowerCase();
  if (!text) return { refused: true, text: "Type a question to begin." };
  if (/(other student|classmate'?s mark|anika|kabir|phone number|address of|fee of)/i.test(text) && /mark|phone|address|fee|result/.test(lower)) {
    return {
      refused: true,
      text: "I can help with a concept or a practice question. I can't look up another person's marks, fees, or contact details.",
    };
  }
  if (/(cheat|exam paper leak|official decision|punish)/i.test(lower)) {
    return {
      refused: true,
      text: "I can't help with cheating, leaked papers, or school punishments. Ask a teacher if you need a decision from the school.",
    };
  }
  if (mode === "teacher" && /(quiz|worksheet|lesson)/i.test(lower)) {
    const subject = /math/.test(lower) ? "Mathematics" : /english|grammar/.test(lower) ? "English" : "Science";
    return { refused: false, text: quiz(subject) };
  }
  const topic = TOPICS.find((item) => item.keys.some((key) => lower.includes(key)));
  if (topic) {
    return {
      refused: false,
      text: `${topic.title}\n\n${topic.body}\n\n${topic.practice}\n\nThis explanation is a study aid. It is not an official school answer key.`,
    };
  }
  if (mode === "teacher") {
    return {
      refused: false,
      text: "I can draft a short quiz or a revision note. Try “quiz for mathematics” or “lesson note on photosynthesis”. Review anything you share with students. I do not make official school decisions.",
    };
  }
  return {
    refused: false,
    text: "I can explain fractions, linear equations, photosynthesis, Newton's laws, verb tenses, the water cycle, or build a revision plan. Ask one of those, and try the practice before checking with your teacher. I won't just hand over an exam answer.",
  };
}
