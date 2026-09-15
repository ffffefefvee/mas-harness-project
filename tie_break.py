"""
Детерминированный tie-break для равных скоров при назначении ролей.
Никогда не переспрашивает модель "выбери сама" — результат воспроизводим
между запусками, что критично при недетерминированности самих LLM (см. п.47).
"""
import hashlib

def deterministic_tiebreak(candidates, session_id):
    """
    candidates: список agent_id с равным скором
    session_id: идентификатор конкретного запуска задачи
    Возвращает единственного победителя, детерминированно для данной пары
    (candidates, session_id) — при повторном запуске с тем же session_id
    результат будет тем же самым.
    """
    def key(agent_id):
        h = hashlib.sha256(f"{session_id}:{agent_id}".encode()).hexdigest()
        return h
    return min(candidates, key=key)

if __name__ == "__main__":
    cands = ["gpt-x", "claude-y", "deepseek-z"]
    for trial in range(3):
        print(f"Запуск {trial}: победитель =", deterministic_tiebreak(cands, session_id="task-42"))
