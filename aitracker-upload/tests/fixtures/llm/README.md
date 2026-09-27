# LLM stub responses — generated, deterministic fixtures.

These files are committed so `pytest` and `/api/eval` run fully offline
with `LLM_PROVIDER=stub` (the default) or `CI_USE_STUB_LLM=true`.

Naming convention (hash = first 8 chars of the prompt's sha256):

    tests/fixtures/llm/<provider>__<model>__<hash8>.json
    {"text": "<completion>", "usage": {"prompt_tokens": ..., "completion_tokens": ...}}

Each file is a single JSON object — no wrapping array. The stub client
looks them up by that exact filename, so don't rename them.
