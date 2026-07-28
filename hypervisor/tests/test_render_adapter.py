import pytest
import httpx

from src.integrations_render_adapter import RenderAdapter, RenderAdapterError, RenderJobRequest


@pytest.mark.asyncio
async def test_submit_job_success_with_injected_client():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/jobs"
        assert request.headers["Authorization"] == "Bearer key"
        return httpx.Response(200, json={"id": "job-123", "status": "queued"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="https://example.test")
    adapter = RenderAdapter(api_base="https://example.test", api_key="key", signing_key="sig", client=client)

    result = await adapter.submit_job(
        RenderJobRequest(
            model="sdxl",
            input_uri="mesh://input/1",
            callback_url="https://callback.test/render",
            params={"steps": 20},
            metadata={"intent_id": "intent-1"},
        )
    )

    assert result["job_id"] == "job-123"
    assert result["provider"] == "render"
    await client.aclose()


def test_callback_ingestion_and_signed_evidence():
    adapter = RenderAdapter(api_base="https://example.test", api_key="key", signing_key="sig")
    payload = {"job_id": "job-123", "status": "succeeded", "result_uri": "mesh://result/1", "output": {"frames": 1}}
    signature = adapter._sign_payload(payload)

    callback = adapter.ingest_callback(payload, signature)
    evidence = adapter.build_signed_evidence(callback)

    assert callback["job_id"] == "job-123"
    assert evidence["job_id"] == "job-123"
    assert isinstance(evidence["signature"], str)


def test_callback_rejects_bad_signature():
    adapter = RenderAdapter(api_base="https://example.test", api_key="key", signing_key="sig")
    with pytest.raises(RenderAdapterError, match="signature validation failed"):
        adapter.ingest_callback({"job_id": "job-1", "status": "failed"}, "bad")
