/**
 * JSONL (JSON Lines) parser and serializer for session persistence
 * Each line is a valid JSON object representing a message
 */

export type JsonlMessageType = 'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result' | 'rpc_response' | 'error';

export interface JsonlMessage {
  type: JsonlMessageType;
  content?: string;
  timestamp: string;
  // Tool-related fields
  name?: string;
  input?: Record<string, unknown>;
  tool_call_id?: string;
  success?: boolean;
  // Metadata
  role?: string;
  messageId?: string;
  sessionId?: string;
}

/**
 * Parse JSONL string into array of messages
 * Skips malformed lines and continues parsing
 */
export function parseJsonlToMessages(input: string): JsonlMessage[] {
  if (!input || input.trim() === '') {
    return [];
  }

  const messages: JsonlMessage[] = [];
  const lines = input.split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue; // Skip empty lines
    }

    try {
      const parsed = JSON.parse(trimmedLine) as JsonlMessage;
      // Validate required fields
      if (parsed.type && parsed.timestamp) {
        messages.push(parsed);
      }
    } catch {
      // Skip malformed JSON lines - continue parsing
      continue;
    }
  }

  return messages;
}

/**
 * Convert array of messages to JSONL string
 * Each message is on its own line
 */
export function messagesToJsonl(messages: JsonlMessage[]): string {
  if (!messages || messages.length === 0) {
    return '';
  }

  return messages.map((msg) => JSON.stringify(msg)).join('\n');
}
