import { describe, expect, it } from 'vitest'
import * as voice from '../index'

describe('voice public API', () => {
  it('exports the controller, parser, and speech adapter as classes', () => {
    expect(voice.ChessPhraseParser).toBeTypeOf('function')
    expect(voice.VoiceCommandInput).toBeTypeOf('function')
    expect(voice.WebSpeechRecognitionAdapter).toBeTypeOf('function')
    expect(voice.BrowserSpeechRecognitionFactory).toBeTypeOf('function')
    expect(new voice.ChessPhraseParser().parse('pawn to e4', [])).toEqual([])
  })
})
