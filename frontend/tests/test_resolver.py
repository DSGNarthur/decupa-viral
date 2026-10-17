"""Regression coverage for the hosted YouTube dependency and error contracts."""
import importlib.util
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('browser_youtube_resolver', Path(__file__).parents[1] / 'api/resolve.py')
resolver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resolver)


def test_python_function_uses_bundled_node_when_path_has_none():
    with patch.object(resolver.shutil, 'which', return_value=None):
        runtime = resolver.node_runtime()
    assert runtime and Path(runtime).is_file()


def test_video_formats_require_direct_http_media_and_word_safe_runtime():
    options = resolver.youtube_options(720, '/bundled/node')
    assert options['js_runtimes'] == {'node': {'path': '/bundled/node'}}
    assert '[protocol=https]' in options['format']
    assert options['cachedir'] is False
    assert options['extractor_args']['youtube']['player_client'] == ['tv', 'web_embedded', 'android_vr']


def test_error_identifies_access_check_without_returning_original_private_details():
    code, detail = resolver.classify_failure(Exception('Sign in to confirm you’re not a bot. signed-url-secret'))
    assert code == 'youtube_access_check'
    assert 'signed-url-secret' not in detail


def test_missing_javascript_is_not_reported_as_a_youtube_refusal():
    try:
        resolver.youtube_options(720, None)
    except RuntimeError as error:
        assert 'JavaScript' in str(error)
    else:
        raise AssertionError('The function must not run without its required runtime.')
