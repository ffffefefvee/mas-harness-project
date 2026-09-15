"""
Circuit breaker + graceful degradation для отказа модели/вендора (пп. 44, 45).
Стандартный паттерн отказоустойчивости распределённых систем, применённый
к вызовам моделей вместо HTTP-сервисов.
"""
import time

class ModelCircuitBreaker:
    CLOSED, OPEN, HALF_OPEN = "CLOSED", "OPEN", "HALF_OPEN"

    def __init__(self, failure_threshold=3, recovery_timeout=30, fallback_model=None):
        self.state = self.CLOSED
        self.failure_count = 0
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.last_failure_time = None
        self.fallback_model = fallback_model

    def call(self, model_fn, *args, **kwargs):
        if self.state == self.OPEN:
            if time.time() - self.last_failure_time > self.recovery_timeout:
                self.state = self.HALF_OPEN
            else:
                return self._fallback(*args, **kwargs)
        try:
            result = model_fn(*args, **kwargs)
            if self.state == self.HALF_OPEN:
                self.state = self.CLOSED
                self.failure_count = 0
            return result
        except Exception as e:
            self.failure_count += 1
            self.last_failure_time = time.time()
            if self.failure_count >= self.failure_threshold:
                self.state = self.OPEN
            return self._fallback(*args, **kwargs, error=str(e))

    def _fallback(self, *args, error=None, **kwargs):
        if self.fallback_model:
            return self.fallback_model(*args, **kwargs)
        # Graceful degradation: продолжаем с оставшейся командой,
        # явно понижая заявленный уровень уверенности в результате
        return {"degraded": True, "reason": error or "circuit open", "result": None}

if __name__ == "__main__":
    calls = {"n": 0}
    def flaky_model(x):
        calls["n"] += 1
        if calls["n"] <= 4:
            raise RuntimeError("vendor timeout")
        return f"ok:{x}"

    cb = ModelCircuitBreaker(failure_threshold=3, recovery_timeout=0.1)
    for i in range(7):
        r = cb.call(flaky_model, i)
        print(f"call {i}: state={cb.state:9s} -> {r}")
        time.sleep(0.05)
