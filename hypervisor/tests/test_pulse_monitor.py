import os
import tempfile

import pytest

from core.pulse_monitor import CoTAuditor, CognitiveSubversionError


async def _stream_tokens(chunks):
    for chunk in chunks:
        yield chunk


@pytest.mark.asyncio
async def test_cot_auditor_yields_visible_tokens_only():
    chunks = ["hello ", "<think>", "internal only", "</think>", "world"]
    auditor = CoTAuditor(_stream_tokens(chunks))

    output = []
    async for token in auditor.stream():
        output.append(token)

    assert "".join(output) == "hello world"


@pytest.mark.asyncio
async def test_cot_auditor_kill_switch_for_eval_hacking():
    chunks = ["safe ", "<think>", "we can use benchmark answer key", "</think>", "unsafe"]

    with tempfile.TemporaryDirectory() as tmpdir:
        log_path = os.path.join(tmpdir, "audit.log")
        auditor = CoTAuditor(_stream_tokens(chunks), audit_log_path=log_path)

        with pytest.raises(CognitiveSubversionError):
            async for _ in auditor.stream():
                pass

        with open(log_path, "r", encoding="utf-8") as handle:
            contents = handle.read()

    assert "Evaluation awareness" in contents


@pytest.mark.asyncio
async def test_cot_auditor_entropy_loop_detection():
    chunks = ["<think>"] + ["loop loop loop " for _ in range(8)] + ["</think>"]
    auditor = CoTAuditor(_stream_tokens(chunks), repetition_threshold=3)

    with pytest.raises(CognitiveSubversionError, match="Entropy loop"):
        async for _ in auditor.stream():
            pass
