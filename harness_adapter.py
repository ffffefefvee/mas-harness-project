"""
Anti-corruption layer поверх нестабильных плагинных контрактов Harness (п.51).
Вся остальная кодовая база команды агентов обращается ТОЛЬКО к этому классу,
никогда напрямую к ctx.llm / ctx.agents / ctx.tools. Если контракт Harness
изменится между версиями (developer preview), правки нужны в одном месте.
"""
from abc import ABC, abstractmethod

class HarnessGateway(ABC):
    @abstractmethod
    def call_model(self, model_id: str, messages: list) -> dict: ...

    @abstractmethod
    def spawn_subagent(self, bundle_id: str, task: dict) -> str: ...

    @abstractmethod
    def emit_event(self, session_id: str, event: dict) -> None: ...

    @abstractmethod
    def register_tool(self, tool_spec: dict) -> None: ...


class HarnessGatewayV_current(HarnessGateway):
    """
    Единственное место в кодовой базе, которое знает о текущей форме
    ctx.llm / ctx.agents / ctx.tools. При breaking change в новой версии
    Harness — правится только этот класс.
    """
    def __init__(self, ctx):
        self._ctx = ctx

    def call_model(self, model_id, messages):
        return self._ctx.llm.invoke(model=model_id, messages=messages)   # пример реального вызова

    def spawn_subagent(self, bundle_id, task):
        return self._ctx.agents.spawn(bundle=bundle_id, task=task)

    def emit_event(self, session_id, event):
        self._ctx.events.publish(session_id, event)

    def register_tool(self, tool_spec):
        self._ctx.tools.register(tool_spec)

# Вся оркестрация, планировщик, критик и т.д. зависят от абстракции HarnessGateway,
# а не от HarnessGatewayV_current — это позволяет подменить реализацию под новую
# версию Harness, не трогая остальной код (классический Dependency Inversion).
