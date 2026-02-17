import Anthropic from "@anthropic-ai/sdk";
import { evaluate } from "mathjs";

export const calculatorTool: Anthropic.Tool = {
  name: "calculator",
  description:
    "Evaluate a mathematical expression. Supports arithmetic, algebra, trigonometry, unit conversions, and more. Uses the mathjs library.",
  input_schema: {
    type: "object" as const,
    properties: {
      expression: {
        type: "string",
        description:
          'The mathematical expression to evaluate (e.g. "sqrt(144) + 3^2", "5 inches to cm")',
      },
    },
    required: ["expression"],
  },
};

export async function calculatorExecute(
  input: Record<string, unknown>
): Promise<string> {
  const expression = input.expression as string;

  try {
    const result = evaluate(expression);
    return JSON.stringify({
      expression,
      result: String(result),
    });
  } catch (err) {
    return JSON.stringify({
      expression,
      error: `Failed to evaluate: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
