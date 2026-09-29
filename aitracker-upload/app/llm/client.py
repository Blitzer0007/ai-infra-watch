        return Path(settings.FIXTURES_DIR) / "llm"

    def _generate_stub(self, prompt: str, max_tokens: int, temperature: float) -> tuple[str, dict[str, int]]:
        """Deterministic canned response keyed by prompt hash.

        Fixture files live in tests/fixtures/llm/<provider>__<model>__<sha8>.json
        and are committed so stub runs are fully offline.
        """
        key = self._cache_key(prompt, max_tokens, temperature)[:8]
        pattern = f"{self.provider}__{self.model}__{key}.json"
        try:
            data = json.loads((self._fixture_dir() / pattern).read_text(encoding="utf-8"))
        except OSError:
            raise RuntimeError(
                f"Stub mode: no fixture at tests/fixtures/llm/{pattern}. "
                f"Run once with a real provider to generate, or add the fixture manually."
            ) from None
        return data["text"], data.get("usage", {"prompt_tokens": 0, "completion_tokens": 0})

    # ---- real providers ---------------------------------------------
    def _generate_remote(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
        timeout_sec: float | None = None,
        max_retries: int | None = None,
        model: str | None = None,
        reasoning_effort: str | None = None,
    ) -> tuple[str, dict[str, int]]:
        headers = {"content-type": "application/json"}
        effective_model = model or self.model
        if self.provider == "anthropic":
            url = f"{settings.ANTHROPIC_BASE_URL.rstrip('/')}/v1/messages"
            headers["x-api-key"] = self.api_key
            headers["anthropic-version"] = "2023-06-01"
            body: dict[str, Any] = {
                "model": effective_model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": [{"role": "user", "content": prompt}],
            }
            text_path = ("content", 0, "text")
            usage_path = ("usage",)
        elif self.provider == "openai":
            url = f"{settings.OPENAI_BASE_URL.rstrip('/')}/chat/completions"
            headers["authorization"] = f"Bearer {self.api_key}"
            body = {
                "model": self.model,
                "max_tokens": max_tokens,
                "temperature": temperature,