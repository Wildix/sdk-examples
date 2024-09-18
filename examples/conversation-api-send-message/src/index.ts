import fs from 'fs';
import {PbxTokenProvider} from '@wildix/auth-utils';
import {
  ConversationsClient,
  GetUploadedFileInfoCommand,
  MessageAttachment,
  SendMessageCommand,
  SendMessageOutput,
  UploadFileCommand,
} from '@wildix/xbees-conversations-client';

/*
 * PBX serial & key
 *
 * You can receive this values after login to your PBX by ssh
 * and run command `cat /rw2/etc/sf2 | head -18 | tail -2 | xargs printf "pbxSerial: %s\npbxKey: %s\n"`
 * */
const PBX_SERIAL = '<pbxSerial>';
const PBX_KEY = '<pbxKey>';

/*
 * x-bees channel ID
 *
 * You can copy the channel ID into the URL input field of your browser
 * https://app.x-bees.com/inbox/<channelId>
 */
const XBS_CHANNEL_ID = '<channelId>';
/*
 * x-bees userId
 *
 * You can get the x-bees user ID by running the following command in your browser
 * from the x-bees page in the devtools console: wx.stream._user.id
 */
const XBS_USER_FROM_ID = '<userId>';

(async () => {
  try {
    const sendMessageResponse = await sendMessageWithAttachments(
      XBS_CHANNEL_ID,
      XBS_USER_FROM_ID,
      `Test message from x-bees Conversation API v2 ${new Date().toISOString()}`,
      [
        {path: 'xbs_logo.png', contentType: 'image/png'},
        {path: 'wildix_logo.png', contentType: 'image/png'},
      ],
    );
    console.log('sendMessageResponse:', sendMessageResponse);
  } catch (error) {
    console.error('Send message error:', error);
  }
})();

interface Attachment {
  path: string;
  contentType: string;
}

/**
 * Sends a message to a specified channel with optional file attachments.
 *
 * This function first uploads any provided files to a storage service and then sends a message
 * containing the text and metadata of the uploaded files to the specified channel.
 *
 * @async
 * @param {string} channelId - The ID of the channel where the message will be sent.
 * @param {string} userId - The ID of the x-bees user.
 * @param {string} text - The text content of the message to be sent.
 * @param {Attachment[]} [files] - An optional array of files to be attached to the message.
 *                                  Each file should contain properties like `path` and `contentType`.
 *
 * @returns {Promise<SendMessageOutput>} - A promise that resolves with the output of the send message operation.
 *                                          The output typically contains details about the sent message.
 *
 * @throws {Error} - Throws an error if the message sending or file upload fails.
 *                   Possible reasons include invalid channel ID, file upload errors, or network issues.
 */
async function sendMessageWithAttachments(
  channelId: string,
  userId: string,
  text: string,
  files?: Attachment[],
): Promise<SendMessageOutput> {
  const pbxTokenProvider = new PbxTokenProvider(PBX_SERIAL, PBX_KEY);
  const client = new ConversationsClient({token: pbxTokenProvider, env: 'prod'});

  let attachments: MessageAttachment[] = [];

  if (files) {
    attachments = await Promise.all(files.map((attachment) => uploadAttachment(client, channelId, userId, attachment)));
  }

  return client.send(
    new SendMessageCommand({
      channelId,
      text,
      userId,
      attachments,
    }),
  );
}

async function uploadFileToS3(
  presignedUploadUrl: string,
  filePath: string,
  contentType: string = '',
): Promise<Response> {
  const fileContent = fs.readFileSync(filePath);

  const response = await fetch(presignedUploadUrl, {
    method: 'PUT',
    headers: {'Content-Type': contentType},
    body: fileContent,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload file: ${response.statusText}`);
  }

  return response;
}

async function uploadAttachment(
  client: ConversationsClient,
  channelId: string,
  userId: string,
  attachment: Attachment,
): Promise<MessageAttachment> {
  const {fileId, presignedUploadUrl} = await client.send(
    new UploadFileCommand({
      channelId,
      name: attachment.path,
      userId,
    }),
  );

  const {statusText} = await uploadFileToS3(presignedUploadUrl, attachment.path, attachment.contentType);
  console.log(`Upload attachment ${attachment.path} result: ${statusText}`);

  const getFileInfoResponse = await client.send(
    new GetUploadedFileInfoCommand({
      channelId,
      fileId,
    }),
  );

  return getFileInfoResponse.file!;
}
