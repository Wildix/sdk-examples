import {ConversationsClient, SendMessageCommand, WebhookChatMessageNewEvent} from '@wildix/xbees-conversations-client';

import OpenAI from 'openai';
import {AssistantStream} from 'openai/lib/AssistantStream';

import PhasesStorage from './PhasesStorage';

export default class ChatEventHandler {
  storage: PhasesStorage;

  openaiClient: OpenAI;

  openaiAssistantId: string;

  conversationsClient: ConversationsClient;

  conversationsThreads = new Map<string, string>();

  tasks: Promise<unknown>[] | undefined;

  event: WebhookChatMessageNewEvent | undefined;

  constructor(client: ConversationsClient, openaiClient: OpenAI, openaiAssistantId: string, storage: PhasesStorage) {
    this.conversationsClient = client;
    this.openaiClient = openaiClient;
    this.openaiAssistantId = openaiAssistantId;
    this.storage = storage;
  }

  async processChatMessageNewEvent(event: WebhookChatMessageNewEvent) {
    if (!this.isEventProcessable(event)) {
      return;
    }

    this.event = event;
    this.tasks = [];

    const {channelId} = event.data.channel;
    const threadId = await this.getOrCreateThread(channelId);
    const messageContent = this.getMessageContent(event);

    if (messageContent.length > 0) {
      await this.openaiClient.beta.threads.messages.create(threadId, {
        role: 'user',
        content: messageContent,
      });

      await this.processRun(
        this.openaiClient.beta.threads.runs.stream(threadId, {assistant_id: this.openaiAssistantId}),
      );
    }

    this.event = undefined;
    this.tasks = undefined;
  }

  private async processRun(stream: AssistantStream) {
    stream.on('messageDone', (event) => this.tasks!.push(this.processMessageDoneEvent(event)));

    const result = await stream.finalRun();

    const tools: Promise<OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput>[] = []; // RunSubmitToolOutputsParams.ToolOutput

    if (result.required_action && result.required_action.type === 'submit_tool_outputs') {
      const calls = result.required_action.submit_tool_outputs.tool_calls;

      for (const toolCall of calls) {
        if (toolCall.type === 'function') {
          switch (toolCall.function.name) {
            case 'add_phase': {
              tools.push(this.processAddPhaseToolCall(toolCall));
              break;
            }

            case 'remove_phase': {
              tools.push(this.processRemovePhaseToolCall(toolCall));
              break;
            }

            case 'list_phases': {
              tools.push(this.processListPhasesToolCall(toolCall));
              break;
            }

            default: {
              tools.push(
                Promise.resolve({
                  output: '{"success": false, "reason": "Not supported"}',
                  tool_call_id: toolCall.id,
                }),
              );
            }
          }
        }
      }
    }

    const toolsResponse = await Promise.all(tools);

    if (toolsResponse.length > 0) {
      await this.processRun(
        this.openaiClient.beta.threads.runs.submitToolOutputsStream(result.thread_id, result.id, {
          tool_outputs: toolsResponse,
          stream: true,
        }),
      );
    }

    if (this.tasks) {
      await Promise.allSettled(this.tasks);
    }
  }

  private processAddPhaseToolCall(call: OpenAI.Beta.Threads.Runs.RequiredActionFunctionToolCall) {
    const payload = JSON.parse(call.function.arguments) as Record<string, string>;
    let result: OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput = {
      output: JSON.stringify({success: true}),
      tool_call_id: call.id,
    };

    if (payload.phase) {
      if (this.storage.exist(payload.phase)) {
        result = {
          output: JSON.stringify({success: false, reason: `"${payload.phase}" already exist.`}),
          tool_call_id: call.id,
        };
      } else {
        this.storage.addPhase(payload.phase, this.event!.data.message.user);

        result = {
          output: JSON.stringify({success: true, reason: `"${payload.phase}" added for alert.`}),
          tool_call_id: call.id,
        };
      }
    }

    return Promise.resolve(result);
  }

  private processRemovePhaseToolCall(call: OpenAI.Beta.Threads.Runs.RequiredActionFunctionToolCall) {
    const payload = JSON.parse(call.function.arguments) as Record<string, string>;
    let result: OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput = {
      output: JSON.stringify({success: true}),
      tool_call_id: call.id,
    };

    if (payload.phase) {
      if (!this.storage.exist(payload.phase)) {
        result = {
          output: JSON.stringify({success: false, reason: `"${payload.phase}" does not exist.`}),
          tool_call_id: call.id,
        };
      } else {
        this.storage.addPhase(payload.phase, this.event!.data.message.user);

        result = {
          output: JSON.stringify({success: true, reason: `"${payload.phase}" removed from alert system.`}),
          tool_call_id: call.id,
        };
      }
    }

    return Promise.resolve(result);
  }

  private processListPhasesToolCall(call: OpenAI.Beta.Threads.Runs.RequiredActionFunctionToolCall) {
    return Promise.resolve({
      output: JSON.stringify({success: true, phases: this.storage.getPhases()}),
      tool_call_id: call.id,
    });
  }

  private async processMessageDoneEvent(event: OpenAI.Beta.Threads.Messages.Message) {
    const message = this.event!;
    const {content} = event;

    const resultText: string[] = [];

    for (const chunk of content) {
      if (chunk.type === 'text') {
        resultText.push(chunk.text.value);
      }
    }

    await this.conversationsClient.send(
      new SendMessageCommand({
        channelId: message.data.channel.channelId,
        text: resultText.join('\n'),
      }),
    );
  }

  private async getOrCreateThread(channelId: string): Promise<string> {
    let threadId = this.conversationsThreads.get(channelId);

    if (!threadId) {
      const thread = await this.openaiClient.beta.threads.create();
      threadId = thread.id;

      this.conversationsThreads.set(channelId, threadId);
    }

    return threadId;
  }

  private getMessageContent(event: WebhookChatMessageNewEvent): OpenAI.Beta.Threads.MessageContentPartParam[] {
    const {text} = event.data.message;
    const result: OpenAI.Beta.Threads.MessageContentPartParam[] = [];

    if (text) {
      result.push({type: 'text', text});
    }

    return result;
  }

  private isEventProcessable(event: WebhookChatMessageNewEvent) {
    // Ignore event if channel have more than 2 members.
    if (event.data.channel.memberCount > 2) {
      return false;
    }

    // Ignore messages that was sent from bots.
    if (event.data.message.user.bot || event.botId === event.data.message.user.id) {
      return false;
    }

    // Ignore system events.
    if (event.data.message.type !== 'regular') {
      return false;
    }

    // Ignore messages without text.
    if (!event.data.message.text) {
      return false;
    }

    return true;
  }
}
