import type { Message, MessageStreamEvent } from "@chat-app/shared";

export interface MessageStreamCallbacks {
  onAccepted(message: Message): void;
  onDelta(text: string): void;
}

type StreamEvents = { [Type in MessageStreamEvent["type"]]: Extract<MessageStreamEvent, { type: Type }> };
type StreamHandlers = {
  [Type in keyof StreamEvents]: (event: StreamEvents[Type], callbacks: MessageStreamCallbacks) => Message | undefined;
};

const streamHandlers: StreamHandlers = {
  accepted: (event, callbacks) => {
    callbacks.onAccepted(event.message);
    return undefined;
  },
  delta: (event, callbacks) => {
    callbacks.onDelta(event.text);
    return undefined;
  },
  completed: (event) => event.message,
  failed: (event) => {
    throw new Error(event.detail);
  },
};

function handleStreamEvent<Type extends keyof StreamEvents>(
  type: Type,
  event: StreamEvents[Type],
  callbacks: MessageStreamCallbacks
): Message | undefined {
  return streamHandlers[type](event, callbacks);
}

export async function consumeMessageStream(
  events: AsyncIterable<MessageStreamEvent>,
  callbacks: MessageStreamCallbacks
): Promise<Message> {
  for await (const event of events) {
    const response = handleStreamEvent(event.type, event, callbacks);
    if (response) return response;
  }
  throw new Error("The response stream ended without a result.");
}
