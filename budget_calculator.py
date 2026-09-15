
def worst_case_cost(n_agents, max_rounds, avg_tokens_in, avg_tokens_out,
                     price_in_per_1k, price_out_per_1k):
    """
    Худший случай: каждый агент участвует в каждом раунде каждого спора,
    видит полную историю (контекст растёт линейно с раундом).
    """
    total_in_tokens = 0
    total_out_tokens = 0
    for round_i in range(1, max_rounds + 1):
        # контекст на раунд = входной контекст задачи + история предыдущих раундов
        context_multiplier = round_i  # история накапливается
        total_in_tokens += n_agents * avg_tokens_in * context_multiplier
        total_out_tokens += n_agents * avg_tokens_out
    cost = (total_in_tokens/1000)*price_in_per_1k + (total_out_tokens/1000)*price_out_per_1k
    return total_in_tokens, total_out_tokens, cost

# Иллюстративный пример (цены и объёмы — условные, подставьте свои)
n_agents = 6
max_rounds = 3
avg_tokens_in = 1500   # средний размер контекста на сообщение
avg_tokens_out = 400   # средний размер ответа агента
price_in = 3.0    # $ за 1K входных токенов (условно)
price_out = 15.0  # $ за 1K выходных токенов (условно)

tin, tout, cost = worst_case_cost(n_agents, max_rounds, avg_tokens_in, avg_tokens_out, price_in, price_out)
print(f"Команда из {n_agents} агентов, до {max_rounds} раундов спора на ОДНУ задачу:")
print(f"  Входных токенов (худший случай):  {tin:,}")
print(f"  Выходных токенов (худший случай): {tout:,}")
print(f"  Стоимость одной задачи (худший случай): ${cost:,.2f}")
print()
print("Как растёт стоимость при увеличении команды/раундов (при тех же ценах):")
print(f"{'агентов':>8} | {'раундов':>8} | {'стоимость задачи, $':>20}")
for na in [3, 6, 10]:
    for mr in [1, 3, 5]:
        _, _, c = worst_case_cost(na, mr, avg_tokens_in, avg_tokens_out, price_in, price_out)
        print(f"{na:>8} | {mr:>8} | {c:>20,.2f}")

print()
print("ЗАДЕРЖКА: последовательные раунды vs параллельные (латентность одного вызова ~8с)")
latency_per_call = 8
for mr in [1, 3, 5]:
    sequential = mr * latency_per_call
    parallel = latency_per_call  # раунды логически независимы -> можно распараллелить общение внутри раунда
    print(f"  {mr} раундов: последовательно = {sequential}с, при параллелизации внутри раунда = {parallel}с (агенты в раунде не ждут друг друга)")
