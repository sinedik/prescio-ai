import { callSonnet, parseJSON } from '../lib/claude.js'
import { PERSONAL_NOTE_SYSTEM, buildPersonalNotePrompt } from '../prompts/personalNote.js'

export async function getPersonalNote(market, analysis, profile) {
  const text = await callSonnet(
    PERSONAL_NOTE_SYSTEM,
    buildPersonalNotePrompt(market, analysis, profile),
    false
  )
  return parseJSON(text)
}
