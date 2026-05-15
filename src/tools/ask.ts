import { isCancel, multiselect, select, text } from "@clack/prompts";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { AppConfig } from "../types";

const CUSTOM_VALUE = "__aichat_custom_input__";

const askOptionSchema = z.object({
  value: z.string().min(1).describe("Stable value returned when this option is selected."),
  label: z.string().min(1).optional().describe("Human-readable label. Defaults to value."),
  hint: z.string().optional().describe("Optional short hint shown next to the option."),
});

export const askInputSchema = z
  .object({
    question: z.string().min(1).describe("The single question to ask the user."),
    type: z
      .enum(["single", "multiple", "text"])
      .describe("Use single for one option, multiple for several options, or text for free-form input."),
    options: z
      .array(askOptionSchema)
      .max(5)
      .default([])
      .describe("Options for single or multiple choice. Do not provide more than five."),
    allowCustom: z
      .boolean()
      .default(false)
      .describe("Whether to offer a custom free-form answer for choice questions."),
    placeholder: z.string().optional().describe("Placeholder for free-form input."),
    required: z.boolean().default(true).describe("Whether the user must provide an answer."),
  })
  .superRefine((input, context) => {
    const values = new Set<string>();
    for (const [index, option] of input.options.entries()) {
      if (option.value === CUSTOM_VALUE) {
        context.addIssue({
          code: "custom",
          path: ["options", index, "value"],
          message: `${CUSTOM_VALUE} is reserved for the ask tool.`,
        });
      }
      if (values.has(option.value)) {
        context.addIssue({
          code: "custom",
          path: ["options", index, "value"],
          message: "Option values must be unique.",
        });
      }
      values.add(option.value);
    }

    if (input.type !== "text" && input.options.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Choice questions require at least one option.",
      });
    }

    if (input.allowCustom && input.type !== "text" && input.options.length >= 5) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Custom input counts as one displayed option, so provide at most four options when allowCustom is true.",
      });
    }
  });

type AskInput = z.infer<typeof askInputSchema>;

type PromptOption = {
  value: string;
  label: string;
  hint?: string;
};

export function createAskTool(config: AppConfig): ToolSet {
  if (!config.tools.ask.enabled) {
    return {};
  }

  return {
    ask: tool({
      description: [
        "Ask the user one clarifying question when the requirement is ambiguous or missing a decision.",
        "Supports single choice, multiple choice, and free-form custom input.",
        "Ask only one question per call; if multiple questions are needed, call this tool step by step after each answer.",
        "Never show more than five options for a question.",
      ].join(" "),
      inputSchema: askInputSchema,
      execute: async (input) => askUser(input),
    }),
  };
}

async function askUser(input: AskInput) {
  switch (input.type) {
    case "single":
      return askSingle(input);
    case "multiple":
      return askMultiple(input);
    case "text":
      return askText(input);
  }
}

async function askSingle(input: AskInput) {
  const options = buildPromptOptions(input);
  const selected = await select<string>({
    message: input.question,
    options,
    maxItems: 5,
  });

  if (isCancel(selected)) {
    return cancelled(input);
  }

  if (selected === CUSTOM_VALUE) {
    const custom = await promptCustomInput(input);
    if (custom == null) {
      return cancelled(input);
    }
    return {
      cancelled: false,
      question: input.question,
      type: input.type,
      answer: custom,
      custom: true,
    };
  }

  const option = input.options.find((entry) => entry.value === selected);
  return {
    cancelled: false,
    question: input.question,
    type: input.type,
    answer: option?.label ?? selected,
    selectedValue: selected,
    selectedLabel: option?.label ?? selected,
    custom: false,
  };
}

async function askMultiple(input: AskInput) {
  const options = buildPromptOptions(input);
  const selected = await multiselect<string>({
    message: input.question,
    options,
    maxItems: 5,
    required: input.required,
  });

  if (isCancel(selected)) {
    return cancelled(input);
  }

  const selectedValues = selected.filter((value) => value !== CUSTOM_VALUE);
  const selectedOptions = selectedValues.map((value) => {
    const option = input.options.find((entry) => entry.value === value);
    return {
      value,
      label: option?.label ?? value,
    };
  });

  let customText: string | undefined;
  if (selected.includes(CUSTOM_VALUE)) {
    const custom = await promptCustomInput(input);
    if (custom == null) {
      return cancelled(input);
    }
    customText = custom;
  }

  return {
    cancelled: false,
    question: input.question,
    type: input.type,
    answer: [...selectedOptions.map((entry) => entry.label), ...(customText ? [customText] : [])],
    selectedValues,
    selectedOptions,
    customText,
  };
}

async function askText(input: AskInput) {
  const answer = await promptText({
    message: input.question,
    placeholder: input.placeholder,
    required: input.required,
  });

  if (answer == null) {
    return cancelled(input);
  }

  return {
    cancelled: false,
    question: input.question,
    type: input.type,
    answer,
  };
}

function buildPromptOptions(input: AskInput): PromptOption[] {
  const options = input.options.map((option) => ({
    value: option.value,
    label: option.label ?? option.value,
    hint: option.hint,
  }));

  if (input.allowCustom) {
    options.push({
      value: CUSTOM_VALUE,
      label: "自定义输入",
      hint: undefined,
    });
  }

  return options;
}

async function promptCustomInput(input: AskInput): Promise<string | undefined> {
  return promptText({
    message: `${input.question}（自定义）`,
    placeholder: input.placeholder ?? "请输入自定义答案",
    required: input.required,
  });
}

async function promptText(input: {
  message: string;
  placeholder?: string;
  required: boolean;
}): Promise<string | undefined> {
  const answer = await text({
    message: input.message,
    placeholder: input.placeholder,
    validate: (value) => {
      if (input.required && !value?.trim()) {
        return "请输入内容";
      }
      return undefined;
    },
  });

  if (isCancel(answer)) {
    return undefined;
  }
  return String(answer).trim();
}

function cancelled(input: AskInput) {
  return {
    cancelled: true,
    question: input.question,
    type: input.type,
    answer: null,
  };
}
