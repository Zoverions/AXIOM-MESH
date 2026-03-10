import pytest
import sys
import os

# Add hypervisor/src to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))

from memory.archive import DeepArchive

@pytest.fixture
def archive(tmp_path):
    # Use a temporary file for storage to avoid side effects
    storage_path = tmp_path / "archive.json"
    return DeepArchive(storage_path=str(storage_path))

def test_extract_keywords_basic(archive):
    text = "Hello World"
    keywords = archive._extract_keywords(text)
    assert set(keywords) == {"hello", "world"}

def test_extract_keywords_lowercase_and_punctuation(archive):
    text = "Hello, World! This is a test."
    keywords = archive._extract_keywords(text)
    # "this", "is", "a" are stopwords
    assert set(keywords) == {"hello", "world", "test"}

def test_extract_keywords_stopwords(archive):
    text = "the a an and or but in on at to for with is are was were it this that of by as"
    keywords = archive._extract_keywords(text)
    assert keywords == []

def test_extract_keywords_short_words(archive):
    text = "hi no ok yes"
    keywords = archive._extract_keywords(text)
    # "hi", "no", "ok" are <= 2 chars
    assert set(keywords) == {"yes"}

def test_extract_keywords_duplicates(archive):
    text = "test test testing testing test"
    keywords = archive._extract_keywords(text)
    assert set(keywords) == {"test", "testing"}
    assert len(keywords) == 2

def test_extract_keywords_empty_and_punctuation_only(archive):
    assert archive._extract_keywords("") == []
    assert archive._extract_keywords("!@#$%^&*()") == []
    assert archive._extract_keywords("   ") == []

def test_extract_keywords_numbers_and_underscores(archive):
    text = "var_name 123 45 6789"
    keywords = archive._extract_keywords(text)
    # "45" is length 2, so it's excluded
    assert set(keywords) == {"var_name", "123", "6789"}
