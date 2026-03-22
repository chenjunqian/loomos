import { AskUserPrompt } from './ask-user'
import { TelegramConfirmationRequest } from './types'

const CUSTOM_REPLY_HINT = 'If none of these fit, just type your reply and send it.'

export function createAskUserConfirmationRequest(prompt: AskUserPrompt): TelegramConfirmationRequest {
    const message = (prompt.context || prompt.question || 'Please choose one of the options below.').trim()

    return {
        mode: 'ask_user',
        message: `${message}\n\n${CUSTOM_REPLY_HINT}`,
        options: prompt.options,
    }
}

export function createDefaultConfirmationRequest(message: string): TelegramConfirmationRequest {
    return {
        mode: 'default',
        message,
    }
}
