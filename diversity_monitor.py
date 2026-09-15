import random, math
random.seed(3)

N_AGENTS = 6
N_ROUNDS = 8

def pairwise_cosine_diversity(vectors):
    """Средняя попарная (1 - косинусная схожесть) как метрика разнообразия мнений."""
    n = len(vectors)
    total, pairs = 0.0, 0
    for i in range(n):
        for j in range(i+1, n):
            dot = sum(a*b for a,b in zip(vectors[i], vectors[j]))
            norm_i = math.sqrt(sum(a*a for a in vectors[i]))
            norm_j = math.sqrt(sum(a*a for a in vectors[j]))
            cos_sim = dot/(norm_i*norm_j+1e-9)
            total += (1 - cos_sim)
            pairs += 1
    return total/pairs

DIM = 12
# Начальные позиции агентов в "пространстве мнений" — разнородные
positions = [[random.gauss(0,1) for _ in range(DIM)] for _ in range(N_AGENTS)]

diversity_over_rounds = []
for round_i in range(N_ROUNDS):
    div = pairwise_cosine_diversity(positions)
    diversity_over_rounds.append(div)
    # Симулируем конформность: каждый агент немного сдвигается к среднему мнению команды
    # (модель социального влияния из "Emergence of Biased Consensus")
    centroid = [sum(p[d] for p in positions)/N_AGENTS for d in range(DIM)]
    conformity_strength = 0.35  # сила давления к консенсусу
    positions = [
        [positions[i][d]*(1-conformity_strength) + centroid[d]*conformity_strength
         for d in range(DIM)]
        for i in range(N_AGENTS)
    ]

print("Раунд | Метрика разнообразия (0 = полный консенсус, выше = разнообразнее)")
for i, d in enumerate(diversity_over_rounds):
    bar = "#" * int(d*40)
    print(f"{i:>5} | {d:.4f} {bar}")

# Порог раннего предупреждения: например, 25% от начального разнообразия
threshold = diversity_over_rounds[0]*0.25
alarm_round = next((i for i,d in enumerate(diversity_over_rounds) if d < threshold), None)
print(f"\nПорог тревоги (25% от исходного разнообразия) = {threshold:.4f}")
print(f"Метрика пересекла порог на раунде: {alarm_round}")
