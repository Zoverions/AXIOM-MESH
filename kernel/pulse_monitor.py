import asyncio
import datetime as dt
import os
import re
import contextlib
from collections import deque
from typing import AsyncGenerator, AsyncIterable, Awaitable, Callable, Optional


class CognitiveSubversionError(RuntimeError):
    """Raised when the CoT auditor detects a subversion attempt."""


class CoTAuditor:
    """Streaming Chain-of-Thought (CoT) auditor with kill-switch enforcement."""

    _EVAL_AWARENESS_RE = re.compile(r"\b(benchmark|test\s*environment|answer\s*key|grader)\b", re.IGNORECASE)
    _AIRGAP_BYPASS_RE = re.compile(
        r"\b(ping|curl|wget|nmap|dig|nslookup|ifconfig|external\s*ip|http://|https://|socket)\b",
        re.IGNORECASE,
    )
    _GOAL_SUBVERSION_RE = re.compile(
        r"\b(ignore\s+previous|override\s+protocol|bypass\s+guard|disable\s+safety|jailbreak)\b",
        re.IGNORECASE,
    )

    def __init__(
        self,
        token_stream: AsyncIterable[str],
        *,
        thought_open_tag: str = "<think>",
        thought_close_tag: str = "</think>",
        context_purge_cb: Optional[Callable[[], Optional[Awaitable[None]]]] = None,
        friction_flag_cb: Optional[Callable[[str, str], Optional[Awaitable[None]]]] = None,
        audit_log_path: str = "hypervisor/core/secure_audit.log",
        repetition_window: int = 24,
        repetition_threshold: int = 5,
    ) -> None:
        self._token_stream = token_stream
        self._open_tag = thought_open_tag
        self._close_tag = thought_close_tag
        self._context_purge_cb = context_purge_cb
        self._friction_flag_cb = friction_flag_cb
        self._audit_log_path = audit_log_path
        self._repetition_window = repetition_window
        self._repetition_threshold = repetition_threshold

        self._context_window: deque[str] = deque(maxlen=4096)
        self._thought_buffer: list[str] = []
        self._scan_queue: asyncio.Queue[str] = asyncio.Queue()
        self._kill_switch = asyncio.Event()
        self._kill_reason = "Unknown cognitive subversion signal"

    async def stream(self) -> AsyncGenerator[str, None]:
        """Yield user-visible tokens while auditing hidden thought blocks in parallel."""
        scanner = asyncio.create_task(self._scanner_loop())
        in_thought = False
        pending = ""

        try:
            async for token in self._token_stream:
                if self._kill_switch.is_set():
                    await self._execute_kill_switch()

                if not token:
                    continue

                self._context_window.append(token)
                fragment = pending + token
                pending = ""

                while fragment:
                    tag = self._close_tag if in_thought else self._open_tag
                    idx = fragment.find(tag)

                    if idx >= 0:
                        chunk = fragment[:idx]
                        if chunk:
                            if in_thought:
                                self._submit_thought_chunk(chunk)
                            else:
                                yield chunk
                        in_thought = not in_thought
                        fragment = fragment[idx + len(tag) :]
                        continue

                    overlap = max(0, len(tag) - 1)
                    if overlap and len(fragment) > overlap:
                        body, pending = fragment[:-overlap], fragment[-overlap:]
                    else:
                        body, pending = "", fragment

                    if body:
                        if in_thought:
                            self._submit_thought_chunk(body)
                        else:
                            yield body
                    fragment = ""

                if self._kill_switch.is_set():
                    await self._execute_kill_switch()

            if pending:
                if in_thought:
                    self._submit_thought_chunk(pending)
                else:
                    yield pending

            await self._scan_queue.put("")
            await scanner

            if self._kill_switch.is_set():
                await self._execute_kill_switch()

        finally:
            if not scanner.done():
                scanner.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await scanner

    def _submit_thought_chunk(self, chunk: str) -> None:
        self._thought_buffer.append(chunk)
        try:
            self._scan_queue.put_nowait(chunk)
        except asyncio.QueueFull:
            self._kill_reason = "Scanner queue backpressure detected"
            self._kill_switch.set()

    async def _scanner_loop(self) -> None:
        rolling_tokens: deque[str] = deque(maxlen=self._repetition_window)
        frequency: dict[tuple[str, ...], int] = {}
        aggregated_text = ""

        while True:
            piece = await self._scan_queue.get()
            if piece == "":
                break

            aggregated_text = (aggregated_text + piece)[-8192:]
            if self._scan_friction_flags(aggregated_text, piece, rolling_tokens, frequency):
                self._kill_switch.set()
                break

    def _scan_friction_flags(
        self,
        thought_text: str,
        new_piece: str,
        rolling_tokens: deque[str],
        frequency: dict[tuple[str, ...], int],
    ) -> bool:
        """Return True when a thought stream pattern implies subversive reasoning."""
        if self._EVAL_AWARENESS_RE.search(thought_text):
            self._kill_reason = "Evaluation awareness pattern detected"
            return True

        if self._AIRGAP_BYPASS_RE.search(thought_text):
            self._kill_reason = "Airgap bypass attempt detected"
            return True

        if self._GOAL_SUBVERSION_RE.search(thought_text):
            self._kill_reason = "Goal subversion language detected"
            return True

        tokens = re.findall(r"\S+", new_piece.lower())
        if tokens:
            rolling_tokens.extend(tokens)
            if len(rolling_tokens) >= 3:
                window = tuple(list(rolling_tokens)[-3:])
                frequency[window] = frequency.get(window, 0) + 1
                if frequency[window] >= self._repetition_threshold:
                    self._kill_reason = f"Entropy loop detected for sequence: {' '.join(window)}"
                    return True

        return False

    async def _execute_kill_switch(self) -> None:
        await self._emit_friction_flag()
        await self._purge_active_context()
        await self._log_subversion_attempt(self._kill_reason)
        raise CognitiveSubversionError(self._kill_reason)

    async def _emit_friction_flag(self) -> None:
        if self._friction_flag_cb is None:
            return

        context_excerpt = "".join(list(self._context_window)[-64:])
        maybe_awaitable = self._friction_flag_cb(self._kill_reason, context_excerpt)
        if asyncio.iscoroutine(maybe_awaitable):
            await maybe_awaitable

    async def _purge_active_context(self) -> None:
        self._context_window.clear()
        self._thought_buffer.clear()
        if self._context_purge_cb is None:
            return

        maybe_awaitable = self._context_purge_cb()
        if asyncio.iscoroutine(maybe_awaitable):
            await maybe_awaitable

    async def _log_subversion_attempt(self, reason: str) -> None:
        ts = dt.datetime.now(dt.timezone.utc).isoformat()
        payload = f"{ts}\t{reason}\n"
        path = self._audit_log_path
        directory = os.path.dirname(path) or "."

        def _write() -> None:
            os.makedirs(directory, exist_ok=True)
            fd = os.open(path, os.O_APPEND | os.O_CREAT | os.O_WRONLY, 0o600)
            try:
                os.write(fd, payload.encode("utf-8", errors="replace"))
            finally:
                os.close(fd)

        await asyncio.to_thread(_write)
