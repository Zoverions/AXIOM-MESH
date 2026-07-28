import pytest


torch = pytest.importorskip("torch")

from src.engine.polar_quant_adapter import PolarQuantQJLAdapter


def test_compress_keys_shapes_and_dtypes():
    adapter = PolarQuantQJLAdapter(head_dim=8, bits_polar=3)
    keys = torch.randn(2, 3, 5, 8)

    compressed = adapter.compress_keys(keys)

    assert compressed["radii"].shape == (2, 3, 5, 4)
    assert compressed["quantized_angles"].shape == (2, 3, 5, 4)
    assert compressed["qjl_signs"].shape == (2, 3, 5, 8)

    assert compressed["radii"].dtype == torch.float16
    assert compressed["quantized_angles"].dtype == torch.uint8
    assert compressed["qjl_signs"].dtype == torch.int8


def test_compute_attention_logits_shape():
    adapter = PolarQuantQJLAdapter(head_dim=8, bits_polar=4)
    keys = torch.randn(1, 2, 6, 8)
    query = torch.randn(1, 2, 4, 8)

    compressed = adapter.compress_keys(keys)
    logits = adapter.compute_attention_logits(query, compressed)

    assert logits.shape == (1, 2, 4, 6)


def test_requires_even_head_dim():
    with pytest.raises(ValueError, match="head_dim must be even"):
        PolarQuantQJLAdapter(head_dim=7)
