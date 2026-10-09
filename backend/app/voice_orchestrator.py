import asyncio
import contextlib
import json
import logging

from fastapi import WebSocket, WebSocketDisconnect

from .chatbot import GREETING_TEXT, ensure_session_started, get_reply
from .sarvam_stt import SarvamSTTSession
from .sarvam_tts import SarvamTTSSession
from .speech_format import to_speech_text

logger = logging.getLogger("voice_ai.voice_orchestrator")

# Sarvam TTS (bulbul) only accepts these language codes. STT's auto-detect
# can in principle report something outside this set; falling back instead
# of passing an unsupported code straight to TTS avoids a silent connect
# failure (text shows up, no audio ever plays).
SUPPORTED_TTS_LANGUAGES = {
    "bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN",
    "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN",
}


class VoiceCall:
    """One continuous voice call over a single client websocket.

    State machine: LISTENING -> (final transcript) -> THINKING -> SPEAKING ->
    LISTENING. Claude's reply streams in sentence by sentence (see
    chatbot.get_reply's on_sentence callback); each sentence is sent to the
    client as text and spoken via TTS as soon as it's ready, rather than
    waiting for the whole reply -- the client doesn't have to render that
    text (this is a voice-only call), but it keeps the audio pacing natural
    and keeps barge-in timing accurate. A vad.speech_start event while
    SPEAKING is a barge-in: playback is interrupted client-side and the
    in-flight response task is cancelled. A client {"type": "interrupt"}
    message (the UI's Stop button) does the same while THINKING or SPEAKING.
    """

    def __init__(self, session_id: str, client_ws: WebSocket):
        self.session_id = session_id
        self.client_ws = client_ws
        self.stt = SarvamSTTSession(language_code="auto")
        self.state = "LISTENING"
        self._tts_task: asyncio.Task | None = None
        self._last_language = "hi-IN"
        # Bumped every time a response starts or is cancelled. A response only
        # sends audio while the epoch it started with is still current, so a
        # response that's been superseded or interrupted goes silent the
        # instant the epoch moves -- even if its task hasn't finished
        # unwinding yet. This is what stops an old reply's audio chunks from
        # interleaving with the next reply's ("mumble-jumble").
        self._epoch = 0
        # Cleared while the user is mid-utterance (VAD speech_start ..
        # speech_end/final). A reply that's ready to speak while the user is
        # still talking waits on this instead of talking over them.
        self._user_quiet = asyncio.Event()
        self._user_quiet.set()

    async def run(self):
        try:
            await self.stt.connect()
        except Exception as exc:
            await self._send_json({"type": "error", "message": f"failed to start voice session: {exc}"})
            await self.client_ws.close()
            return

        # If this session hasn't been greeted via the text path yet (e.g. the
        # user opened a voice call directly), speak the canned greeting now.
        if ensure_session_started(self.session_id):
            self._epoch += 1
            self._tts_task = asyncio.create_task(self._speak_canned(GREETING_TEXT, self._epoch))

        relay_task = asyncio.create_task(self._relay_client_audio(), name="relay_client_audio")
        events_task = asyncio.create_task(self._consume_stt_events(), name="consume_stt_events")
        try:
            # asyncio.gather() waits for BOTH to finish, so if the client
            # disconnects (ending _relay_client_audio) while _consume_stt_events
            # is still happily running against Sarvam, the whole session would
            # linger in the background instead of tearing down. Whichever
            # finishes first, cancel the other immediately.
            done, pending = await asyncio.wait(
                {relay_task, events_task}, return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
            for task in done:
                if task.cancelled():
                    continue
                exc = task.exception()
                if exc:
                    logger.warning("Voice call loop failed in %s: %s", task.get_name(), exc, exc_info=exc)
                    await self._safe_send_json({"type": "error", "message": str(exc)})
                else:
                    # Whichever of the two finished cleanly (no exception) is
                    # what ended the call -- log which one so a call that
                    # drops unexpectedly (as opposed to via the client's own
                    # "stop"/disconnect) is diagnosable instead of just
                    # showing up as a silent "connection closed" with no clue
                    # why.
                    logger.info("Voice call ending: %s finished first (session=%s)", task.get_name(), self.session_id)
        finally:
            if self._tts_task:
                self._tts_task.cancel()
            await self.stt.close()

    async def _relay_client_audio(self):
        try:
            while True:
                message = await self.client_ws.receive()
                if message["type"] == "websocket.disconnect":
                    logger.info("Client audio relay ending: browser disconnected (session=%s)", self.session_id)
                    break
                if message.get("bytes") is not None:
                    await self.stt.send_audio(message["bytes"])
                elif message.get("text") is not None:
                    data = json.loads(message["text"])
                    if data.get("type") == "stop":
                        logger.info("Client audio relay ending: client sent stop (session=%s)", self.session_id)
                        break
                    if data.get("type") == "interrupt" and self.state in ("THINKING", "SPEAKING"):
                        # The user hit "Stop" in the UI: same as a spoken
                        # barge-in, minus the speech -- the call stays open.
                        logger.info("Client interrupt while %s (session=%s)", self.state, self.session_id)
                        await self._barge_in()
        except WebSocketDisconnect:
            logger.info("Client audio relay ending: WebSocketDisconnect (session=%s)", self.session_id)

    async def _consume_stt_events(self):
        async for event in self.stt.events():
            kind = event.get("event")
            if kind == "vad.speech_start":
                self._user_quiet.clear()
                if self.state == "SPEAKING":
                    logger.info("Barge-in: vad.speech_start while SPEAKING -- cutting off TTS. event=%s", event)
                    await self._barge_in()
                else:
                    logger.debug("vad.speech_start while state=%s (no barge-in)", self.state)
            elif kind == "vad.speech_end":
                self._user_quiet.set()
            elif kind == "transcript.partial":
                await self._send_json({"type": "user_partial", "text": event.get("text", "")})
            elif kind == "transcript.final":
                self._user_quiet.set()
                text = event.get("text", "")
                # Sarvam's realtime STT reports the detected language (when
                # language_code=auto) under the key "language", not
                # "language_code" -- easy to mix up with our own TTS param
                # of the same name.
                detected = event.get("language")
                if detected in SUPPORTED_TTS_LANGUAGES:
                    self._last_language = detected
                elif detected:
                    logger.warning("STT detected unsupported TTS language %r, keeping %r", detected, self._last_language)
                await self._send_json({"type": "user_final", "text": text})
                await self._handle_turn(text)
            elif kind == "error":
                logger.warning("STT error event: %s", event)
                await self._safe_send_json({"type": "error", "message": event.get("message", "stt error")})
        # self.stt.events() only stops yielding when Sarvam's STT websocket
        # itself closes (gracefully -- an abnormal close raises instead and
        # shows up as this task's exception in run()). That ends the whole
        # call, so it's worth knowing about even though it isn't an error.
        logger.info("STT event stream ended -- Sarvam closed the STT connection (session=%s)", self.session_id)

    async def _handle_turn(self, user_text: str):
        if not user_text.strip():
            return
        # Only ever one response in flight. Before, a new turn just started
        # another task and overwrote the reference to the old one, so if the
        # user spoke again while the previous reply was still being thought
        # up or spoken, both ran at once and streamed audio into each other.
        # Cancel the old one and wait for it to actually stop first; its
        # unanswered user message stays in the session history, so the new
        # reply naturally covers both things the user said.
        await self._cancel_response()
        self._epoch += 1
        self.state = "THINKING"
        self._tts_task = asyncio.create_task(self._respond(user_text, self._epoch))

    async def _cancel_response(self):
        # Bumping the epoch first mutes the old response synchronously (it
        # checks the epoch before every audio chunk) -- cancellation itself
        # only lands at the task's next await.
        self._epoch += 1
        task, self._tts_task = self._tts_task, None
        if task is not None and not task.done():
            task.cancel()
            # asyncio.wait, not `await task`: it waits for the task to finish
            # unwinding (closing its TTS socket etc.) without re-raising the
            # task's CancelledError into us.
            await asyncio.wait({task})

    async def _wait_for_user_quiet(self):
        """Don't start talking over the user: if they're mid-utterance, hold
        until VAD says they've stopped. Capped so a missed speech_end event
        can never leave the bot silent forever."""
        try:
            await asyncio.wait_for(self._user_quiet.wait(), timeout=6.0)
        except asyncio.TimeoutError:
            self._user_quiet.set()

    async def _respond(self, user_text: str, epoch: int):
        tts = SarvamTTSSession(language_code=self._last_language)
        tts_connected = False
        any_audio = False
        total_bytes_sent = 0
        playback_start: float | None = None
        # Sentences are handed off to a separate worker task instead of
        # being spoken inline inside on_sentence. Speaking a sentence (TTS
        # connect/send/flush/wait-for-audio) used to happen synchronously
        # inside on_sentence, which get_reply's streaming loop awaits before
        # it can read the next chunk of the LLM's response -- so the model
        # couldn't even start generating sentence N+1 until sentence N had
        # fully finished being spoken. That serialized generation and
        # speech, which is what produced an audible gap at every sentence
        # boundary. Queueing decouples them: the LLM keeps streaming while
        # the worker speaks whatever's already queued, so the next
        # sentence's text is usually ready well before TTS needs it.
        sentence_queue: asyncio.Queue[str | None] = asyncio.Queue()

        async def speak_worker():
            nonlocal tts_connected, any_audio, total_bytes_sent, playback_start
            while True:
                sentence = await sentence_queue.get()
                if sentence is None:
                    return
                speech_text = to_speech_text(sentence)
                if not speech_text.strip():
                    continue
                await self._wait_for_user_quiet()
                if epoch != self._epoch:
                    return
                if not tts_connected:
                    await tts.connect()
                    tts_connected = True
                if playback_start is None:
                    playback_start = asyncio.get_event_loop().time()
                self.state = "SPEAKING"
                bytes_sent = await self._speak_sentence(tts, speech_text, epoch)
                if bytes_sent:
                    any_audio = True
                    total_bytes_sent += bytes_sent

        async def on_sentence(sentence: str):
            await self._send_json({"type": "assistant_text_delta", "text": sentence})
            await sentence_queue.put(sentence)

        worker_task = asyncio.create_task(speak_worker())
        try:
            reply = await get_reply(self.session_id, user_text, on_sentence=on_sentence)
            await sentence_queue.put(None)
            await worker_task
            if epoch != self._epoch:
                # Interrupted/superseded while finishing -- a reply the user
                # cut off shouldn't be reported as completed.
                return
            # Streamed deltas are stripped and will get joined with plain
            # spaces client-side, losing paragraph breaks -- send the
            # properly-formatted canonical text too so the client can swap
            # it in once streaming completes, same layout as the typed path.
            await self._send_json(
                {"type": "assistant_done", "text": reply.text, "demo_actions": reply.demo_actions}
            )
            if not any_audio:
                logger.warning("TTS produced no audio (language=%s) for a reply", self._last_language)
            elif playback_start is not None:
                # Sarvam delivers audio far faster than real-time, so by the
                # time the last chunk has been sent the client may still be
                # partway through playing it. Sleep out whatever's left of
                # the total playback duration -- measured from when speech
                # actually started, so time already spent generating/
                # sending earlier sentences is accounted for -- so `state`
                # (and barge-in) stays accurate until the reply is actually
                # done playing. This runs once per reply now, not once per
                # sentence, so it no longer delays the next sentence.
                total_duration = total_bytes_sent / (2 * 16000)  # PCM16 mono 16kHz
                elapsed = asyncio.get_event_loop().time() - playback_start
                remaining = total_duration - elapsed
                if remaining > 0:
                    await asyncio.sleep(remaining)
        except asyncio.CancelledError:
            worker_task.cancel()
            raise
        except Exception as exc:
            logger.warning("Voice response failed (language=%s): %s", self._last_language, exc, exc_info=True)
            await self._safe_send_json({"type": "error", "message": f"voice response failed: {exc}"})
        finally:
            if not worker_task.done():
                worker_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await worker_task
            if tts_connected:
                await tts.close()
            # Only reset state if this response is still the current one --
            # a superseded response unwinding late must not flip the state
            # out from under its replacement.
            if epoch == self._epoch and self.state in ("SPEAKING", "THINKING"):
                self.state = "LISTENING"

    async def _speak_canned(self, text: str, epoch: int):
        """One-shot version of _respond for text that's already final (the
        greeting) -- no Claude call, just streams it through the same
        text-delta + TTS mechanics as a real reply."""
        self.state = "SPEAKING"
        await self._send_json({"type": "assistant_text_delta", "text": text})
        tts = SarvamTTSSession(language_code=self._last_language)
        try:
            await tts.connect()
            bytes_sent = await self._speak_sentence(tts, text, epoch)
            await self._send_json({"type": "assistant_done", "text": text, "demo_actions": []})
            if bytes_sent:
                await asyncio.sleep(bytes_sent / (2 * 16000))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Greeting TTS failed (language=%s): %s", self._last_language, exc, exc_info=True)
            await self._safe_send_json({"type": "error", "message": f"voice playback failed: {exc}"})
        finally:
            await tts.close()
            if epoch == self._epoch and self.state == "SPEAKING":
                self.state = "LISTENING"

    async def _speak_sentence(self, tts: SarvamTTSSession, sentence: str, epoch: int) -> int:
        """Sends one sentence through an already-connected TTS session and
        forwards the resulting audio to the client. Returns bytes sent.
        Stops sending the moment `epoch` is no longer current (the response
        was interrupted or superseded)."""
        await tts.send_text(sentence)
        await tts.flush()
        bytes_sent = 0
        async for chunk in tts.audio_chunks():
            if epoch != self._epoch:
                break
            await self.client_ws.send_bytes(chunk)
            bytes_sent += len(chunk)
        return bytes_sent

    async def _barge_in(self):
        # Order matters. Mute the old response first (synchronous epoch bump)
        # so no further audio can be sent, THEN tell the client to drop what
        # it has queued. Before, the interrupt went out first and the old
        # task, still running during that await, could send more chunks
        # after it -- the client had already cleared its queue, so those
        # stale chunks played anyway.
        self._epoch += 1
        await self._send_json({"type": "interrupt"})
        await self._cancel_response()
        self.state = "LISTENING"

    async def _send_json(self, payload: dict):
        await self.client_ws.send_text(json.dumps(payload))

    async def _safe_send_json(self, payload: dict):
        """Like _send_json, but swallows failures from a client that has
        already disconnected -- used in error-reporting paths where the
        disconnect itself may be what triggered the error."""
        try:
            await self._send_json(payload)
        except Exception:
            pass
