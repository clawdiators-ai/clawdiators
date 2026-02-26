import { mulberry32 } from "../../services/whimsy.js";

export interface BrokenFunction {
  id: string;
  name: string;
  language: string;
  code: string;
  bug_description: string;
  test_cases: TestCase[];
}

export interface TestCase {
  input: unknown;
  expected_output: unknown;
}

export interface RefactorGroundTruth {
  functions: Array<{
    id: string;
    correct_outputs: unknown[];
  }>;
}

export interface RefactorData {
  functions: BrokenFunction[];
  groundTruth: RefactorGroundTruth;
  objective: string;
}

// ── Broken function templates ──────────────────────────────────────

interface FunctionTemplate {
  name: string;
  description: string;
  makeBroken: (rng: () => number) => {
    code: string;
    bug_description: string;
    testCases: TestCase[];
    correctOutputs: unknown[];
  };
}

const templates: FunctionTemplate[] = [
  {
    name: "sum_array",
    description: "Sum all numbers in an array",
    makeBroken: (rng) => {
      const arr1 = Array.from({ length: 5 }, () => Math.floor(rng() * 100));
      const arr2 = Array.from({ length: 3 }, () => Math.floor(rng() * 50));
      const arr3: number[] = [];
      const bugType = Math.floor(rng() * 3);
      let code: string;
      let bug: string;

      if (bugType === 0) {
        code = `function sum_array(arr) {\n  let total = 1;\n  for (let i = 0; i < arr.length; i++) {\n    total += arr[i];\n  }\n  return total;\n}`;
        bug = "Initial accumulator value is wrong (starts at 1 instead of 0)";
      } else if (bugType === 1) {
        code = `function sum_array(arr) {\n  let total = 0;\n  for (let i = 1; i < arr.length; i++) {\n    total += arr[i];\n  }\n  return total;\n}`;
        bug = "Loop starts at index 1, skipping the first element";
      } else {
        code = `function sum_array(arr) {\n  let total = 0;\n  for (let i = 0; i <= arr.length; i++) {\n    total += arr[i];\n  }\n  return total;\n}`;
        bug = "Off-by-one: loop condition uses <= instead of <, accessing undefined";
      }

      return {
        code,
        bug_description: bug,
        testCases: [
          { input: arr1, expected_output: arr1.reduce((a, b) => a + b, 0) },
          { input: arr2, expected_output: arr2.reduce((a, b) => a + b, 0) },
          { input: arr3, expected_output: 0 },
        ],
        correctOutputs: [
          arr1.reduce((a, b) => a + b, 0),
          arr2.reduce((a, b) => a + b, 0),
          0,
        ],
      };
    },
  },
  {
    name: "find_max",
    description: "Find the maximum value in an array",
    makeBroken: (rng) => {
      const arr1 = Array.from({ length: 6 }, () => Math.floor(rng() * 200) - 100);
      const arr2 = [-5, -3, -1, -8, -2];
      const bugType = Math.floor(rng() * 2);
      let code: string;
      let bug: string;

      if (bugType === 0) {
        code = `function find_max(arr) {\n  let max = 0;\n  for (const val of arr) {\n    if (val > max) max = val;\n  }\n  return max;\n}`;
        bug = "Initial max is 0 instead of -Infinity, fails for all-negative arrays";
      } else {
        code = `function find_max(arr) {\n  let max = arr[0];\n  for (let i = 0; i < arr.length; i++) {\n    if (arr[i] < max) max = arr[i];\n  }\n  return max;\n}`;
        bug = "Comparison is reversed (< instead of >), finding minimum instead of maximum";
      }

      return {
        code,
        bug_description: bug,
        testCases: [
          { input: arr1, expected_output: Math.max(...arr1) },
          { input: arr2, expected_output: -1 },
          { input: [42], expected_output: 42 },
        ],
        correctOutputs: [Math.max(...arr1), -1, 42],
      };
    },
  },
  {
    name: "reverse_string",
    description: "Reverse a string",
    makeBroken: (rng) => {
      const words = ["gladiator", "reef", "coral", "trident", "current", "anchor"];
      const w1 = words[Math.floor(rng() * words.length)];
      const w2 = words[Math.floor(rng() * words.length)];
      const bugType = Math.floor(rng() * 2);
      let code: string;
      let bug: string;

      if (bugType === 0) {
        code = `function reverse_string(s) {\n  let result = "";\n  for (let i = s.length; i >= 0; i--) {\n    result += s[i];\n  }\n  return result;\n}`;
        bug = "Starts at s.length instead of s.length-1, first char is undefined";
      } else {
        code = `function reverse_string(s) {\n  let result = "";\n  for (let i = s.length - 1; i > 0; i--) {\n    result += s[i];\n  }\n  return result;\n}`;
        bug = "Loop condition uses > 0 instead of >= 0, misses the first character";
      }

      const rev = (s: string) => s.split("").reverse().join("");
      return {
        code,
        bug_description: bug,
        testCases: [
          { input: w1, expected_output: rev(w1) },
          { input: w2, expected_output: rev(w2) },
          { input: "a", expected_output: "a" },
        ],
        correctOutputs: [rev(w1), rev(w2), "a"],
      };
    },
  },
  {
    name: "count_vowels",
    description: "Count vowels in a string",
    makeBroken: (rng) => {
      const phrases = [
        "the arena awaits",
        "ocean depths hide treasure",
        "claws sharpen at dawn",
        "victory or defeat",
      ];
      const p1 = phrases[Math.floor(rng() * phrases.length)];
      const p2 = phrases[Math.floor(rng() * phrases.length)];
      const bugType = Math.floor(rng() * 2);
      let code: string;
      let bug: string;

      if (bugType === 0) {
        code = `function count_vowels(s) {\n  const vowels = "aeiou";\n  let count = 0;\n  for (const ch of s) {\n    if (vowels.includes(ch)) count++;\n  }\n  return count;\n}`;
        bug = "Does not handle uppercase vowels (case sensitivity bug)";
      } else {
        code = `function count_vowels(s) {\n  const vowels = "aeio";\n  let count = 0;\n  for (const ch of s.toLowerCase()) {\n    if (vowels.includes(ch)) count++;\n  }\n  return count;\n}`;
        bug = "Missing 'u' from the vowels string";
      }

      const countV = (s: string) => (s.toLowerCase().match(/[aeiou]/g) || []).length;
      return {
        code,
        bug_description: bug,
        testCases: [
          { input: p1, expected_output: countV(p1) },
          { input: p2, expected_output: countV(p2) },
          { input: "xyz", expected_output: 0 },
        ],
        correctOutputs: [countV(p1), countV(p2), 0],
      };
    },
  },
  {
    name: "fibonacci",
    description: "Return the nth Fibonacci number",
    makeBroken: (rng) => {
      const n1 = Math.floor(rng() * 8) + 5;
      const n2 = Math.floor(rng() * 5) + 2;
      const bugType = Math.floor(rng() * 2);
      let code: string;
      let bug: string;

      if (bugType === 0) {
        code = `function fibonacci(n) {\n  if (n <= 1) return n;\n  let a = 0, b = 1;\n  for (let i = 2; i < n; i++) {\n    const temp = a + b;\n    a = b;\n    b = temp;\n  }\n  return b;\n}`;
        bug = "Loop runs to i < n instead of i <= n, returns fib(n-1) instead of fib(n)";
      } else {
        code = `function fibonacci(n) {\n  if (n <= 1) return n;\n  let a = 1, b = 1;\n  for (let i = 2; i <= n; i++) {\n    const temp = a + b;\n    a = b;\n    b = temp;\n  }\n  return b;\n}`;
        bug = "Initial values are both 1 instead of 0 and 1, sequence is shifted";
      }

      const fib = (n: number): number => {
        if (n <= 1) return n;
        let a = 0, b = 1;
        for (let i = 2; i <= n; i++) {
          const temp = a + b;
          a = b;
          b = temp;
        }
        return b;
      };

      return {
        code,
        bug_description: bug,
        testCases: [
          { input: n1, expected_output: fib(n1) },
          { input: n2, expected_output: fib(n2) },
          { input: 0, expected_output: 0 },
          { input: 1, expected_output: 1 },
        ],
        correctOutputs: [fib(n1), fib(n2), 0, 1],
      };
    },
  },
  {
    name: "is_palindrome",
    description: "Check if a string is a palindrome",
    makeBroken: (rng) => {
      const words = ["racecar", "level", "hello", "madam", "rotor", "world", "kayak"];
      const w1 = words[Math.floor(rng() * words.length)];
      const w2 = words[Math.floor(rng() * words.length)];

      const code = `function is_palindrome(s) {\n  for (let i = 0; i < s.length / 2; i++) {\n    if (s[i] !== s[s.length - i]) return false;\n  }\n  return true;\n}`;

      const isPalin = (s: string) => s === s.split("").reverse().join("");

      return {
        code,
        bug_description: "Off-by-one in index: s[s.length - i] should be s[s.length - 1 - i]",
        testCases: [
          { input: w1, expected_output: isPalin(w1) },
          { input: w2, expected_output: isPalin(w2) },
          { input: "a", expected_output: true },
          { input: "ab", expected_output: false },
        ],
        correctOutputs: [isPalin(w1), isPalin(w2), true, false],
      };
    },
  },
];

export function generateRefactorData(seed: number): RefactorData {
  const rng = mulberry32(seed);

  // Pick 5 of 6 templates
  const shuffled = [...templates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selected = shuffled.slice(0, 5);

  const functions: BrokenFunction[] = [];
  const truthFunctions: RefactorGroundTruth["functions"] = [];

  for (let i = 0; i < selected.length; i++) {
    const tmpl = selected[i];
    const result = tmpl.makeBroken(rng);
    const id = `fn-${seed}-${i}`;

    functions.push({
      id,
      name: tmpl.name,
      language: "javascript",
      code: result.code,
      bug_description: result.bug_description,
      test_cases: result.testCases,
    });

    truthFunctions.push({
      id,
      correct_outputs: result.correctOutputs,
    });
  }

  const objective =
    "You are given 5 broken JavaScript functions, each with a known bug and test cases. For each function, submit the correct outputs for all test cases. You do NOT need to fix the code — just determine what the correct output should be for each test case.";

  return {
    functions,
    groundTruth: { functions: truthFunctions },
    objective,
  };
}
