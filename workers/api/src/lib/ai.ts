/** Call OpenAI Chat Completions API directly */
export async function callOpenAI(
  apiKey: string,
  opts: {
    model?: string;
    messages: Array<{ role: string; content: unknown }>;
    tools?: unknown[];
    tool_choice?: unknown;
    max_completion_tokens?: number;
    temperature?: number;
  }
): Promise<{
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
}> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model || "gpt-4o",
      messages: opts.messages,
      tools: opts.tools,
      tool_choice: opts.tool_choice,
      max_completion_tokens: opts.max_completion_tokens || 2000,
      temperature: opts.temperature,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${text}`);
  }

  return res.json();
}


/** Extract tool call arguments from an AI response */
export function extractToolArgs<T>(
  response: Awaited<ReturnType<typeof callOpenAI>>,
  toolName: string
): T | null {
  const toolCall = response.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.name === toolName) {
    try {
      return JSON.parse(toolCall.function.arguments) as T;
    } catch {
      return null;
    }
  }

  // Fallback: try extracting JSON from message content
  const content = response.choices?.[0]?.message?.content || "";
  const jsonMatch = content.match(/\[\s*\{[\s\S]*?\}\s*\]/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as T;
    } catch {
      // ignore
    }
  }

  try {
    const parsed = JSON.parse(content);
    return parsed as T;
  } catch {
    return null;
  }
}

/** Call OpenAI Whisper for transcription */
export async function transcribeAudio(
  apiKey: string,
  audioBlob: Blob,
  fileName: string,
  fileType: string
): Promise<{ text: string; words: Array<{ word: string; start: number; end: number }>; language: string }> {
  const formData = new FormData();
  formData.append("file", new File([audioBlob], fileName, { type: fileType }));
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "word");
  formData.append("language", "de");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Whisper API error (${res.status}): ${text}`);
  }

  const data = await res.json() as { text?: string; words?: Array<{ word: string; start: number; end: number }>; language?: string };
  return {
    text: data.text || "",
    words: (data.words || []).map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
    })),
    language: data.language || "de",
  };
}
