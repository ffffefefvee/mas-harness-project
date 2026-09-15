"""
Итоговый механизм назначения ролей (пп. 7, 8, 18) — по результатам
симуляции role_selection_sim2.py:
- самоотчёт НИКОГДА не используется напрямую как скор,
- используется только как один из входов для независимой рецензии,
- рецензирующая модель отличается от отчитывающейся (п.9, 14).
"""
from dataclasses import dataclass

@dataclass
class Candidate:
    agent_id: str
    historical_score: float      # исторический/бенчмарковый скор (см. п.7)
    self_report_text: str        # предложение агента — используется как ТЕКСТ для рецензии,
                                  # а не как число для скоринга

def score_role_fit(candidate: Candidate, peer_reviewer_fn, task) -> float:
    """
    peer_reviewer_fn: НЕЗАВИСИМАЯ модель (другая семья/вендор), которая
    оценивает СОДЕРЖАНИЕ self_report_text по фиксированному чек-листу
    (п.27), а не спрашивает "насколько ты уверен".
    """
    peer_score = peer_reviewer_fn(candidate.self_report_text, task)  # 0..10, независимая оценка
    # Историческая точность — якорь; рецензия — корректировка. Веса калибруются
    # отдельно на калибровочном наборе задач, а не берутся произвольно.
    W_HIST, W_PEER = 0.5, 0.5
    return W_HIST * candidate.historical_score + W_PEER * peer_score

def assign_role(candidates, peer_reviewer_fn, task, session_id):
    from tie_break import deterministic_tiebreak
    scores = {c.agent_id: score_role_fit(c, peer_reviewer_fn, task) for c in candidates}
    top_score = max(scores.values())
    top_candidates = [aid for aid, s in scores.items() if s == top_score]
    if len(top_candidates) > 1:
        return deterministic_tiebreak(top_candidates, session_id)
    return top_candidates[0]
